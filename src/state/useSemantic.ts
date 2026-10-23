/**
 * 语义层状态：选择本地向量或接口向量，后台增量生成，提供相似度索引、自动分组和查询向量。
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LibraryItem } from '../core/types';
import type { AIConfig } from '../core/ai/client';
import { uniqueByKey, usageOf } from '../core/tagGraph';
import { buildLocalModel, embedQueryLocal, toDoc, type LocalModel } from '../core/vectors/localEmbed';
import { VectorIndex, type Cluster } from '../core/vectors/semantic';
import { defaultEmbedConfig, embedModelId, embedTexts, isEmbedApiReady, resolveEmbedKey, type EmbedConfig } from '../core/vectors/embedApi';
import { coverage, indexFromStore, loadVectorStore, syncApiVectors, type StoredVectors } from '../core/vectors/vectorStore';
import { describeForAI, loadPageInfoCache } from '../core/pageInfo';

// ---------------------------------------------------------------------------
// 全局状态：设置面板也要显示进度
// ---------------------------------------------------------------------------
export interface VectorStatus {
  mode: 'local' | 'api';
  /** 接口向量覆盖了多少网页（0~1） */
  coverage: number;
  syncing: { done: number; total: number } | null;
  error: string;
}
let status: VectorStatus = { mode: 'local', coverage: 0, syncing: null, error: '' };
const listeners = new Set<() => void>();
const setStatus = (patch: Partial<VectorStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach(l => l());
};
export function useVectorStatus(): VectorStatus {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => status);
}

/** 接口向量覆盖率低于这个值时继续用本地向量，避免一半网页查不到 */
const MIN_COVERAGE = 0.8;
/** 分组最多处理的网页数（太多时取最常用和最近的） */
const CLUSTER_LIMIT = 1500;

export interface Semantic {
  index: VectorIndex | null;
  clusters: Cluster[];
  embedQuery: (text: string) => Promise<Float32Array | null>;
  resync: () => void;
}

export function useSemantic(items: LibraryItem[], embedSetting?: Partial<EmbedConfig>, chat?: Partial<AIConfig>): Semantic {
  const cfg = useMemo(() => resolveEmbedKey({ ...defaultEmbedConfig(), ...(embedSetting || {}) }, chat), [embedSetting, chat]);
  const apiReady = isEmbedApiReady(cfg);

  // 已缓存的网页简介也参与向量
  const [descs, setDescs] = useState<Record<string, string>>({});
  useEffect(() => {
    void loadPageInfoCache().then(c => {
      const m: Record<string, string> = {};
      for (const [u, info] of Object.entries(c)) { const d = describeForAI(info); if (d) m[u] = d; }
      setDescs(m);
    });
  }, []);

  // 书签或标签变化后稍等再重算，避免连续编辑时反复计算
  const [stableItems, setStableItems] = useState<LibraryItem[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setStableItems(items), stableItems.length ? 600 : 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const docs = useMemo(() => uniqueByKey(stableItems).map(i => toDoc(i, descs[i.url])), [stableItems, descs]);
  const localModel = useMemo<LocalModel | null>(() => (docs.length ? buildLocalModel(docs) : null), [docs]);

  // ------------------------------------------------------------- 接口向量
  const [store, setStore] = useState<StoredVectors | null>(null);
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!apiReady || !docs.length) { setStatus({ mode: 'local', syncing: null, error: '', coverage: 0 }); return; }
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    // 延后几秒再同步，让首屏和连续编辑先完成
    const t = setTimeout(async () => {
      try {
        const current = await loadVectorStore();
        setStore(current);
        const next = await syncApiVectors(docs, cfg, {
          signal: ctrl.signal, store: current,
          onProgress: p => setStatus({ syncing: p.total ? p : null }),
        });
        if (ctrl.signal.aborted) return;
        setStore({ ...next });
        setStatus({ syncing: null, error: '', coverage: coverage(next, docs, embedModelId(cfg)) });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setStatus({ syncing: null, error: (e as Error).message });
      }
    }, nonce ? 0 : 2500);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [apiReady, docs, cfg, nonce]);

  const keySet = useMemo(() => new Set(docs.map(d => d.key)), [docs]);
  const apiIndex = useMemo(() => {
    if (!apiReady || !store || store.model !== embedModelId(cfg)) return null;
    const idx = indexFromStore(store, keySet);
    return idx.size / (keySet.size || 1) >= MIN_COVERAGE ? idx : null;
  }, [apiReady, store, cfg, keySet]);

  const index = useMemo(() => apiIndex || (localModel ? new VectorIndex('local', localModel.vectors) : null), [apiIndex, localModel]);
  useEffect(() => { setStatus({ mode: index?.mode || 'local' }); }, [index]);

  // ------------------------------------------------------------- 自动分组（空闲时计算）
  const [clusters, setClusters] = useState<Cluster[]>([]);
  useEffect(() => {
    if (!index) { setClusters([]); return; }
    const t = setTimeout(() => {
      let pool = uniqueByKey(stableItems);
      if (pool.length > CLUSTER_LIMIT) {
        pool = [...pool].sort((a, b) => usageOf(b) - usageOf(a) || (b.dateAdded || 0) - (a.dateAdded || 0)).slice(0, CLUSTER_LIMIT);
      }
      setClusters(index.clusters(pool));
    }, 200);
    return () => clearTimeout(t);
  }, [index, stableItems]);

  // ------------------------------------------------------------- 查询向量
  const queryCache = useRef(new Map<string, Float32Array>());
  const embedQuery = useCallback(async (text: string): Promise<Float32Array | null> => {
    const q = text.trim();
    if (!q || !index) return null;
    if (index.mode === 'local') return localModel ? embedQueryLocal(localModel, q) : null;
    const cacheKey = `${index.model}|${q}`;
    const hit = queryCache.current.get(cacheKey);
    if (hit) return hit;
    try {
      const [v] = await embedTexts(cfg, [q]);
      queryCache.current.set(cacheKey, v);
      return v;
    } catch {
      return null; // 本地向量和接口向量不在同一个空间，不能混用
    }
  }, [index, localModel, cfg]);

  const resync = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    window.addEventListener('ttab_vectors_resync', resync);
    return () => window.removeEventListener('ttab_vectors_resync', resync);
  }, [resync]);
  // 返回稳定的对象，避免使用方的 effect 每次渲染都重跑
  return useMemo(() => ({ index, clusters, embedQuery, resync }), [index, clusters, embedQuery, resync]);
}
