/**
 * 标签关系引擎（纯本地计算，无需 AI）
 * - 标签统计与共现
 * - 相关标签推荐：选中若干标签后，推荐"继续筛选"的标签
 * - 相关网页：基于标签 TF-IDF 余弦相似度 + 同域名/同文件夹加权
 * - 推荐组合：频繁出现的标签组合（2~3 个标签）→ 一键成组
 * - 智能视图：常用、最近添加、未打标签、重复书签
 */
import type { LibraryItem } from './types';

export interface TagStat { tag: string; count: number }

export function tagCounts(items: LibraryItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of uniqueByKey(items)) for (const t of it.tags) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

export function topTags(items: LibraryItem[], limit = 40): TagStat[] {
  return [...tagCounts(items).entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/** 同一 URL 可能被收藏多次，统计时只算一次 */
export function uniqueByKey(items: LibraryItem[]): LibraryItem[] {
  const seen = new Set<string>();
  return items.filter(it => (seen.has(it.key) ? false : (seen.add(it.key), true)));
}

export interface RelatedTag {
  tag: string;
  /** 在当前结果中出现的次数 */
  count: number;
  score: number;
  /** 选择它是否能进一步缩小结果 */
  narrows: boolean;
}

/** 已选标签 → 推荐相关标签 */
export function relatedTags(selected: string[], items: LibraryItem[], limit = 12): RelatedTag[] {
  const all = uniqueByKey(items);
  const N = all.length || 1;
  const global = tagCounts(all);
  const scope = selected.length ? all.filter(it => selected.every(t => it.tags.includes(t))) : all;
  const S = scope.length;
  if (!S) return [];
  const local = new Map<string, number>();
  for (const it of scope) for (const t of it.tags) if (!selected.includes(t)) local.set(t, (local.get(t) || 0) + 1);
  const out: RelatedTag[] = [];
  for (const [tag, c] of local) {
    const g = global.get(tag) || c;
    const idf = Math.log(1 + N / g);
    // 置信度 × 区分度；没有选中标签时退化为热门度
    const score = selected.length ? (c / S) * idf * Math.log(1 + c) : c;
    out.push({ tag, count: c, score, narrows: c < S });
  }
  return out.sort((a, b) => b.score - a.score || b.count - a.count).slice(0, limit);
}

export interface RelatedItem { item: LibraryItem; score: number; shared: string[] }

/** 与某个网页最相关的其它网页 */
export function relatedItems(target: LibraryItem, items: LibraryItem[], limit = 8): RelatedItem[] {
  const all = uniqueByKey(items);
  const N = all.length || 1;
  const df = tagCounts(all);
  const w = (t: string) => Math.log(1 + N / (df.get(t) || 1));
  const norm = (tags: string[]) => Math.sqrt(tags.reduce((s, t) => s + w(t) ** 2, 0)) || 1;
  const tn = norm(target.tags);
  const out: RelatedItem[] = [];
  for (const it of all) {
    if (it.key === target.key) continue;
    const shared = it.tags.filter(t => target.tags.includes(t));
    let score = shared.reduce((s, t) => s + w(t) ** 2, 0) / (tn * norm(it.tags));
    if (it.domain && it.domain === target.domain) score += 0.25;
    if (it.folderPath.length && it.folderPath.join('/') === target.folderPath.join('/')) score += 0.1;
    if (score > 0.05) out.push({ item: it, score, shared });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface Combo {
  id: string;
  tags: string[];
  keys: string[];
  score: number;
}

/**
 * 推荐组合：找出经常一起出现、且能形成有意义子集的标签组合。
 * 例如 "前端 + 文档"、"AI + AI 对话"、"设计 + 灵感"。
 */
export function suggestCombos(items: LibraryItem[], limit = 8): Combo[] {
  const all = uniqueByKey(items);
  const N = all.length;
  if (N < 3) return [];
  const minSupport = N < 40 ? 2 : N < 200 ? 3 : 4;
  const tagItems = new Map<string, Set<string>>();
  for (const it of all) for (const t of it.tags) {
    if (!tagItems.has(t)) tagItems.set(t, new Set());
    tagItems.get(t)!.add(it.key);
  }
  // 太泛的标签（覆盖超过 60%）不参与组合，避免"开发 + 一切"
  const tags = [...tagItems.keys()].filter(t => {
    const c = tagItems.get(t)!.size;
    return c >= minSupport && c <= Math.max(minSupport, N * 0.6);
  });
  const inter = (a: Set<string>, b: Set<string>) => {
    const out = new Set<string>();
    for (const x of a) if (b.has(x)) out.add(x);
    return out;
  };
  const candidates: Combo[] = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const A = tagItems.get(tags[i])!;
      const B = tagItems.get(tags[j])!;
      const AB = inter(A, B);
      if (AB.size < minSupport) continue;
      // 组合必须比两个单标签都"更具体"，否则等于单标签，没有意义
      if (AB.size === A.size && AB.size === B.size) continue;
      const lift = (AB.size * N) / (A.size * B.size);
      if (lift < 1.1) continue;
      const score = AB.size * Math.log(1 + lift);
      candidates.push({ id: `${tags[i]}+${tags[j]}`, tags: [tags[i], tags[j]], keys: [...AB], score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // 尝试把强组合扩展到三个标签
  const extended: Combo[] = [];
  for (const c of candidates.slice(0, 10)) {
    const set = new Set(c.keys);
    let best: Combo | null = null;
    for (const t of tags) {
      if (c.tags.includes(t)) continue;
      const S3 = inter(set, tagItems.get(t)!);
      if (S3.size >= minSupport && S3.size < set.size && S3.size >= set.size * 0.5) {
        const score = S3.size * Math.log(1 + (S3.size * N) / (set.size * tagItems.get(t)!.size)) * 1.1;
        if (!best || score > best.score) best = { id: [...c.tags, t].join('+'), tags: [...c.tags, t], keys: [...S3], score };
      }
    }
    if (best) extended.push(best);
  }

  // 精简：如果组合里某个标签被其余标签蕴含（如"前端"都属于"开发"），去掉它
  const minimize = (c: Combo): Combo | null => {
    let tagsLeft = [...c.tags];
    for (const t of c.tags) {
      const others = tagsLeft.filter(x => x !== t);
      if (!others.length) continue;
      let set = new Set(tagItems.get(others[0])!);
      for (const o of others.slice(1)) set = inter(set, tagItems.get(o)!);
      const tSet = tagItems.get(t)!;
      if ([...set].every(k => tSet.has(k))) tagsLeft = others;
    }
    if (tagsLeft.length < 2) return null;
    return { ...c, id: tagsLeft.join('+'), tags: tagsLeft };
  };

  // 去重：标签相同或成员高度重合的组合只保留得分高的
  const result: Combo[] = [];
  const jaccard = (a: string[], b: string[]) => {
    const sb = new Set(b);
    const i = a.filter(x => sb.has(x)).length;
    return i / (a.length + b.length - i || 1);
  };
  for (const raw of [...candidates, ...extended].sort((a, b) => b.score - a.score)) {
    const c = minimize(raw);
    if (!c) continue;
    if (result.some(r => r.id === c.id || jaccard(r.keys, c.keys) > 0.8)) continue;
    result.push(c);
    if (result.length >= limit) break;
  }
  return result;
}

export interface SmartView {
  id: 'now' | 'frequent' | 'recent' | 'untagged' | 'duplicates';
  keys: string[];
  /** 重复书签视图需要书签 id（同 URL 多条） */
  ids?: string[];
}

/** 使用频率：浏览历史访问次数 + 通过 TTab 打开的次数（加权） */
export const usageOf = (i: LibraryItem) => i.visits + i.opens * 2;

export function smartViews(items: LibraryItem[], now = Date.now()): SmartView[] {
  const uniq = uniqueByKey(items);
  const frequent = uniq.filter(i => usageOf(i) > 0)
    .sort((a, b) => usageOf(b) - usageOf(a) || Math.max(b.lastVisit || 0, b.lastOpened || 0) - Math.max(a.lastVisit || 0, a.lastOpened || 0))
    .slice(0, 16);
  // "此刻常用"：与"常用"明显不同时才有意义，至少要有几个有分数的网页
  const nowList = uniq.filter(i => i.nowScore > 0).sort((a, b) => b.nowScore - a.nowScore).slice(0, 12);
  const nowKeys = nowList.length >= 4 ? nowList.map(i => i.key) : [];
  const recent = uniq.filter(i => i.dateAdded && now - i.dateAdded < 30 * 86400e3).sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)).slice(0, 20);
  const untagged = uniq.filter(i => i.tags.length === 0);
  const byKey = new Map<string, LibraryItem[]>();
  for (const it of items) byKey.set(it.key, [...(byKey.get(it.key) || []), it]);
  const dups = [...byKey.values()].filter(v => v.length > 1);
  return [
    { id: 'now', keys: nowKeys },
    { id: 'frequent', keys: frequent.map(i => i.key) },
    { id: 'recent', keys: recent.map(i => i.key) },
    { id: 'untagged', keys: untagged.map(i => i.key) },
    { id: 'duplicates', keys: dups.map(v => v[0].key), ids: dups.flatMap(v => v.slice(1).map(i => i.id)) },
  ];
}
