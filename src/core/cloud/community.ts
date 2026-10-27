/**
 * 社区标签：不上传网址，只上传网址的 SHA-256 哈希和标签；
 * 比对时也只发哈希，所以服务器不知道你收藏了什么，只知道"有多少人给同一个哈希打了这个标签"。
 */
import type { MetaState, PageMeta } from '../types';
import { getDomain, normalizeTag, uniqTags } from '../normalize';
import { cloudRequest } from './api';
import type { CloudConfig } from './config';

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

export interface HashedKey { key: string; h: string; d: string }

export async function hashKeys(keys: string[]): Promise<HashedKey[]> {
  const doms = new Map<string, string>();
  const out: HashedKey[] = [];
  for (const key of keys) {
    const dom = getDomain(key);
    if (dom && !doms.has(dom)) doms.set(dom, await sha256Hex(`d:${dom}`));
    out.push({ key, h: await sha256Hex(`p:${key}`), d: doms.get(dom) || '' });
  }
  return out;
}

/** 只贡献用户亲手打的标签（手动），最多 5 个 */
export function contributable(meta: MetaState): { key: string; tags: string[] }[] {
  const out: { key: string; tags: string[] }[] = [];
  for (const p of Object.values(meta.pages)) {
    const tags = p.tags.filter(t => t.source === 'manual').map(t => t.name).slice(0, 5);
    if (tags.length) out.push({ key: p.key, tags });
  }
  return out;
}

export async function contribute(cfg: CloudConfig, meta: MetaState): Promise<number> {
  const list = contributable(meta);
  let n = 0;
  for (let i = 0; i < list.length; i += 500) {
    const part = list.slice(i, i + 500);
    const hashed = await hashKeys(part.map(x => x.key));
    const items = hashed.map((h, j) => ({ h: h.h, d: h.d || undefined, tags: part[j].tags }));
    const r = await cloudRequest<{ accepted: number }>(cfg, 'POST', '/api/contribute', { items });
    n += r.accepted;
  }
  return n;
}

export type Suggestions = Record<string, { page: { t: string; n: number }[]; domain: { t: string; n: number }[] }>;

export interface Proposal {
  key: string;
  add: string[];
  /** 与社区共识不符的自动标签（只会建议移除 AI/规则打的，从不动手动标签） */
  remove: string[];
  /** 社区里有几个人支持新增的标签 */
  votes: number;
}

export function buildProposals(meta: MetaState, hashed: HashedKey[], s: Suggestions): Proposal[] {
  const out: Proposal[] = [];
  for (const { key, h } of hashed) {
    const sug = s[h];
    if (!sug) continue;
    const page = meta.pages[key];
    if (page?.tags.some(t => t.source === 'manual')) continue; // 用户自己整理过的不动
    const have = new Set((page?.tags || []).map(t => t.name));
    const removed = new Set(page?.removed || []);
    const pageTags = uniqTags(sug.page.map(x => x.t));
    // 网页级共识太少时，用整个站点的共识兜底，但最多 2 个
    const consensus = pageTags.length ? pageTags : uniqTags(sug.domain.map(x => x.t)).slice(0, 2);
    const votes = Math.max(0, ...sug.page.map(x => x.n), ...sug.domain.map(x => x.n));
    const add = consensus.filter(t => !have.has(t) && !removed.has(t));
    const strong = pageTags.length >= 2;
    const remove = strong
      ? (page?.tags || []).filter(t => (t.source === 'ai' || t.source === 'rule') && !consensus.includes(t.name)).map(t => t.name)
      : [];
    if (add.length || remove.length) out.push({ key, add, remove, votes });
  }
  return out;
}

/** 应用比对结果：新增的标签来源记为"云端"；移除只针对自动标签，且不写进「不想要」名单 */
export function applyProposals(meta: MetaState, ps: Proposal[]): MetaState {
  const pages = { ...meta.pages };
  for (const p of ps) {
    const old: PageMeta = pages[p.key] || { key: p.key, tags: [] };
    const drop = new Set(p.remove);
    const tags = old.tags.filter(t => !(drop.has(t.name) && t.source !== 'manual')).map(t => ({ ...t }));
    for (const name of p.add) if (!tags.some(t => t.name === name)) tags.push({ name, source: 'cloud' });
    pages[p.key] = { ...old, tags };
  }
  return { ...meta, pages };
}

export async function fetchProposals(cfg: CloudConfig, meta: MetaState, keys: string[]): Promise<Proposal[]> {
  const all: Proposal[] = [];
  for (let i = 0; i < keys.length; i += 500) {
    const hashed = await hashKeys(keys.slice(i, i + 500));
    const r = await cloudRequest<{ suggestions: Suggestions }>(cfg, 'POST', '/api/suggest', { items: hashed.map(x => ({ h: x.h, d: x.d || undefined })) });
    all.push(...buildProposals(meta, hashed, r.suggestions || {}));
  }
  return all;
}

export { normalizeTag };
