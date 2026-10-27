/**
 * 云同步的纯函数部分：给修改盖时间戳、合并服务器返回的变化、挑出需要上传的内容。
 * 规则是"谁最后改的算谁的"（按网页、按组合），删除的组合靠墓碑传播。
 */
import type { Collection, MetaState, PageMeta } from '../types';

/** 比较前后两个状态，给变化过的网页/组合盖上时间戳，被删的组合记墓碑 */
export function stampChanges(prev: MetaState, next: MetaState, now = Date.now()): MetaState {
  if (prev === next) return next;
  let pages = next.pages;
  for (const [k, p] of Object.entries(next.pages)) {
    const old = prev.pages[k];
    if (old === p || (old && p.updatedAt !== old.updatedAt)) continue; // 没变，或者调用方已经自己写了时间
    if (pages === next.pages) pages = { ...next.pages };
    pages[k] = { ...p, updatedAt: now };
  }
  let collections = next.collections;
  const oldById = new Map(prev.collections.map(c => [c.id, c]));
  collections = next.collections.map(c => {
    const old = oldById.get(c.id);
    if (old === c || (old && c.updatedAt !== old.updatedAt)) return c;
    return { ...c, updatedAt: now };
  });
  const same = collections.every((c, i) => c === next.collections[i]);
  let tombstones = next.tombstones;
  const alive = new Set(next.collections.map(c => c.id));
  for (const c of prev.collections) {
    if (!alive.has(c.id)) tombstones = { ...(tombstones || {}), [c.id]: now };
  }
  if (tombstones) {
    for (const id of Object.keys(tombstones)) {
      if (alive.has(id) && (collections.find(c => c.id === id)?.updatedAt || 0) > tombstones[id]) {
        if (tombstones === next.tombstones) tombstones = { ...tombstones };
        delete tombstones[id];
      }
    }
  }
  if (pages === next.pages && same && tombstones === next.tombstones) return next;
  return { ...next, pages, collections: same ? next.collections : collections, ...(tombstones ? { tombstones } : {}) };
}

export interface Remote {
  pages: Record<string, Partial<PageMeta> & { key?: string }>;
  collections: Collection[];
  tombstones: Record<string, number>;
}

/** 把服务器上更新的内容合并进本机；没有变化时返回原对象 */
export function mergeRemote(local: MetaState, remote: Remote): MetaState {
  let pages = local.pages;
  for (const [key, r] of Object.entries(remote.pages || {})) {
    const lp = local.pages[key];
    const rAt = r.updatedAt || 0;
    if (lp && (lp.updatedAt || 0) >= rAt) continue;
    if (pages === local.pages) pages = { ...local.pages };
    const tags = (r.tags || []).map(t => ({ name: t.name, source: t.source }));
    pages[key] = {
      ...(lp || {}),
      key,
      tags,
      removed: r.removed,
      summary: r.summary ?? lp?.summary,
      opens: Math.max(lp?.opens || 0, r.opens || 0) || undefined,
      lastOpened: Math.max(lp?.lastOpened || 0, r.lastOpened || 0) || undefined,
      updatedAt: rAt,
    };
  }
  let collections = local.collections;
  let tombstones = local.tombstones;
  for (const [id, at] of Object.entries(remote.tombstones || {})) {
    if ((tombstones?.[id] || 0) >= at) continue;
    const c = collections.find(x => x.id === id);
    if (c && (c.updatedAt || c.createdAt || 0) > at) continue; // 本机之后又改过，保留
    if (c) collections = collections.filter(x => x.id !== id);
    tombstones = { ...(tombstones || {}), [id]: at };
  }
  for (const rc of remote.collections || []) {
    if ((tombstones?.[rc.id] || 0) >= (rc.updatedAt || 0)) continue;
    const i = collections.findIndex(c => c.id === rc.id);
    if (i >= 0) {
      if ((collections[i].updatedAt || 0) >= (rc.updatedAt || 0)) continue;
      collections = collections.map((c, j) => (j === i ? { ...rc } : c));
    } else {
      collections = [...collections, { ...rc }];
    }
  }
  if (pages === local.pages && collections === local.collections && tombstones === local.tombstones) return local;
  return { ...local, pages, collections, ...(tombstones ? { tombstones } : {}) };
}

export interface Push {
  pages: Record<string, PageMeta>;
  collections: Collection[];
  tombstones: Record<string, number>;
}

/** 自上次推送以来本机有变化的内容。没有时间戳的旧数据按"很旧"处理（时间=1），首次同步时全部上传 */
export function buildPush(meta: MetaState, since: number): Push {
  const pages: Record<string, PageMeta> = {};
  for (const [k, p] of Object.entries(meta.pages)) {
    const at = p.updatedAt ?? 1;
    if (at <= since && !(since === 0)) continue;
    if (!p.tags.length && !p.removed?.length && !p.summary && !p.opens) continue;
    pages[k] = p.updatedAt ? p : { ...p, updatedAt: 1 };
  }
  const collections = meta.collections
    .filter(c => (c.updatedAt ?? c.createdAt ?? 1) > since || since === 0)
    .map(c => (c.updatedAt ? c : { ...c, updatedAt: c.createdAt || 1 }));
  const tombstones: Record<string, number> = {};
  for (const [id, at] of Object.entries(meta.tombstones || {})) if (at > since || since === 0) tombstones[id] = at;
  return { pages, collections, tombstones };
}

export const pushSize = (p: Push) => Object.keys(p.pages).length + p.collections.length + Object.keys(p.tombstones).length;

/** 分批：服务器一次最多收 5000 个网页 */
export function chunkPush(p: Push, size = 2000): Push[] {
  const keys = Object.keys(p.pages);
  if (keys.length <= size) return [p];
  const out: Push[] = [];
  for (let i = 0; i < keys.length; i += size) {
    const pages: Record<string, PageMeta> = {};
    for (const k of keys.slice(i, i + size)) pages[k] = p.pages[k];
    out.push(i === 0 ? { ...p, pages } : { pages, collections: [], tombstones: {} });
  }
  return out;
}
