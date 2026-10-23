/**
 * 自动整理：把散落的书签归入合适的文件夹。
 *
 * 1. 归入已有文件夹：用文件夹里现有书签的"内容中心"（向量平均）+ 标签画像 + 文件夹名打分
 * 2. 新建主题文件夹：剩下的书签里，共享同一个标签且数量够多的，新建以该标签命名的文件夹
 *
 * 全部是纯函数，生成"方案"供用户预览；执行和撤销见 executor.ts。
 */
import type { FolderRecord, LibraryItem } from '../types';
import { isGenericFolder } from '../ruleTagger';
import { tagCounts, uniqueByKey } from '../tagGraph';
import { dot, normalize } from '../vectors/vecmath';
import type { VectorIndex } from '../vectors/semantic';

export interface OrganizeOptions {
  /** loose：只整理散落在根目录的书签；all：也检查已在文件夹里但明显放错的 */
  scope: 'loose' | 'all';
  /** 新建文件夹放在哪里（默认"其他收藏夹"） */
  newFolderParentId: string;
  allowNewFolders: boolean;
  minGroupSize: number;
}

export const defaultOrganizeOptions = (): OrganizeOptions => ({ scope: 'loose', newFolderParentId: '2', allowNewFolders: true, minGroupSize: 3 });

export interface MovePlan {
  bookmarkId: string;
  key: string;
  title: string;
  url: string;
  fromFolderId?: string;
  fromPath: string[];
  /** 移到已有文件夹 */
  toFolderId?: string;
  /** 或新建文件夹（同名的新文件夹只建一次） */
  toNewFolder?: string;
  toPath: string[];
  reason: string;
  confidence: number;
}

export interface OrganizePlan {
  moves: MovePlan[];
  newFolders: { name: string; parentId: string; count: number }[];
  /** 检查过但没有找到合适去处的书签数 */
  unresolved: number;
  candidates: number;
}

const ASSIGN_THRESHOLD = { local: 0.34, api: 0.62 };
/** scope=all 时，新文件夹必须比当前文件夹明显更合适 */
const SWITCH_MARGIN = 0.15;

interface FolderProfile {
  folder: FolderRecord;
  centroid?: Float32Array;
  tags: Map<string, number>;
  size: number;
  nameLower: string;
}

/** 书签是否"散落"：所在路径全是书签栏/其他收藏夹这类根容器 */
export const isLoose = (it: Pick<LibraryItem, 'folderPath'>) => it.folderPath.every(f => isGenericFolder(f));

const prettyName = (tag: string) => (/^[a-z]/.test(tag) ? tag[0].toUpperCase() + tag.slice(1) : tag);

function buildProfiles(items: LibraryItem[], folders: FolderRecord[], index: VectorIndex | null): FolderProfile[] {
  const byParent = new Map<string, LibraryItem[]>();
  for (const it of items) if (it.parentId) byParent.set(it.parentId, [...(byParent.get(it.parentId) || []), it]);
  const out: FolderProfile[] = [];
  for (const f of folders) {
    if (isGenericFolder(f.title)) continue;
    const members = byParent.get(f.id) || [];
    if (members.length < 2) continue;
    let centroid: Float32Array | undefined;
    if (index) {
      const vs = members.map(m => index.vector(m.key)).filter(Boolean) as Float32Array[];
      if (vs.length >= 2) {
        const acc = new Float32Array(vs[0].length);
        for (const v of vs) for (let i = 0; i < v.length; i++) acc[i] += v[i];
        centroid = normalize(acc);
      }
    }
    out.push({ folder: f, centroid, tags: tagCounts(members), size: members.length, nameLower: f.title.toLowerCase() });
  }
  return out;
}

function scoreFolder(it: LibraryItem, p: FolderProfile, index: VectorIndex | null): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];
  const v = index?.vector(it.key);
  if (v && p.centroid) {
    const s = dot(v, p.centroid);
    score += s;
    if (s > 0.3) reasons.push('内容相近');
  }
  // 标签画像：和文件夹里书签共有的标签越多、越普遍，分越高
  const shared = it.tags.filter(t => (p.tags.get(t) || 0) / p.size >= 0.5);
  if (shared.length) {
    score += Math.min(0.3, shared.length * 0.12);
    reasons.push(`都有 ${shared.slice(0, 2).map(t => '#' + t).join(' ')}`);
  }
  // 文件夹名本身就是书签的标签或出现在标题里
  if (it.tags.some(t => t.toLowerCase() === p.nameLower) || (p.nameLower.length >= 2 && it.title.toLowerCase().includes(p.nameLower))) {
    score += 0.25;
    reasons.push('与文件夹名匹配');
  }
  return { score, reason: reasons.join('，') || '相似' };
}

/** 为单个书签找最合适的已有文件夹（后台"新收藏自动归类"也用它） */
export function bestFolderFor(
  it: LibraryItem, profiles: FolderProfile[], index: VectorIndex | null,
): { profile: FolderProfile; score: number; reason: string } | null {
  let best: { profile: FolderProfile; score: number; reason: string } | null = null;
  for (const p of profiles) {
    if (p.folder.id === it.parentId) continue;
    const s = scoreFolder(it, p, index);
    if (!best || s.score > best.score) best = { profile: p, ...s };
  }
  return best;
}

export function assignThreshold(index: VectorIndex | null): number {
  return index?.mode === 'api' ? ASSIGN_THRESHOLD.api : ASSIGN_THRESHOLD.local;
}

export function planOrganize(
  allItems: LibraryItem[], folders: FolderRecord[], index: VectorIndex | null, opts: OrganizeOptions = defaultOrganizeOptions(),
): OrganizePlan {
  // 每个书签单独处理（同一网址的重复书签也各自整理）
  const items = allItems.filter(i => i.url);
  const profiles = buildProfiles(items, folders, index);
  const threshold = assignThreshold(index);
  const candidates = opts.scope === 'loose' ? items.filter(isLoose) : items;
  const moves: MovePlan[] = [];
  const remaining: LibraryItem[] = [];

  for (const it of candidates) {
    const best = bestFolderFor(it, profiles, index);
    let ok = !!best && best.score >= threshold;
    if (ok && opts.scope === 'all' && !isLoose(it)) {
      const own = profiles.find(p => p.folder.id === it.parentId);
      const ownScore = own ? scoreFolder(it, own, index).score : 0;
      ok = best!.score - ownScore >= SWITCH_MARGIN;
    }
    if (ok && best) {
      moves.push({
        bookmarkId: it.id, key: it.key, title: it.title, url: it.url, fromFolderId: it.parentId, fromPath: it.folderPath,
        toFolderId: best.profile.folder.id, toPath: best.profile.folder.path, reason: best.reason, confidence: best.score,
      });
    } else if (isLoose(it)) {
      remaining.push(it);
    }
  }

  // 剩下的散落书签：按共享标签新建主题文件夹
  const newFolders: OrganizePlan['newFolders'] = [];
  if (opts.allowNewFolders) {
    const total = uniqueByKey(items).length || 1;
    const globalCounts = tagCounts(items);
    const existingNames = new Map(folders.map(f => [f.title.toLowerCase(), f]));
    let pool = remaining;
    for (let guard = 0; guard < 20 && pool.length >= opts.minGroupSize; guard++) {
      const counts = tagCounts(pool);
      let bestTag = '', bestScore = 0;
      for (const [tag, c] of counts) {
        if (c < opts.minGroupSize) continue;
        // 太泛的标签（覆盖一半以上书签）降权，优先更具体的主题
        const generic = (globalCounts.get(tag) || c) / total > 0.5 ? 0.5 : 1;
        const s = c * generic;
        if (s > bestScore) { bestScore = s; bestTag = tag; }
      }
      if (!bestTag) break;
      const group = pool.filter(i => i.tags.includes(bestTag));
      const name = prettyName(bestTag);
      const existing = existingNames.get(name.toLowerCase());
      for (const it of group) {
        moves.push({
          bookmarkId: it.id, key: it.key, title: it.title, url: it.url, fromFolderId: it.parentId, fromPath: it.folderPath,
          ...(existing ? { toFolderId: existing.id, toPath: existing.path } : { toNewFolder: name, toPath: [...(folders.find(f => f.id === opts.newFolderParentId)?.path || []), name] }),
          reason: `都有 #${bestTag}`, confidence: 0.5,
        });
      }
      if (!existing) newFolders.push({ name, parentId: opts.newFolderParentId, count: group.length });
      pool = pool.filter(i => !i.tags.includes(bestTag));
    }
    remaining.length = 0;
    remaining.push(...pool);
  }

  return { moves, newFolders, unresolved: remaining.length, candidates: candidates.length };
}

/** 按目标文件夹分组，便于预览 */
export function groupMoves(plan: OrganizePlan): { target: string; isNew: boolean; moves: MovePlan[] }[] {
  const m = new Map<string, { target: string; isNew: boolean; moves: MovePlan[] }>();
  for (const mv of plan.moves) {
    const id = mv.toFolderId ? `id:${mv.toFolderId}` : `new:${mv.toNewFolder}`;
    if (!m.has(id)) m.set(id, { target: mv.toPath.join(' / '), isNew: !mv.toFolderId, moves: [] });
    m.get(id)!.moves.push(mv);
  }
  return [...m.values()].sort((a, b) => b.moves.length - a.moves.length);
}

export { buildProfiles };
export type { FolderProfile };
