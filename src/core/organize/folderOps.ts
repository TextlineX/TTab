/**
 * 文件夹本身的整理：移动到别的文件夹、同级上移 / 下移、重命名、新建子文件夹。
 * 全部是用户明确点击后才执行；移动和排序都可以撤销（记下原来的父文件夹和位置）。
 */
import type { FolderRecord } from '../types';
import { descendantIds } from '../nav';

export interface FolderWriter {
  move(id: string, parentId: string, index?: number): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  create(title: string, parentId: string): Promise<string>;
  /** 读取某个文件夹的直接子节点 id（按顺序） */
  children(id: string): Promise<string[]>;
  get(id: string): Promise<{ id: string; parentId?: string; index?: number } | undefined>;
}

export const chromeFolderWriter: FolderWriter = {
  async move(id, parentId, index) { await chrome.bookmarks.move(id, index === undefined ? { parentId } : { parentId, index }); },
  async rename(id, title) { await chrome.bookmarks.update(id, { title }); },
  async create(title, parentId) { return (await chrome.bookmarks.create({ title, parentId })).id; },
  async children(id) { return (await chrome.bookmarks.getChildren(id)).map(n => n.id); },
  async get(id) { try { return (await chrome.bookmarks.get(id))[0]; } catch { return undefined; } },
};

export interface FolderUndo { run: () => Promise<void> }

/** 不能把文件夹移进它自己或它的子孙；顶层文件夹（收藏夹栏等）也不能移动 */
export function canMoveFolder(folders: FolderRecord[], id: string, targetParent: string): { ok: true } | { ok: false; reason: string } {
  const f = folders.find(x => x.id === id);
  if (!f) return { ok: false, reason: '找不到这个文件夹' };
  if (!f.parentId && f.path.length === 1) return { ok: false, reason: '浏览器自带的顶层文件夹不能移动' };
  if (descendantIds(folders, id).has(targetParent)) return { ok: false, reason: '不能把文件夹移进它自己里面' };
  if (f.parentId === targetParent) return { ok: false, reason: '已经在这个文件夹里了' };
  return { ok: true };
}

export async function moveFolder(folders: FolderRecord[], id: string, targetParent: string, w: FolderWriter = chromeFolderWriter): Promise<{ ok: boolean; reason?: string; undo?: FolderUndo }> {
  const check = canMoveFolder(folders, id, targetParent);
  if (!check.ok) return { ok: false, reason: check.reason };
  const before = await w.get(id);
  if (!before || before.parentId === undefined) return { ok: false, reason: '找不到这个文件夹' };
  await w.move(id, targetParent);
  return { ok: true, undo: { run: () => w.move(id, before.parentId!, before.index) } };
}

/** 同级上移（-1）/ 下移（+1）。返回 undefined 表示已经在头或尾 */
export async function shiftFolder(id: string, delta: -1 | 1, w: FolderWriter = chromeFolderWriter): Promise<{ ok: boolean; reason?: string; undo?: FolderUndo }> {
  const node = await w.get(id);
  if (!node || node.parentId === undefined || node.index === undefined) return { ok: false, reason: '找不到这个文件夹' };
  const siblings = await w.children(node.parentId);
  const at = siblings.indexOf(id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= siblings.length) return { ok: false, reason: delta < 0 ? '已经在最前面' : '已经在最后面' };
  // chrome.bookmarks.move 的 index 是"移走之后的目标下标"，向后移要多加 1
  await w.move(id, node.parentId, delta > 0 ? to + 1 : to);
  // 撤销：往前移过的，要回到原来的下标，向后找一位（同一文件夹内移动时 index 按移走之前计算）
  return { ok: true, undo: { run: () => w.move(id, node.parentId!, delta < 0 ? node.index! + 1 : node.index) } };
}

/** 书签移到所在文件夹最前面（"置顶"） */
export async function moveToTop(id: string, w: FolderWriter = chromeFolderWriter): Promise<{ ok: boolean; undo?: FolderUndo }> {
  const node = await w.get(id);
  if (!node || node.parentId === undefined) return { ok: false };
  if (node.index === 0) return { ok: false };
  await w.move(id, node.parentId, 0);
  return { ok: true, undo: { run: () => w.move(id, node.parentId!, (node.index ?? 0) + 1) } };
}

/** 新文件夹的默认位置：优先"其他收藏夹"，找不到就用第一个顶层文件夹（Edge/Chrome 的 id 不一定相同） */
export function defaultNewFolderParent(folders: FolderRecord[]): string {
  const roots = folders.filter(f => !f.parentId && f.path.length === 1);
  const other = roots.find(f => /其他|other/i.test(f.title)) || roots[1] || roots[0];
  return other?.id || '2';
}
