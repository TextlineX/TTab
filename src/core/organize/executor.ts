/**
 * 执行整理方案并记录日志，支持完整撤销：
 * - 移动前记下每个书签原来的文件夹和位置
 * - 撤销时按原位置移回，并删除本次新建、且已经空了的文件夹
 */
import type { MovePlan } from './organizer';

/** 书签写操作接口：生产环境用 chrome.bookmarks，测试用内存实现 */
export interface BookmarkWriter {
  get(id: string): Promise<{ id: string; parentId?: string; index?: number } | undefined>;
  createFolder(title: string, parentId: string): Promise<string>;
  move(id: string, parentId: string, index?: number): Promise<void>;
  childCount(id: string): Promise<number>;
  removeFolder(id: string): Promise<void>;
}

export const chromeWriter: BookmarkWriter = {
  async get(id) {
    try { return (await chrome.bookmarks.get(id))[0]; } catch { return undefined; }
  },
  async createFolder(title, parentId) {
    return (await chrome.bookmarks.create({ title, parentId })).id;
  },
  async move(id, parentId, index) {
    await chrome.bookmarks.move(id, index === undefined ? { parentId } : { parentId, index });
  },
  async childCount(id) {
    try { return (await chrome.bookmarks.getChildren(id)).length; } catch { return -1; }
  },
  async removeFolder(id) {
    await chrome.bookmarks.remove(id);
  },
};

export interface OrganizeLog {
  id: string;
  at: number;
  /** manual = 用户执行的整理方案；auto = 新收藏自动归类 */
  kind: 'manual' | 'auto';
  moves: { id: string; title: string; fromParent: string; fromIndex: number; toParent: string; toTitle: string }[];
  createdFolders: string[];
  undone?: boolean;
}

const KEY = 'ttab_organize_log_v1';
const MAX_LOGS = 30;

/** 没有任何存储可用时（单元测试）退化为内存 */
let memoryLogs: OrganizeLog[] = [];
const hasLocalStorage = () => { try { return typeof localStorage !== 'undefined' && !!localStorage; } catch { return false; } };

export async function loadLogs(): Promise<OrganizeLog[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) return ((await chrome.storage.local.get(KEY))[KEY] as OrganizeLog[] | undefined) || [];
    if (hasLocalStorage()) return JSON.parse(localStorage.getItem(KEY) || '[]') as OrganizeLog[];
  } catch { return []; }
  return memoryLogs;
}

export async function saveLogs(logs: OrganizeLog[]) {
  const trimmed = logs.slice(-MAX_LOGS);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [KEY]: trimmed });
    else if (hasLocalStorage()) localStorage.setItem(KEY, JSON.stringify(trimmed));
    else memoryLogs = trimmed;
  } catch { /* ignore */ }
}

export async function appendLog(log: OrganizeLog) {
  const logs = await loadLogs();
  await saveLogs([...logs, log]);
}

export interface ExecuteResult { log: OrganizeLog; failed: number }

export async function executeMoves(moves: MovePlan[], newFolderParent: string, writer: BookmarkWriter = chromeWriter, kind: OrganizeLog['kind'] = 'manual'): Promise<ExecuteResult> {
  const log: OrganizeLog = { id: `org_${Date.now().toString(36)}`, at: Date.now(), kind, moves: [], createdFolders: [] };
  const created = new Map<string, string>();
  let failed = 0;
  // 先记下所有书签移动前的位置：边移动边读的话，前面的移动会让后面的位置发生偏移
  const original = new Map<string, { id: string; parentId?: string; index?: number } | undefined>();
  for (const mv of moves) original.set(mv.bookmarkId, await writer.get(mv.bookmarkId));
  for (const mv of moves) {
    try {
      const node = original.get(mv.bookmarkId);
      if (!node || node.parentId === undefined) { failed++; continue; }
      let target = mv.toFolderId;
      if (!target && mv.toNewFolder) {
        target = created.get(mv.toNewFolder);
        if (!target) {
          target = await writer.createFolder(mv.toNewFolder, newFolderParent);
          created.set(mv.toNewFolder, target);
          log.createdFolders.push(target);
        }
      }
      if (!target || target === node.parentId) continue;
      await writer.move(mv.bookmarkId, target);
      log.moves.push({ id: mv.bookmarkId, title: mv.title, fromParent: node.parentId, fromIndex: node.index ?? 0, toParent: target, toTitle: mv.toPath[mv.toPath.length - 1] || '' });
    } catch {
      failed++;
    }
  }
  if (log.moves.length) await appendLog(log);
  return { log, failed };
}

/** 撤销一次整理：书签移回原位，删除空了的新建文件夹 */
export async function undoLog(logId: string, writer: BookmarkWriter = chromeWriter, onlyMoveIds?: string[]): Promise<{ restored: number; skipped: number }> {
  const logs = await loadLogs();
  const log = logs.find(l => l.id === logId);
  if (!log || log.undone) return { restored: 0, skipped: 0 };
  let restored = 0, skipped = 0;
  const targets = onlyMoveIds ? log.moves.filter(m => onlyMoveIds.includes(m.id)) : log.moves;
  // 同一个原文件夹内按原位置从小到大移回，顺序才能还原
  const ordered = [...targets].sort((a, b) => (a.fromParent === b.fromParent ? a.fromIndex - b.fromIndex : a.fromParent.localeCompare(b.fromParent)));
  for (const m of ordered) {
    const node = await writer.get(m.id);
    // 用户之后又手动移动过的，不再动它
    if (!node || node.parentId !== m.toParent) { skipped++; continue; }
    try { await writer.move(m.id, m.fromParent, m.fromIndex); restored++; } catch { skipped++; }
  }
  if (!onlyMoveIds) {
    for (const f of log.createdFolders) {
      if ((await writer.childCount(f)) === 0) { try { await writer.removeFolder(f); } catch { /* ignore */ } }
    }
  }
  const remaining = onlyMoveIds ? log.moves.filter(m => !onlyMoveIds.includes(m.id)) : [];
  const next = logs.map(l => (l.id === logId ? (remaining.length ? { ...l, moves: remaining } : { ...l, undone: true }) : l));
  await saveLogs(next);
  return { restored, skipped };
}
