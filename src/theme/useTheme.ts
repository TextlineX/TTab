/**
 * 应用主题：明暗跟随系统、强调色（含从壁纸取色）、字体与密度，
 * 结果写到 <html> 的 CSS 变量和 data 属性上，所有组件直接使用。
 */
import { useEffect, useMemo, useState } from 'react';
import { buildTokens, defaultTheme, extractPalette, resolveScheme, type Scheme, type ThemeSettings } from './tokens';

const PALETTE_KEY = 'ttab_wallpaper_palette_v1';
const BING_KEY = 'ttab_bing_daily_v1';

/** 合并默认值，并迁移旧版"壁纸"设置 */
export function normalizeTheme(raw: Partial<ThemeSettings> | undefined, legacyWallpaper?: string): ThemeSettings {
  const d = defaultTheme();
  if (!raw || typeof raw !== 'object') raw = undefined; // 旧版 theme 字段是字符串
  // 没设置过背景、但旧版设置里有壁纸：沿用旧壁纸
  if (legacyWallpaper && !raw?.background) d.background = { ...d.background, type: 'image', image: legacyWallpaper };
  return { ...d, ...(raw || {}), background: { ...d.background, ...(raw?.background || {}) } };
}

function usePrefersDark(): boolean {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(q ? q.matches : true);
  useEffect(() => {
    if (!q) return;
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    q.addEventListener('change', fn);
    return () => q.removeEventListener('change', fn);
  }, [q]);
  return dark;
}

// ---------------------------------------------------------------------------
// 必应每日一图（需要 www.bing.com 访问权限）
// ---------------------------------------------------------------------------
export async function getBingDaily(): Promise<string | null> {
  const today = new Date().toDateString();
  try {
    const cached = JSON.parse(localStorage.getItem(BING_KEY) || 'null') as { day: string; url: string } | null;
    if (cached?.day === today) return cached.url;
  } catch { /* ignore */ }
  try {
    const res = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN');
    const data = await res.json();
    const path = data?.images?.[0]?.url;
    if (!path) return null;
    const url = `https://www.bing.com${path}`;
    try { localStorage.setItem(BING_KEY, JSON.stringify({ day: today, url })); } catch { /* ignore */ }
    return url;
  } catch {
    return null;
  }
}

/** 读取图片像素并取色。远程图片先用 fetch 拿到 blob，避免画布跨域污染 */
export async function paletteFromImage(src: string) {
  let objectUrl: string | null = null;
  try {
    let url = src;
    if (/^https?:/.test(src)) {
      const blob = await (await fetch(src)).blob();
      objectUrl = URL.createObjectURL(blob);
      url = objectUrl;
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 64, 64);
    return extractPalette(ctx.getImageData(0, 0, 64, 64).data);
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export interface AppliedTheme {
  theme: ThemeSettings;
  scheme: Scheme;
  accent: string;
  /** 当前背景图（image / bing 时） */
  imageUrl: string | null;
}

export function useTheme(raw: Partial<ThemeSettings> | undefined, legacyWallpaper?: string): AppliedTheme {
  const theme = useMemo(() => normalizeTheme(raw, legacyWallpaper), [raw, legacyWallpaper]);
  const prefersDark = usePrefersDark();
  const scheme = resolveScheme(theme.mode, prefersDark);

  // 背景图地址
  const [bingUrl, setBingUrl] = useState<string | null>(null);
  useEffect(() => {
    if (theme.background.type !== 'bing') return;
    let alive = true;
    void getBingDaily().then(u => { if (alive) setBingUrl(u); });
    return () => { alive = false; };
  }, [theme.background.type]);
  const imageUrl = theme.background.type === 'image' ? theme.background.image || null : theme.background.type === 'bing' ? bingUrl : null;

  // 从壁纸取色（缓存，换壁纸才重新计算）
  const [wallAccent, setWallAccent] = useState<string | null>(() => {
    try { return (JSON.parse(localStorage.getItem(PALETTE_KEY) || 'null') as { accent: string } | null)?.accent || null; } catch { return null; }
  });
  useEffect(() => {
    if (theme.accent !== 'wallpaper' || !imageUrl) return;
    const sig = imageUrl.length > 200 ? `${imageUrl.slice(0, 80)}#${imageUrl.length}` : imageUrl;
    try {
      const cached = JSON.parse(localStorage.getItem(PALETTE_KEY) || 'null') as { sig: string; accent: string } | null;
      if (cached?.sig === sig) { setWallAccent(cached.accent); return; }
    } catch { /* ignore */ }
    let alive = true;
    void paletteFromImage(imageUrl).then(p => {
      if (!alive || !p) return;
      setWallAccent(p.accent);
      try { localStorage.setItem(PALETTE_KEY, JSON.stringify({ sig, accent: p.accent })); } catch { /* ignore */ }
    });
    return () => { alive = false; };
  }, [theme.accent, imageUrl]);

  const accent = theme.accent === 'wallpaper' ? wallAccent || defaultTheme().accent : theme.accent;

  useEffect(() => {
    const root = document.documentElement;
    const { vars } = buildTokens(accent, scheme);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset.scheme = scheme;
    root.dataset.density = theme.density;
    root.dataset.font = theme.font;
    root.style.colorScheme = scheme;
  }, [accent, scheme, theme.density, theme.font]);

  return { theme, scheme, accent, imageUrl };
}
