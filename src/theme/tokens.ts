/**
 * 主题色板生成：由"明/暗"和一个强调色，算出整套界面颜色（CSS 变量）。
 * 所有文字色都按 WCAG 对比度计算，换任何强调色都保证可读。
 */

export type Scheme = 'dark' | 'light';

export interface ThemeSettings {
  /** 明暗：跟随系统 / 深色 / 浅色 */
  mode: 'auto' | 'dark' | 'light';
  /** 强调色：预设色值，或 wallpaper（从壁纸取色） */
  accent: string;
  background: {
    type: 'aurora' | 'solid' | 'image' | 'bing';
    image?: string;
    /** 壁纸模糊 0~30px */
    blur: number;
    /** 壁纸遮罩 0~0.85 */
    dim: number;
  };
  density: 'comfortable' | 'compact';
  /** 字体：标题用手写体 / 全部手写体 / 全部系统字体 */
  font: 'title' | 'all' | 'none';
}

/** 预设强调色：中文色名，便于记忆 */
export const ACCENTS: { id: string; name: string; hex: string }[] = [
  { id: 'celadon', name: '青瓷', hex: '#3fb6a8' },
  { id: 'indigo', name: '靛蓝', hex: '#6d8cff' },
  { id: 'wisteria', name: '紫藤', hex: '#a07cf0' },
  { id: 'sakura', name: '樱粉', hex: '#e7799f' },
  { id: 'amber', name: '琥珀', hex: '#e3a237' },
  { id: 'pine', name: '松绿', hex: '#6aad5c' },
  { id: 'graphite', name: '石墨', hex: '#8b93a7' },
];

export const defaultTheme = (): ThemeSettings => ({
  mode: 'auto',
  accent: ACCENTS[0].hex,
  background: { type: 'aurora', blur: 0, dim: 0.35 },
  density: 'comfortable',
  font: 'title',
});

// ---------------------------------------------------------------------------
// 颜色工具
// ---------------------------------------------------------------------------
export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }

export function hexToRgb(hex: string): RGB {
  const m = hex.trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const rgbToHex = ({ r, g, b }: RGB) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

const hsl = (h: number, s: number, l: number) => rgbToHex(hslToRgb({ h: ((h % 360) + 360) % 360, s: Math.max(0, Math.min(1, s)), l: Math.max(0, Math.min(1, l)) }));

/** 相对亮度（WCAG） */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const ch = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** 调整亮度直到与背景的对比度达标（用于强调色文字） */
export function ensureContrast(fg: string, bg: string, target: number): string {
  if (contrast(fg, bg) >= target) return fg;
  const base = rgbToHsl(hexToRgb(fg));
  const darker = luminance(bg) > 0.4;
  for (let i = 1; i <= 40; i++) {
    const c = hsl(base.h, base.s, base.l + (darker ? -0.02 : 0.02) * i);
    if (contrast(c, bg) >= target) return c;
  }
  return darker ? '#000000' : '#ffffff';
}

const alpha = (hex: string, a: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${a})`;
};

// ---------------------------------------------------------------------------
// 生成主题变量
// ---------------------------------------------------------------------------
export interface ThemeTokens { vars: Record<string, string>; scheme: Scheme }

export function buildTokens(accentHex: string, scheme: Scheme): ThemeTokens {
  const a = rgbToHsl(hexToRgb(accentHex));
  const h = a.h;
  const tint = Math.min(a.s, 0.35); // 中性色只带一点点强调色的色相

  const dark = scheme === 'dark';
  const base = dark ? hsl(h, tint * 0.5, 0.07) : hsl(h, tint * 0.6, 0.955);
  const surfaceSolid = dark ? hsl(h, tint * 0.45, 0.115) : hsl(h, tint * 0.4, 0.99);
  const raisedSolid = dark ? hsl(h, tint * 0.45, 0.155) : '#ffffff';
  const text = dark ? hsl(h, 0.12, 0.93) : hsl(h, 0.25, 0.13);
  const ink = dark ? '#ffffff' : hsl(h, 0.3, 0.1);

  // 强调色：按钮底色保持原色（暗色下稍提亮），文字版保证对比度
  const accent = dark ? ensureContrast(accentHex, surfaceSolid, 3) : ensureContrast(accentHex, surfaceSolid, 3);
  const accentText = ensureContrast(accentHex, surfaceSolid, 4.5);
  const onAccent = contrast('#ffffff', accent) >= contrast(hsl(h, 0.3, 0.1), accent) ? '#ffffff' : hsl(h, 0.35, 0.1);

  const ai = dark ? '#7cc4ff' : '#1d6fc2';
  const warn = dark ? '#f5b94a' : '#a35e00';
  const danger = dark ? '#ff8a80' : '#c62828';

  const vars: Record<string, string> = {
    '--bg': base,
    '--surface': alpha(surfaceSolid, dark ? 0.66 : 0.72),
    '--surface-solid': surfaceSolid,
    '--raised': alpha(raisedSolid, dark ? 0.86 : 0.92),
    '--raised-solid': raisedSolid,
    '--fill-1': alpha(ink, dark ? 0.05 : 0.04),
    '--fill-2': alpha(ink, dark ? 0.08 : 0.065),
    '--fill-3': alpha(ink, dark ? 0.13 : 0.1),
    '--line': alpha(ink, dark ? 0.09 : 0.1),
    '--line-strong': alpha(ink, dark ? 0.2 : 0.2),
    '--text': text,
    '--muted': alpha(text, dark ? 0.62 : 0.66),
    '--faint': alpha(text, dark ? 0.4 : 0.45),
    '--accent': accent,
    '--accent-text': accentText,
    '--accent-soft': alpha(accent, dark ? 0.18 : 0.14),
    '--accent-line': alpha(accent, 0.45),
    '--on-accent': onAccent,
    '--ai': ai,
    '--ai-soft': alpha(ai, dark ? 0.16 : 0.12),
    '--on-ai': dark ? '#0c1a26' : '#ffffff',
    '--warn': warn,
    '--warn-soft': alpha(warn, dark ? 0.15 : 0.12),
    '--on-warn': dark ? '#2a1c02' : '#ffffff',
    '--danger': danger,
    '--shadow': dark ? '0 18px 50px -18px rgb(0 0 0 / 0.65)' : '0 18px 40px -20px rgb(20 30 60 / 0.28)',
    '--shadow-sm': dark ? '0 6px 18px -10px rgb(0 0 0 / 0.55)' : '0 6px 16px -10px rgb(20 30 60 / 0.22)',
    // 极光背景用的三个颜色：强调色 + 两个邻近色
    '--aurora-1': hsl(h, Math.max(a.s, 0.45), dark ? 0.45 : 0.72),
    '--aurora-2': hsl(h + 40, Math.max(a.s, 0.4), dark ? 0.4 : 0.78),
    '--aurora-3': hsl(h - 50, Math.max(a.s * 0.9, 0.35), dark ? 0.35 : 0.8),
    // 标签颜色：色相由标签名决定，明暗由主题决定（见 components/smart/tagColor.ts）
    '--scrim': dark ? 'rgb(0 0 0 / 0.5)' : 'rgb(40 34 52 / 0.22)',
    '--tag-s': dark ? '85%' : '62%',
    '--tag-l': dark ? '84%' : '34%',
    '--tag-bg-l': dark ? '60%' : '55%',
    '--tag-bg-a': dark ? '0.14' : '0.13',
    '--tag-line-a': dark ? '0.25' : '0.32',
    '--tag-solid-l': dark ? '70%' : '44%',
    '--tag-solid-text': dark ? '12%' : '98%',
    // 兼容旧变量名
    '--panel': alpha(surfaceSolid, dark ? 0.66 : 0.72),
    '--panel-solid': alpha(raisedSolid, 0.97),
  };
  return { vars, scheme };
}

/** 根据明暗设置和系统偏好得到实际使用的明暗 */
export const resolveScheme = (mode: ThemeSettings['mode'], prefersDark: boolean): Scheme =>
  mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode;

// ---------------------------------------------------------------------------
// 从图片像素取色（纯函数，输入 RGBA 数组）
// ---------------------------------------------------------------------------
export interface Palette { accent: string; average: string; brightness: number }

export function extractPalette(data: Uint8ClampedArray | number[]): Palette {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; s: number }>();
  let tr = 0, tg = 0, tb = 0, cnt = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    tr += r; tg += g; tb += b; cnt++;
    const c = rgbToHsl({ r, g, b });
    if (c.s < 0.22 || c.l < 0.18 || c.l > 0.85) continue; // 太灰、太暗、太亮的不当强调色
    const key = Math.round(c.h / 15) % 24;
    const bk = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
    bk.n++; bk.r += r; bk.g += g; bk.b += b; bk.s += c.s;
    buckets.set(key, bk);
  }
  const average = cnt ? rgbToHex({ r: tr / cnt, g: tg / cnt, b: tb / cnt }) : '#808080';
  let best: { score: number; color: string } | null = null;
  for (const bk of buckets.values()) {
    const score = bk.n * (bk.s / bk.n) ** 1.5;
    if (!best || score > best.score) best = { score, color: rgbToHex({ r: bk.r / bk.n, g: bk.g / bk.n, b: bk.b / bk.n }) };
  }
  let accent = best?.color || ACCENTS[0].hex;
  // 取到的颜色太暗或太灰时提亮、加饱和，适合做强调色
  const hs = rgbToHsl(hexToRgb(accent));
  accent = hsl(hs.h, Math.max(hs.s, 0.45), Math.min(Math.max(hs.l, 0.5), 0.62));
  return { accent, average, brightness: luminance(average) };
}
