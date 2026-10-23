/**
 * 读取网页简介，给 AI 打标签提供更多信息（标题、description、关键词、正文开头）。
 * - 需要可选主机权限（用户在设置里开启"AI 读取网页简介"时授权）
 * - 不带 Cookie 请求，只读取页面开头部分；结果缓存 30 天
 * - 自动识别 GBK 等中文编码
 */

export interface PageInfo {
  title?: string;
  description?: string;
  keywords?: string;
  heading?: string;
  text?: string;
  fetchedAt: number;
  failed?: boolean;
}

const KEY = 'ttab_pageinfo_v1';
const TTL = 30 * 86400e3;
const FAIL_TTL = 3 * 86400e3;
const MAX_BYTES = 256 * 1024;
const TIMEOUT = 8000;

const decodeEntities = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

const clean = (s: string | undefined, max: number) => {
  if (!s) return undefined;
  const t = decodeEntities(s).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};

function metaContent(html: string, names: string[]): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const name = (tag.match(/\b(?:name|property)\s*=\s*["']?([^"'\s>]+)/i) || [])[1]?.toLowerCase();
    if (name && names.includes(name)) {
      const content = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
      if (content?.trim()) return content;
    }
  }
  return undefined;
}

/** 纯函数：从 HTML 中提取信息（可单测） */
export function parseHtml(html: string): Omit<PageInfo, 'fetchedAt'> {
  const head = html.slice(0, MAX_BYTES);
  const title = clean((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1], 120)
    || clean(metaContent(head, ['og:title', 'twitter:title']), 120);
  const description = clean(metaContent(head, ['description', 'og:description', 'twitter:description']), 300);
  const keywords = clean(metaContent(head, ['keywords']), 160);
  const heading = clean((head.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, ' '), 120);
  const body = (head.match(/<body[^>]*>([\s\S]*)/i) || [])[1] || '';
  const text = clean(body
    .replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '), 300);
  return { title, description, keywords, heading, text };
}

/** 从 Content-Type 或 <meta charset> 识别编码 */
export function detectCharset(contentType: string | null, firstBytes: Uint8Array): string {
  const fromHeader = contentType?.match(/charset=([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const ascii = new TextDecoder('latin1').decode(firstBytes.slice(0, 2048));
  const fromMeta = ascii.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  return (fromMeta || 'utf-8').toLowerCase();
}

export async function fetchPageInfo(url: string, fetchImpl: typeof fetch = fetch): Promise<PageInfo> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow', headers: { accept: 'text/html' } });
    if (!res.ok || !(res.headers.get('content-type') || 'text/html').includes('html')) return { fetchedAt: Date.now(), failed: true };
    // 只读开头一部分
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        size += value.length;
      }
      void reader.cancel().catch(() => {});
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      chunks.push(buf.slice(0, MAX_BYTES));
      size = Math.min(buf.length, MAX_BYTES);
    }
    const bytes = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) { bytes.set(c.slice(0, size - off), off); off += c.length; if (off >= size) break; }
    let charset = detectCharset(res.headers.get('content-type'), bytes);
    if (charset === 'gb2312') charset = 'gbk';
    let html: string;
    try { html = new TextDecoder(charset).decode(bytes); } catch { html = new TextDecoder('utf-8').decode(bytes); }
    return { ...parseHtml(html), fetchedAt: Date.now() };
  } catch {
    return { fetchedAt: Date.now(), failed: true };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 权限与缓存
// ---------------------------------------------------------------------------
const ALL_SITES = ['https://*/*', 'http://*/*'];

export async function hasPageAccess(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.contains) return false;
  try { return await chrome.permissions.contains({ origins: ALL_SITES }); } catch { return false; }
}

/** 必须在用户点击事件中同步调用 */
export function requestPageAccess(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return Promise.resolve(false);
  return chrome.permissions.request({ origins: ALL_SITES }).catch(() => false);
}

export async function revokePageAccess(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.remove) return;
  try { await chrome.permissions.remove({ origins: ALL_SITES }); } catch { /* ignore */ }
}

/** 读取已缓存的网页信息（不发请求） */
export async function loadPageInfoCache(): Promise<Record<string, PageInfo>> {
  return loadCache();
}

async function loadCache(): Promise<Record<string, PageInfo>> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) return ((await chrome.storage.local.get(KEY))[KEY] as Record<string, PageInfo> | undefined) || {};
  } catch { /* ignore */ }
  return {};
}

async function saveCache(c: Record<string, PageInfo>) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [KEY]: c });
  } catch { /* ignore */ }
}

/**
 * 批量获取网页信息（带缓存、并发限制）。没有权限时返回空对象。
 * @returns url → PageInfo
 */
export async function getPageInfos(urls: string[], opts: { concurrency?: number; signal?: AbortSignal; fetchImpl?: typeof fetch; skipPermissionCheck?: boolean } = {}): Promise<Record<string, PageInfo>> {
  if (!opts.skipPermissionCheck && !(await hasPageAccess())) return {};
  const cache = await loadCache();
  const now = Date.now();
  const out: Record<string, PageInfo> = {};
  const todo: string[] = [];
  for (const u of urls) {
    const c = cache[u];
    if (c && now - c.fetchedAt < (c.failed ? FAIL_TTL : TTL)) out[u] = c;
    else todo.push(u);
  }
  let idx = 0;
  const worker = async () => {
    while (idx < todo.length && !opts.signal?.aborted) {
      const u = todo[idx++];
      const info = await fetchPageInfo(u, opts.fetchImpl);
      out[u] = info;
      cache[u] = info;
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency || 6, todo.length) }, worker));
  if (todo.length) {
    // 控制缓存大小：最多保留 3000 条，删掉最旧的
    const entries = Object.entries(cache);
    if (entries.length > 3000) {
      entries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt).slice(0, entries.length - 3000).forEach(([k]) => delete cache[k]);
    }
    await saveCache(cache);
  }
  return out;
}

/** 给 AI 的一行摘要 */
export function describeForAI(info: PageInfo | undefined): string {
  if (!info || info.failed) return '';
  const parts = [info.description, info.keywords && `关键词:${info.keywords}`, !info.description ? info.heading || info.text : ''].filter(Boolean);
  return (parts.join(' / ') || '').slice(0, 220);
}
