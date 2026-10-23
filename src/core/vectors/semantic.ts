/**
 * 语义索引：相关网页、意思相近搜索、按内容自动分组。
 * 本地向量和接口向量的相似度分布不同，阈值分开设置。
 */
import type { LibraryItem } from '../types';
import { dot, kmeans } from './vecmath';
import { tagCounts, uniqueByKey } from '../tagGraph';
import { isGenericFolder } from '../ruleTagger';

export type VectorMode = 'local' | 'api';

const THRESHOLDS: Record<VectorMode, { related: number; search: number; cohesion: number; member: number }> = {
  local: { related: 0.15, search: 0.2, cohesion: 0.22, member: 0.18 },
  api: { related: 0.45, search: 0.35, cohesion: 0.6, member: 0.6 },
};

export interface Hit { key: string; sim: number }

export interface Cluster {
  id: string;
  label: string;
  tags: string[];
  keys: string[];
  cohesion: number;
}

export class VectorIndex {
  readonly mode: VectorMode;
  readonly model: string;
  private vecs: Map<string, Float32Array>;

  constructor(mode: VectorMode, vecs: Map<string, Float32Array>, model: string = mode) {
    this.mode = mode;
    this.vecs = vecs;
    this.model = model;
  }

  get size() { return this.vecs.size; }
  get thresholds() { return THRESHOLDS[this.mode]; }
  has(key: string) { return this.vecs.has(key); }
  vector(key: string) { return this.vecs.get(key); }

  /** 与某个网页最相似的网页 */
  similarTo(key: string, k = 8): Hit[] {
    const v = this.vecs.get(key);
    if (!v) return [];
    return this.search(v, k + 1, this.thresholds.related).filter(h => h.key !== key).slice(0, k);
  }

  search(q: Float32Array, k = 10, min = this.thresholds.search): Hit[] {
    const hits: Hit[] = [];
    for (const [key, v] of this.vecs) {
      const sim = dot(q, v);
      if (sim >= min) hits.push({ key, sim });
    }
    return hits.sort((a, b) => b.sim - a.sim).slice(0, k);
  }

  /**
   * 按内容自动分组。只保留足够紧密（成员彼此相似）、大小合适的组，
   * 组名取组内最有代表性的标签。
   */
  clusters(items: LibraryItem[], maxClusters = 8): Cluster[] {
    const uniq = uniqueByKey(items).filter(i => this.vecs.has(i.key));
    const n = uniq.length;
    if (n < 6) return [];
    const vecs = uniq.map(i => this.vecs.get(i.key)!);
    const groups = n <= NEIGHBOR_LIMIT ? this.neighborGroups(vecs) : this.kmeansGroups(vecs);
    const global = tagCounts(uniq);
    const out: Cluster[] = [];
    for (const g of groups) {
      if (g.idx.length < 3 || g.idx.length > n * 0.6) continue;
      if (g.cohesion < this.thresholds.cohesion) continue;
      const members = g.idx.map(i => uniq[i]);
      // 代表性标签：组内覆盖率高、且相对全局更集中
      const local = tagCounts(members);
      const ranked = [...local.entries()]
        .filter(([, cnt]) => cnt / members.length >= 0.34)
        .map(([tag, cnt]) => ({ tag, score: (cnt / members.length) * Math.log(1 + n / (global.get(tag) || 1)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(x => x.tag);
      // 说不出共同点的组（没有代表性标签、也没有共同文件夹）就不展示
      const folder = mostCommon(members.map(m => m.folderPath.filter(f => !isGenericFolder(f)).slice(-1)[0]).filter(Boolean) as string[]);
      if (!ranked.length && !folder) continue;
      const label = ranked.length ? ranked.join(' + ') : folder!;
      out.push({ id: `cl_${members[0].key}`, label, tags: ranked, keys: members.map(m => m.key), cohesion: g.cohesion });
    }
    return out.sort((a, b) => b.cohesion * Math.log(1 + b.keys.length) - a.cohesion * Math.log(1 + a.keys.length)).slice(0, maxClusters);
  }

  /**
   * 邻域分组（书签不多时使用，结果稳定）：
   * 从"相似邻居最多"的网页开始，只吸收与组内其他成员平均足够相似的网页。
   */
  private neighborGroups(vecs: Float32Array[]): { idx: number[]; cohesion: number }[] {
    const n = vecs.length;
    const T = this.thresholds.member;
    const sim = new Float32Array(n * n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = dot(vecs[i], vecs[j]); sim[i * n + j] = s; sim[j * n + i] = s; }
    const neighbors = Array.from({ length: n }, (_, i) => {
      const list: number[] = [];
      for (let j = 0; j < n; j++) if (j !== i && sim[i * n + j] >= T) list.push(j);
      return list.sort((a, b) => sim[i * n + b] - sim[i * n + a]);
    });
    const order = [...Array(n).keys()].sort((a, b) => neighbors[b].length - neighbors[a].length);
    const used = new Uint8Array(n);
    const groups: { idx: number[]; cohesion: number }[] = [];
    for (const seed of order) {
      if (used[seed] || neighbors[seed].length < 2) continue;
      const members = [seed];
      for (const j of neighbors[seed]) {
        if (used[j]) continue;
        const avg = members.reduce((acc, m) => acc + sim[m * n + j], 0) / members.length;
        if (avg >= T * 0.85) members.push(j);
      }
      if (members.length < 3) continue;
      members.forEach(m => { used[m] = 1; });
      let total = 0, pairs = 0;
      for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) { total += sim[members[a] * n + members[b]]; pairs++; }
      groups.push({ idx: members, cohesion: pairs ? total / pairs : 0 });
    }
    return groups;
  }

  /** k-means 分组（书签很多时使用） */
  private kmeansGroups(vecs: Float32Array[]): { idx: number[]; cohesion: number }[] {
    const n = vecs.length;
    const k = Math.max(3, Math.min(20, Math.round(Math.sqrt(n / 2))));
    const { assign, sims } = kmeans(vecs, k);
    const groups: { idx: number[]; cohesion: number }[] = [];
    for (let c = 0; c < k; c++) {
      // 离中心太远的成员（只是被"分配"过来的）不算进这个组
      const idx: number[] = [];
      for (let i = 0; i < n; i++) if (assign[i] === c && sims[i] >= this.thresholds.member + 0.1) idx.push(i);
      idx.sort((a, b) => sims[b] - sims[a]);
      // 与中心的相似度比两两相似度高，这里换算成大致可比的数值
      const centerSim = idx.reduce((s, i) => s + sims[i], 0) / (idx.length || 1);
      groups.push({ idx, cohesion: centerSim * centerSim });
    }
    return groups;
  }
}

/** 书签数量在这个以内用邻域分组，超过用 k-means */
const NEIGHBOR_LIMIT = 700;

function mostCommon(list: string[]): string | undefined {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  let best: string | undefined, bc = 1;
  for (const [k, c] of m) if (c > bc) { best = k; bc = c; }
  return best;
}
