/** 相关网页：标签关系 + 内容相似度融合 */
import type { LibraryItem } from '../types';
import { relatedItems } from '../tagGraph';
import type { VectorIndex } from './semantic';

export interface BlendedRelated {
  item: LibraryItem;
  score: number;
  /** 共同标签 */
  shared: string[];
  /** 内容相似度（有向量时） */
  sim?: number;
}

export function blendRelated(target: LibraryItem, items: LibraryItem[], index: VectorIndex | null, limit = 8): BlendedRelated[] {
  const byKey = new Map(items.map(i => [i.key, i]));
  const merged = new Map<string, BlendedRelated>();
  for (const r of relatedItems(target, items, limit * 2)) merged.set(r.item.key, { item: r.item, score: r.score * 0.5, shared: r.shared });
  if (index?.has(target.key)) {
    // 本地向量的相似度普遍偏低，放大一点再融合
    const k = index.mode === 'local' ? 1.6 : 1;
    for (const h of index.similarTo(target.key, limit * 2)) {
      const it = byKey.get(h.key);
      if (!it) continue;
      const prev = merged.get(h.key);
      if (prev) { prev.score += h.sim * k; prev.sim = h.sim; } else merged.set(h.key, { item: it, score: h.sim * k, shared: [], sim: h.sim });
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
