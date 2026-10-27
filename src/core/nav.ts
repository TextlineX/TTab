/**
 * 导航模型：把各种"分类"统一成 Category，侧边栏和分类总览都从这里取数据。
 *
 * 导航键：
 *   overview            分类总览（首页）
 *   all                 全部网页
 *   view:<id>           智能视图（此刻常用/常用/最近/未打标签/重复）
 *   loose               散落的书签（待整理）
 *   col:<id>            我的组合
 *   grp:<id>            自动分组（按内容）
 *   combo:<id>          推荐组合（按标签）
 *   folder:<id>         浏览器书签文件夹（含子文件夹）
 *   tag:<名称>           标签
 */
import type { Collection, FolderRecord, LibraryItem } from './types';
import type { Combo, SmartView } from './tagGraph';
import { uniqueByKey, usageOf } from './tagGraph';
import { resolveCollection } from './library';
import { isGenericFolder } from './ruleTagger';
import type { Cluster } from './vectors/semantic';

export type CategoryKind = 'overview' | 'all' | 'view' | 'loose' | 'collection' | 'group' | 'combo' | 'folder' | 'tag';

export interface Category {
  key: string;
  kind: CategoryKind;
  title: string;
  subtitle?: string;
  emoji?: string;
  /** 推荐组合 / 自动分组的代表标签 */
  tags?: string[];
  items: LibraryItem[];
  pinned?: boolean;
}

export interface NavContext {
  items: LibraryItem[];
  views: SmartView[];
  collections: Collection[];
  groups: Cluster[];
  combos: Combo[];
  folders: FolderRecord[];
}

export const VIEW_TITLES: Record<SmartView['id'], string> = {
  now: '此刻常用',
  frequent: '常用',
  recent: '最近添加',
  untagged: '未打标签',
  duplicates: '重复书签',
};

/** 默认排序：此刻最可能用到的 → 总使用 → 最近收藏 */
export function smartSort(items: LibraryItem[]): LibraryItem[] {
  return [...items].sort((a, b) => b.nowScore - a.nowScore || usageOf(b) - usageOf(a) || (b.dateAdded || 0) - (a.dateAdded || 0));
}

export type SortMode = 'smart' | 'recent' | 'name' | 'visits';
export function sortItems(items: LibraryItem[], mode: SortMode): LibraryItem[] {
  if (mode === 'recent') return [...items].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  if (mode === 'name') return [...items].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
  if (mode === 'visits') return [...items].sort((a, b) => usageOf(b) - usageOf(a));
  return smartSort(items);
}

// ---------------------------------------------------------------------------
// 文件夹树
// ---------------------------------------------------------------------------
export interface FolderNode {
  folder: FolderRecord;
  children: FolderNode[];
  /** 直接放在这个文件夹里的书签数 */
  direct: number;
  /** 含所有子文件夹 */
  total: number;
}

/** 文件夹树：用 id 关系建树（同名文件夹不会合并），同级按浏览器里的顺序排 */
export function folderTree(folders: FolderRecord[], items: LibraryItem[]): FolderNode[] {
  const direct = new Map<string, number>();
  for (const it of items) if (it.parentId) direct.set(it.parentId, (direct.get(it.parentId) || 0) + 1);
  const nodes = new Map<string, FolderNode>(folders.map(f => [f.id, { folder: f, children: [], direct: direct.get(f.id) || 0, total: 0 }]));
  const roots: FolderNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.folder.parentId ? nodes.get(n.folder.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const byIndex = (a: FolderNode, b: FolderNode) => (a.folder.index ?? 0) - (b.folder.index ?? 0);
  const sum = (n: FolderNode): number => { n.children.sort(byIndex); return (n.total = n.direct + n.children.reduce((s, c) => s + sum(c), 0)); };
  roots.sort(byIndex);
  roots.forEach(sum);
  return roots;
}

/** 文件夹自己和它所有子孙文件夹的 id */
export function descendantIds(folders: FolderRecord[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}

const isLooseItem = (it: LibraryItem) => it.folderPath.every(f => isGenericFolder(f));

// ---------------------------------------------------------------------------
// 解析导航键
// ---------------------------------------------------------------------------
export function resolveNav(key: string, ctx: NavContext): Category | null {
  const uniq = uniqueByKey(ctx.items);
  const byKey = new Map(uniq.map(i => [i.key, i]));
  const pick = (keys: string[]) => keys.map(k => byKey.get(k)).filter(Boolean) as LibraryItem[];

  if (key === 'overview') return { key, kind: 'overview', title: '分类总览', items: uniq };
  if (key === 'all') return { key, kind: 'all', title: '全部网页', items: smartSort(uniq) };
  if (key === 'loose') return { key, kind: 'loose', title: '散落的书签', subtitle: '直接放在收藏夹栏或其他收藏夹根目录，还没归类', items: smartSort(uniqueByKey(ctx.items.filter(isLooseItem))) };

  const [kind, ...rest] = key.split(':');
  const id = rest.join(':');
  switch (kind) {
    case 'view': {
      const v = ctx.views.find(x => x.id === id);
      if (!v) return null;
      // 重复书签需要展示每一条（同一网址的多个书签）
      const items = v.id === 'duplicates' ? ctx.items.filter(i => v.keys.includes(i.key)) : pick(v.keys);
      return { key, kind: 'view', title: VIEW_TITLES[v.id], items };
    }
    case 'col': {
      const c = ctx.collections.find(x => x.id === id);
      if (!c) return null;
      return {
        key, kind: 'collection', title: c.name, emoji: c.emoji, pinned: c.pinned,
        subtitle: c.description || (c.query ? `自动包含 ${c.query.tags.map(t => '#' + t).join(c.query.mode === 'and' ? ' 且 ' : ' 或 ')}` : undefined),
        items: smartSort(resolveCollection(c, uniq)),
      };
    }
    case 'grp': {
      const g = ctx.groups.find(x => x.id === id);
      return g ? { key, kind: 'group', title: g.label, subtitle: '按内容自动分组', tags: g.tags, items: pick(g.keys) } : null;
    }
    case 'combo': {
      const c = ctx.combos.find(x => x.id === id);
      return c ? { key, kind: 'combo', title: c.tags.join(' + '), subtitle: '这些标签经常一起出现', tags: c.tags, items: smartSort(pick(c.keys)) } : null;
    }
    case 'folder': {
      const f = ctx.folders.find(x => x.id === id);
      if (!f) return null;
      const ids = descendantIds(ctx.folders, id);
      return { key, kind: 'folder', title: f.title, subtitle: f.path.slice(0, -1).join(' / ') || undefined, items: smartSort(ctx.items.filter(i => i.parentId && ids.has(i.parentId))) };
    }
    case 'tag':
      return { key, kind: 'tag', title: `#${id}`, items: smartSort(uniq.filter(i => i.tags.includes(id))) };
  }
  return null;
}

/**
 * 分类总览要展示的所有分类：我的组合 → 自动分组 → 文件夹 → 推荐组合。
 * 成员几乎相同、或大部分已被前面分类包含的，只保留前面那个，避免重复。
 */
export function overviewCategories(ctx: NavContext): Category[] {
  const out: Category[] = [];
  const add = (c: Category | null) => {
    if (!c || c.items.length < 2) return;
    const keys = new Set(c.items.map(i => i.key));
    const dup = out.some(o => {
      const ok = new Set(o.items.map(i => i.key));
      let inter = 0;
      for (const k of keys) if (ok.has(k)) inter++;
      // 新分类的大部分成员已经在某个分类里展示过，就不再重复
      return inter / keys.size >= 0.8 || inter / (keys.size + ok.size - inter) > 0.8;
    });
    if (!dup) out.push(c);
  };
  [...ctx.collections].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt).forEach(c => add(resolveNav(`col:${c.id}`, ctx)));
  ctx.groups.forEach(g => add(resolveNav(`grp:${g.id}`, ctx)));
  // 文件夹：用户自己建的分类，按直接放在里面的书签算，避免父子文件夹重复
  const tree = folderTree(ctx.folders, ctx.items);
  const flat: FolderNode[] = [];
  const walk = (ns: FolderNode[]) => ns.forEach(n => { flat.push(n); walk(n.children); });
  walk(tree);
  flat
    .filter(n => !isGenericFolder(n.folder.title) && n.direct >= 2)
    .map(n => ({ n, score: ctx.items.filter(i => i.parentId === n.folder.id).reduce((s, i) => s + usageOf(i), 0) }))
    .sort((a, b) => b.score - a.score || b.n.direct - a.n.direct)
    .forEach(({ n }) => {
      const c = resolveNav(`folder:${n.folder.id}`, ctx);
      if (c) add({ ...c, items: smartSort(ctx.items.filter(i => i.parentId === n.folder.id)) });
    });
  ctx.combos.forEach(c => add(resolveNav(`combo:${c.id}`, ctx)));
  return out;
}

/** 首页"此刻推荐"：有使用数据时按此刻习惯，否则用最近添加 */
export function nowPicks(items: LibraryItem[], limit = 12): { title: string; items: LibraryItem[] } {
  const uniq = uniqueByKey(items);
  const used = uniq.filter(i => i.nowScore > 0);
  if (used.length >= 3) return { title: '此刻可能要用', items: smartSort(used).slice(0, limit) };
  const recent = [...uniq].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)).slice(0, limit);
  return { title: '最近收藏', items: recent };
}
