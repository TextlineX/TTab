/**
 * 接口向量的本地存储与增量同步：
 * - 按网页文本哈希判断是否需要重新生成，只处理新增和变化的网页
 * - 换模型后旧向量作废
 * - Int8 量化存储，1000 个网页约 0.7~2MB
 */
import { docText, type DocInput } from './localEmbed';
import { dequantize, fnv1a, quantize } from './vecmath';
import { embedModelId, embedTexts, type EmbedConfig } from './embedApi';
import { VectorIndex } from './semantic';

const KEY = 'ttab_vectors_v1';
const CHUNK = 64;

export interface StoredVectors {
  model: string;
  items: Record<string, { h: number; v: string }>;
}

const empty = (model = ''): StoredVectors => ({ model, items: {} });

export async function loadVectorStore(): Promise<StoredVectors> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const v = (await chrome.storage.local.get(KEY))[KEY] as StoredVectors | undefined;
      if (v?.items) return v;
    } else {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as StoredVectors;
    }
  } catch { /* ignore */ }
  return empty();
}

async function saveVectorStore(s: StoredVectors) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [KEY]: s });
    else localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('[TTab] 保存向量失败', e);
  }
}

export async function clearVectorStore() {
  await saveVectorStore(empty());
}

export function indexFromStore(store: StoredVectors, keys?: Set<string>): VectorIndex {
  const vecs = new Map<string, Float32Array>();
  for (const [k, e] of Object.entries(store.items)) {
    if (keys && !keys.has(k)) continue;
    try { vecs.set(k, dequantize(e.v)); } catch { /* 损坏的条目跳过 */ }
  }
  return new VectorIndex('api', vecs, store.model);
}

/** 当前有多少网页的向量是最新的 */
export function coverage(store: StoredVectors, docs: DocInput[], model: string): number {
  if (store.model !== model || !docs.length) return 0;
  let ok = 0;
  for (const d of docs) if (store.items[d.key]?.h === fnv1a(docText(d))) ok++;
  return ok / docs.length;
}

export interface SyncProgress { done: number; total: number }

/** 增量生成向量，返回最新的存储 */
export async function syncApiVectors(
  docs: DocInput[], cfg: EmbedConfig,
  opts: { signal?: AbortSignal; onProgress?: (p: SyncProgress) => void; fetchImpl?: typeof fetch; store?: StoredVectors; persist?: boolean } = {},
): Promise<StoredVectors> {
  const model = embedModelId(cfg);
  let store = opts.store || await loadVectorStore();
  if (store.model !== model) store = empty(model);
  const alive = new Set(docs.map(d => d.key));
  let pruned = false;
  for (const k of Object.keys(store.items)) if (!alive.has(k)) { delete store.items[k]; pruned = true; }

  const todo = docs.map(d => ({ d, text: docText(d) })).map(x => ({ ...x, h: fnv1a(x.text) }))
    .filter(x => store.items[x.d.key]?.h !== x.h);
  const total = todo.length;
  opts.onProgress?.({ done: 0, total });
  for (let i = 0; i < todo.length; i += CHUNK) {
    if (opts.signal?.aborted) break;
    const chunk = todo.slice(i, i + CHUNK);
    const vecs = await embedTexts(cfg, chunk.map(c => c.text), { signal: opts.signal, fetchImpl: opts.fetchImpl });
    chunk.forEach((c, j) => { store.items[c.d.key] = { h: c.h, v: quantize(vecs[j]) }; });
    if (opts.persist !== false) await saveVectorStore(store);
    opts.onProgress?.({ done: Math.min(i + CHUNK, total), total });
  }
  if (!total && pruned && opts.persist !== false) await saveVectorStore(store);
  return store;
}
