/** AI 规划整理方案：输出与本地方案相同的格式，同样先预览再执行 */
import type { FolderRecord, LibraryItem } from '../types';
import { chat, extractJson, type AIConfig } from '../ai/client';
import { RefMap } from '../ai/actions';
import { isGenericFolder } from '../ruleTagger';
import { isLoose, type MovePlan, type OrganizeOptions, type OrganizePlan } from './organizer';

const SYSTEM = `你是书签整理助手。把【待整理书签】归入合适的文件夹。
规则：
- 优先放进【已有文件夹】（用 folderId），只有确实没有合适的才新建（用 newFolder，名字 2~6 个字，简洁通用，如"设计素材""AI 工具"）。
- 同一主题的书签放进同一个新文件夹，不要为一两个书签新建文件夹，宁可不动（不输出该书签）。
- 新文件夹名不要和已有文件夹重名；拿不准的书签不要输出。
- 只输出 JSON：{"moves":[{"ref":"b1","folderId":"12"},{"ref":"b2","newFolder":"设计素材"}]}`;

const MAX = 300;

export async function aiPlanOrganize(
  config: AIConfig, allItems: LibraryItem[], folders: FolderRecord[], opts: OrganizeOptions, signal?: AbortSignal,
): Promise<OrganizePlan> {
  const items = allItems.filter(i => i.url);
  const candidates = (opts.scope === 'loose' ? items.filter(isLoose) : items).slice(0, MAX);
  if (!candidates.length) return { moves: [], newFolders: [], unresolved: 0, candidates: 0 };
  const refs = new RefMap(candidates);
  // RefMap 按网址去重；重复书签用同一编号，执行时每个书签单独处理
  const byRef = new Map<string, LibraryItem[]>();
  for (const it of candidates) { const r = refs.ref(it)!; byRef.set(r, [...(byRef.get(r) || []), it]); }
  const usable = folders.filter(f => !isGenericFolder(f.title));
  const user = `【已有文件夹】（id:路径）
${usable.slice(0, 200).map(f => `${f.id}:${f.path.join('/')}`).join('\n') || '（没有）'}

【待整理书签】（编号 | 标题 | 域名 | 标签）
${[...byRef.entries()].map(([r, list]) => `${r} | ${list[0].title.slice(0, 50)} | ${list[0].domain} | ${list[0].tags.join(',')}`).join('\n')}`;
  const text = await chat(config, SYSTEM, user, { json: true, signal, maxTokens: 6000 });
  const data = extractJson<{ moves?: { ref?: string; folderId?: string; newFolder?: string }[] }>(text);

  const parentPath = folders.find(f => f.id === opts.newFolderParentId)?.path || [];
  const existingByName = new Map(folders.map(f => [f.title.toLowerCase(), f]));
  const moves: MovePlan[] = [];
  const newCounts = new Map<string, number>();
  for (const row of data.moves || []) {
    const list = row.ref ? byRef.get(String(row.ref)) : undefined;
    if (!list) continue;
    let folder = row.folderId ? usable.find(f => f.id === String(row.folderId)) : undefined;
    const newName = !folder && typeof row.newFolder === 'string' ? row.newFolder.trim().slice(0, 20) : '';
    if (newName && existingByName.has(newName.toLowerCase())) folder = existingByName.get(newName.toLowerCase());
    if (!folder && (!newName || !opts.allowNewFolders)) continue;
    for (const it of list) {
      if (folder && folder.id === it.parentId) continue;
      moves.push({
        bookmarkId: it.id, key: it.key, title: it.title, url: it.url, fromFolderId: it.parentId, fromPath: it.folderPath,
        ...(folder ? { toFolderId: folder.id, toPath: folder.path } : { toNewFolder: newName, toPath: [...parentPath, newName] }),
        reason: 'AI 建议', confidence: 0.7,
      });
      if (!folder) newCounts.set(newName, (newCounts.get(newName) || 0) + 1);
    }
  }
  // 只有 1 个书签的新文件夹没有意义，丢掉
  const keep = moves.filter(m => !m.toNewFolder || (newCounts.get(m.toNewFolder) || 0) >= 2);
  const newFolders = [...newCounts.entries()].filter(([, c]) => c >= 2).map(([name, count]) => ({ name, parentId: opts.newFolderParentId, count }));
  return { moves: keep, newFolders, unresolved: candidates.length - keep.length, candidates: candidates.length };
}
