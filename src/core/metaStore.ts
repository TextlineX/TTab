/** 智能数据持久化：chrome.storage.local（扩展）或 localStorage（开发） */
import { emptyMeta, type MetaState } from './types';

const KEY = 'ttab_meta_v1';
const hasChromeStorage = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function loadMeta(): Promise<MetaState> {
  try {
    let raw: unknown;
    if (hasChromeStorage()) raw = (await chrome.storage.local.get(KEY))[KEY];
    else raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return sanitizeMeta(raw);
  } catch {
    return emptyMeta();
  }
}

export async function saveMeta(state: MetaState): Promise<void> {
  try {
    if (hasChromeStorage()) await chrome.storage.local.set({ [KEY]: state });
    else localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[TTab] 保存智能数据失败', e);
  }
}

/** 其它标签页（另一个新标签页、popup）修改数据时通知 */
export function subscribeMeta(cb: (s: MetaState) => void): () => void {
  if (!hasChromeStorage() || !chrome.storage.onChanged) return () => {};
  const fn = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(sanitizeMeta(changes[KEY].newValue));
  };
  chrome.storage.onChanged.addListener(fn);
  return () => chrome.storage.onChanged.removeListener(fn);
}

/** 容错：导入文件或旧数据结构不完整时补齐 */
export function sanitizeMeta(raw: unknown): MetaState {
  const base = emptyMeta();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<MetaState>;
  const pages: MetaState['pages'] = {};
  if (r.pages && typeof r.pages === 'object') {
    for (const [k, p] of Object.entries(r.pages)) {
      if (!p || typeof p !== 'object') continue;
      const tags = Array.isArray(p.tags)
        ? p.tags.filter(t => t && typeof t.name === 'string').map(t => ({ name: t.name, source: (['manual', 'ai', 'rule'].includes(t.source) ? t.source : 'manual') as 'manual' | 'ai' | 'rule' }))
        : [];
      pages[k] = { ...p, key: k, tags };
    }
  }
  const collections = Array.isArray(r.collections)
    ? r.collections.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string')
      .map(c => ({ ...c, keys: Array.isArray(c.keys) ? c.keys : [] }))
    : [];
  return { version: 1, pages, collections };
}

/** 导出：智能数据 + 书签 URL 清单（导入到另一个浏览器时可补建缺失书签） */
export function exportPayload(state: MetaState, bookmarks: { url: string; title: string; folderPath: string[] }[]) {
  return JSON.stringify({ app: 'TTab', format: 1, exportedAt: new Date().toISOString(), meta: state, bookmarks }, null, 2);
}

export function parseImport(text: string): { meta: MetaState; bookmarks: { url: string; title: string; folderPath: string[] }[] } {
  const data = JSON.parse(text);
  if (!data || data.app !== 'TTab') throw new Error('不是 TTab 导出的文件');
  return { meta: sanitizeMeta(data.meta), bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [] };
}
