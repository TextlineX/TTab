/**
 * 智能数据的纯函数操作。所有函数都返回新的 MetaState，不修改入参，方便撤销。
 */
import type { BookmarkRecord, Collection, LibraryItem, MetaState, PageMeta, TagEntry, TagQuery, TagSource } from './types';
import { normalizeTag, uniqTags } from './normalize';
import { nowScore, type UsageState } from './usage';
import { inferRuleTags } from './ruleTagger';

const SOURCE_RANK: Record<TagSource, number> = { manual: 4, ai: 3, cloud: 2, rule: 1 };

const clonePage = (state: MetaState, key: string): PageMeta => {
  const p = state.pages[key];
  return p ? { ...p, tags: [...p.tags], removed: p.removed ? [...p.removed] : undefined } : { key, tags: [] };
};

/** 往一个（已克隆的）网页上加标签，原地修改 */
function addToPage(page: PageMeta, clean: string[], source: TagSource) {
  for (const name of clean) {
    if (source !== 'manual' && page.removed?.includes(name)) continue;
    const existing = page.tags.find(t => t.name === name);
    if (existing) {
      if (SOURCE_RANK[source] > SOURCE_RANK[existing.source]) existing.source = source;
    } else {
      page.tags.push({ name, source });
    }
    if (source === 'manual' && page.removed) page.removed = page.removed.filter(r => r !== name);
  }
  page.tags = page.tags.map(t => ({ ...t }));
}

/** 给多个网页加标签。自动来源（ai/rule）不会加回用户手动删除过的标签 */
export function addTags(state: MetaState, keys: string[], tags: string[], source: TagSource): MetaState {
  const clean = uniqTags(tags);
  if (!clean.length || !keys.length) return state;
  const pages = { ...state.pages };
  for (const key of keys) {
    const page = clonePage(state, key);
    addToPage(page, clean, source);
    pages[key] = page;
  }
  return { ...state, pages };
}

/** 移除标签，并记住"用户不想要这个标签" */
export function removeTags(state: MetaState, keys: string[], tags: string[]): MetaState {
  const clean = uniqTags(tags);
  if (!clean.length) return state;
  const pages = { ...state.pages };
  for (const key of keys) {
    if (!state.pages[key]) continue;
    const page = clonePage(state, key);
    page.tags = page.tags.filter(t => !clean.includes(t.name));
    page.removed = uniqTags([...(page.removed || []), ...clean]);
    pages[key] = page;
  }
  return { ...state, pages };
}

/** 用一组手动标签整体替换（标签编辑器使用） */
export function setManualTags(state: MetaState, key: string, tags: string[]): MetaState {
  const clean = uniqTags(tags);
  const page = clonePage(state, key);
  const before = page.tags.map(t => t.name);
  const dropped = before.filter(n => !clean.includes(n));
  const kept: TagEntry[] = clean.map(name => {
    const old = page.tags.find(t => t.name === name);
    return old ? { ...old } : { name, source: 'manual' as TagSource };
  });
  page.tags = kept;
  page.removed = uniqTags([...(page.removed || []).filter(r => !clean.includes(r)), ...dropped]);
  return { ...state, pages: { ...state.pages, [key]: page } };
}

/** 重命名/合并标签：from 全部替换为 to */
export function renameTag(state: MetaState, from: string, to: string): MetaState {
  const f = normalizeTag(from);
  const t = normalizeTag(to);
  if (!f || !t || f === t) return state;
  const pages: Record<string, PageMeta> = {};
  for (const [key, p] of Object.entries(state.pages)) {
    if (!p.tags.some(x => x.name === f)) { pages[key] = p; continue; }
    const tags: TagEntry[] = [];
    for (const x of p.tags) {
      const name = x.name === f ? t : x.name;
      const dup = tags.find(y => y.name === name);
      if (dup) {
        if (SOURCE_RANK[x.source] > SOURCE_RANK[dup.source]) dup.source = x.source;
      } else tags.push({ name, source: x.source });
    }
    pages[key] = { ...p, tags };
  }
  const collections = state.collections.map(c => c.query
    ? { ...c, query: { ...c.query, tags: uniqTags(c.query.tags.map(x => (x === f ? t : x))) } }
    : c);
  return { ...state, pages, collections };
}

/** 从所有网页删除某个标签 */
export function deleteTagEverywhere(state: MetaState, tag: string): MetaState {
  const n = normalizeTag(tag);
  const keys = Object.values(state.pages).filter(p => p.tags.some(t => t.name === n)).map(p => p.key);
  return removeTags(state, keys, [n]);
}

export function setSummary(state: MetaState, key: string, summary: string): MetaState {
  const page = clonePage(state, key);
  page.summary = summary.trim().slice(0, 200) || undefined;
  return { ...state, pages: { ...state.pages, [key]: page } };
}

export function markTagged(state: MetaState, keys: string[], kind: 'ai' | 'rule', at = Date.now()): MetaState {
  const pages = { ...state.pages };
  for (const key of keys) {
    const page = clonePage(state, key);
    if (kind === 'ai') page.aiTaggedAt = at; else page.ruleTaggedAt = at;
    pages[key] = page;
  }
  return { ...state, pages };
}

export function recordOpen(state: MetaState, keys: string[], at = Date.now()): MetaState {
  const pages = { ...state.pages };
  for (const key of keys) {
    const page = clonePage(state, key);
    page.opens = (page.opens || 0) + 1;
    page.lastOpened = at;
    pages[key] = page;
  }
  return { ...state, pages };
}

let idSeq = 0;
export const newId = () => `c_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;

export function upsertCollection(state: MetaState, input: Omit<Collection, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): MetaState {
  const id = input.id || newId();
  const col: Collection = {
    ...input,
    id,
    name: input.name.trim().slice(0, 40) || '未命名组合',
    keys: [...new Set(input.keys)],
    query: input.query ? { ...input.query, tags: uniqTags(input.query.tags) } : undefined,
    createdAt: input.createdAt || Date.now(),
  };
  const exists = state.collections.some(c => c.id === id);
  const collections = exists
    ? state.collections.map(c => (c.id === id ? col : c))
    : [col, ...state.collections];
  return { ...state, collections };
}

export function deleteCollection(state: MetaState, id: string): MetaState {
  return { ...state, collections: state.collections.filter(c => c.id !== id) };
}

/** 把书签记录和智能数据合成 UI 条目 */
export function buildItems(records: BookmarkRecord[], state: MetaState, usage?: UsageState, now = new Date()): LibraryItem[] {
  return records.map(r => {
    const p = state.pages[r.key];
    const u = usage?.entries[r.key];
    const opens = p?.opens || 0;
    return {
      ...r,
      tags: p ? p.tags.map(t => t.name) : [],
      tagEntries: p ? p.tags : [],
      summary: p?.summary,
      opens,
      lastOpened: p?.lastOpened,
      visits: u?.visits || 0,
      lastVisit: u?.last,
      nowScore: nowScore(u, opens, now),
    };
  });
}

export function matchQuery(item: { tags: string[] }, q: TagQuery): boolean {
  if (!q.tags.length) return true;
  return q.mode === 'and'
    ? q.tags.every(t => item.tags.includes(t))
    : q.tags.some(t => item.tags.includes(t));
}

/** 解析集合成员：静态成员 + 动态查询命中 */
export function resolveCollection(col: Collection, items: LibraryItem[]): LibraryItem[] {
  const keySet = new Set(col.keys);
  const seen = new Set<string>();
  const out: LibraryItem[] = [];
  for (const it of items) {
    if (seen.has(it.key)) continue;
    if (keySet.has(it.key) || (col.query && matchQuery(it, col.query))) {
      seen.add(it.key);
      out.push(it);
    }
  }
  return out;
}

/** 去掉已经不存在于书签里的数据（可选的清理操作） */
export function pruneOrphans(state: MetaState, records: BookmarkRecord[]): MetaState {
  const alive = new Set(records.map(r => r.key));
  const pages: Record<string, PageMeta> = {};
  for (const [k, v] of Object.entries(state.pages)) if (alive.has(k)) pages[k] = v;
  const collections = state.collections.map(c => ({ ...c, keys: c.keys.filter(k => alive.has(k)) }));
  return { ...state, pages, collections };
}

/** 导入时合并：手动标签与集合都保留，冲突时以导入方为准 */
export function mergeMeta(base: MetaState, incoming: MetaState): MetaState {
  let state = base;
  for (const p of Object.values(incoming.pages || {})) {
    for (const src of ['rule', 'cloud', 'ai', 'manual'] as TagSource[]) {
      const names = p.tags.filter(t => t.source === src).map(t => t.name);
      if (names.length) state = addTags(state, [p.key], names, src);
    }
    const page = clonePage(state, p.key);
    page.summary = p.summary || page.summary;
    page.opens = Math.max(page.opens || 0, p.opens || 0);
    page.lastOpened = Math.max(page.lastOpened || 0, p.lastOpened || 0) || undefined;
    page.removed = uniqTags([...(page.removed || []), ...(p.removed || [])]).filter(r => !page.tags.some(t => t.name === r));
    state = { ...state, pages: { ...state.pages, [p.key]: page } };
  }
  for (const c of incoming.collections || []) state = upsertCollection(state, c);
  return state;
}

/** 给还没被规则处理过的书签自动打上规则标签（离线、瞬间完成；一次性复制，5000 个书签也是毫秒级） */
export function applyRuleTags(meta: MetaState, records: BookmarkRecord[]): MetaState {
  let pages: Record<string, PageMeta> | null = null;
  const seen = new Set<string>();
  const at = Date.now();
  for (const r of records) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    if (meta.pages[r.key]?.ruleTaggedAt) continue;
    if (!pages) pages = { ...meta.pages };
    const page = clonePage(meta, r.key);
    addToPage(page, uniqTags(inferRuleTags(r)), 'rule');
    page.ruleTaggedAt = at;
    pages[r.key] = page;
  }
  return pages ? { ...meta, pages } : meta;
}
