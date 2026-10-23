/**
 * AI 动作：模型只能"提议"这些结构化动作，由用户在预览面板确认后才执行。
 * - 只改 TTab 智能层的动作（标签/集合/筛选/打开）默认勾选
 * - 会修改浏览器真实书签的动作（移动到文件夹）默认不勾选，并显式标注
 * - 不提供删除书签的动作
 */
import type { FolderRecord, LibraryItem, MetaState } from '../types';
import { addTags, removeTags, renameTag, setSummary, upsertCollection } from '../library';
import { normalizeTag, uniqTags } from '../normalize';

export type RawAction =
  | { type: 'filter'; tags?: string[]; query?: string; mode?: 'and' | 'or' }
  | { type: 'addTags'; items: string[]; tags: string[] }
  | { type: 'removeTags'; items: string[]; tags: string[] }
  | { type: 'renameTag'; from: string; to: string }
  | { type: 'createCollection'; name: string; items?: string[]; tags?: string[]; mode?: 'and' | 'or'; description?: string; emoji?: string }
  | { type: 'open'; items: string[]; groupTitle?: string }
  | { type: 'setSummary'; item: string; summary: string }
  | { type: 'moveBookmarks'; items: string[]; folderId?: string; newFolder?: string };

export interface ResolvedAction {
  id: string;
  raw: RawAction;
  /** 涉及的条目 */
  items: LibraryItem[];
  /** 会修改浏览器书签 */
  touchesBrowser: boolean;
  /** 只是界面操作（筛选/打开），不改数据 */
  uiOnly: boolean;
  label: string;
  detail?: string;
  defaultChecked: boolean;
}

/** 给条目分配短引用，减少 token 并防止模型编造 URL */
export class RefMap {
  private byRef = new Map<string, LibraryItem>();
  private byKey = new Map<string, string>();
  constructor(items: LibraryItem[]) {
    let i = 1;
    for (const it of items) {
      if (this.byKey.has(it.key)) continue;
      const ref = `b${i++}`;
      this.byRef.set(ref, it);
      this.byKey.set(it.key, ref);
    }
  }
  ref(it: LibraryItem) { return this.byKey.get(it.key); }
  get(ref: string) { return this.byRef.get(String(ref).trim()); }
  resolve(refs: unknown): LibraryItem[] {
    if (!Array.isArray(refs)) return [];
    const out: LibraryItem[] = [];
    const seen = new Set<string>();
    for (const r of refs) {
      const it = this.get(String(r));
      if (it && !seen.has(it.key)) { seen.add(it.key); out.push(it); }
    }
    return out;
  }
  get size() { return this.byRef.size; }
}

const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strArr = (v: unknown) => (Array.isArray(v) ? v.map(x => str(x, 40)).filter(Boolean) : []);
const names = (items: LibraryItem[], n = 3) =>
  items.slice(0, n).map(i => i.title).join('、') + (items.length > n ? ` 等 ${items.length} 个` : '');

/** 校验并解析模型返回的动作，丢弃无效部分 */
export function resolveActions(raw: unknown, refs: RefMap, folders: FolderRecord[]): ResolvedAction[] {
  if (!Array.isArray(raw)) return [];
  const out: ResolvedAction[] = [];
  let n = 0;
  const push = (a: Omit<ResolvedAction, 'id'>) => out.push({ ...a, id: `a${n++}` });

  for (const r of raw.slice(0, 30)) {
    if (!r || typeof r !== 'object') continue;
    const a = r as Record<string, unknown>;
    switch (a.type) {
      case 'filter': {
        const tags = uniqTags(strArr(a.tags));
        const query = str(a.query, 80);
        if (!tags.length && !query) break;
        const mode = a.mode === 'or' ? 'or' : 'and';
        push({
          raw: { type: 'filter', tags, query, mode }, items: [], touchesBrowser: false, uiOnly: true, defaultChecked: true,
          label: `筛选：${[...tags.map(t => '#' + t), query].filter(Boolean).join(' ')}`,
        });
        break;
      }
      case 'addTags':
      case 'removeTags': {
        const items = refs.resolve(a.items);
        const tags = uniqTags(strArr(a.tags));
        if (!items.length || !tags.length) break;
        const add = a.type === 'addTags';
        push({
          raw: { type: a.type, items: items.map(i => refs.ref(i)!), tags }, items, touchesBrowser: false, uiOnly: false, defaultChecked: true,
          label: `${add ? '添加' : '移除'}标签 ${tags.map(t => '#' + t).join(' ')}`,
          detail: names(items),
        });
        break;
      }
      case 'renameTag': {
        const from = normalizeTag(str(a.from)); const to = normalizeTag(str(a.to));
        if (!from || !to || from === to) break;
        push({ raw: { type: 'renameTag', from, to }, items: [], touchesBrowser: false, uiOnly: false, defaultChecked: true, label: `合并标签 #${from} → #${to}` });
        break;
      }
      case 'createCollection': {
        const name = str(a.name, 40);
        const items = refs.resolve(a.items);
        const tags = uniqTags(strArr(a.tags));
        if (!name || (!items.length && !tags.length)) break;
        const mode = a.mode === 'or' ? 'or' : 'and';
        push({
          raw: { type: 'createCollection', name, items: items.map(i => refs.ref(i)!), tags, mode, description: str(a.description, 120), emoji: str(a.emoji, 4) },
          items, touchesBrowser: false, uiOnly: false, defaultChecked: true,
          label: `新建组合「${str(a.emoji, 4)}${name}」`,
          detail: [items.length ? names(items) : '', tags.length ? `自动包含 ${tags.map(t => '#' + t).join(mode === 'and' ? ' 且 ' : ' 或 ')}` : ''].filter(Boolean).join('；'),
        });
        break;
      }
      case 'open': {
        const items = refs.resolve(a.items).slice(0, 20);
        if (!items.length) break;
        push({ raw: { type: 'open', items: items.map(i => refs.ref(i)!), groupTitle: str(a.groupTitle, 30) }, items, touchesBrowser: false, uiOnly: true, defaultChecked: true, label: `打开 ${items.length} 个网页`, detail: names(items, 5) });
        break;
      }
      case 'setSummary': {
        const items = refs.resolve([a.item]);
        const summary = str(a.summary, 120);
        if (!items.length || !summary) break;
        push({ raw: { type: 'setSummary', item: refs.ref(items[0])!, summary }, items, touchesBrowser: false, uiOnly: false, defaultChecked: true, label: `为「${items[0].title}」写摘要`, detail: summary });
        break;
      }
      case 'moveBookmarks': {
        const items = refs.resolve(a.items);
        const folderId = str(a.folderId, 40);
        const newFolder = str(a.newFolder, 40);
        const folder = folders.find(f => f.id === folderId);
        if (!items.length || (!folder && !newFolder)) break;
        push({
          raw: { type: 'moveBookmarks', items: items.map(i => refs.ref(i)!), folderId: folder?.id, newFolder: folder ? undefined : newFolder },
          items, touchesBrowser: true, uiOnly: false, defaultChecked: false,
          label: `移动书签到「${folder ? folder.path.join(' / ') : newFolder + '（新建）'}」`,
          detail: names(items),
        });
        break;
      }
    }
  }
  return out;
}

export interface ApplyResult {
  state: MetaState;
  filter?: { tags: string[]; query?: string; mode: 'and' | 'or' };
  open: { urls: string[]; groupTitle?: string }[];
  moves: { bookmarkIds: string[]; folderId?: string; newFolder?: string }[];
  createdCollectionIds: string[];
}

/** 把勾选的动作应用到智能数据；界面动作和书签移动交给调用方执行 */
export function applyActions(state: MetaState, actions: ResolvedAction[], refs: RefMap): ApplyResult {
  const result: ApplyResult = { state, open: [], moves: [], createdCollectionIds: [] };
  for (const act of actions) {
    const a = act.raw;
    const keys = (refsArr: string[]) => refs.resolve(refsArr).map(i => i.key);
    switch (a.type) {
      case 'filter':
        result.filter = { tags: a.tags || [], query: a.query, mode: a.mode || 'and' };
        break;
      case 'addTags':
        result.state = addTags(result.state, keys(a.items), a.tags, 'ai');
        break;
      case 'removeTags':
        result.state = removeTags(result.state, keys(a.items), a.tags);
        break;
      case 'renameTag':
        result.state = renameTag(result.state, a.from, a.to);
        break;
      case 'createCollection': {
        const before = new Set(result.state.collections.map(c => c.id));
        result.state = upsertCollection(result.state, {
          name: a.name, description: a.description || undefined, emoji: a.emoji || undefined,
          keys: keys(a.items || []),
          query: a.tags?.length ? { tags: a.tags, mode: a.mode || 'and' } : undefined,
          source: 'ai', pinned: false,
        });
        const created = result.state.collections.find(c => !before.has(c.id));
        if (created) result.createdCollectionIds.push(created.id);
        break;
      }
      case 'open':
        result.open.push({ urls: refs.resolve(a.items).map(i => i.url), groupTitle: a.groupTitle });
        break;
      case 'setSummary': {
        const it = refs.get(a.item);
        if (it) result.state = setSummary(result.state, it.key, a.summary);
        break;
      }
      case 'moveBookmarks':
        result.moves.push({ bookmarkIds: refs.resolve(a.items).map(i => i.id), folderId: a.folderId, newFolder: a.newFolder });
        break;
    }
  }
  return result;
}
