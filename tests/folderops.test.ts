import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenTree } from '../src/core/bookmarkSource';
import { folderTree, descendantIds } from '../src/core/nav';
import { canMoveFolder, moveFolder, shiftFolder, moveToTop, defaultNewFolderParent, type FolderWriter } from '../src/core/organize/folderOps';

type N = { id: string; title: string; url?: string; children?: N[]; parentId?: string; index?: number };
const f = (id: string, title: string, children: N[] = []): N => ({ id, title, children });
const b = (id: string, title: string, url: string): N => ({ id, title, url });
const tree = (): N[] => [f('0', '', [
  f('1', '收藏夹栏', [f('10', '资料', [b('101', 'a', 'https://a.com/')]), f('11', '资料', [b('111', 'b', 'https://b.com/')]), f('12', '空文件夹'), b('13', 'c', 'https://c.com/')]),
  f('2', '其他收藏夹', [f('20', '工具', [f('21', '子')])]),
])];
const fill = (nodes: N[], parentId?: string) => nodes.forEach((n, i) => { n.parentId = parentId; n.index = i; if (n.children) fill(n.children, n.id); });

/** 内存里的书签树，行为和 chrome.bookmarks 一致（move 的 index 是"先摘下再插入"的下标） */
function memWriter(nodes: N[]): FolderWriter & { nodes: N[] } {
  fill(nodes);
  const all = () => { const out: N[] = []; const w = (l: N[]) => l.forEach(n => { out.push(n); if (n.children) w(n.children); }); w(nodes); return out; };
  const find = (id: string) => all().find(n => n.id === id);
  return {
    nodes,
    async get(id) { const n = find(id); return n && { id: n.id, parentId: n.parentId, index: n.index }; },
    async children(id) { return (find(id)?.children || []).map(c => c.id); },
    async move(id, parentId, index) {
      const n = find(id)!; const old = find(n.parentId!)!; old.children!.splice(old.children!.indexOf(n), 1);
      const np = find(parentId)!; np.children = np.children || [];
      // 和 chrome.bookmarks.move 一致：同一文件夹内向后移时，index 按「移走之前」的列表计算
      const pos = index === undefined ? np.children.length : (np === old && index > n.index! ? index - 1 : index);
      np.children.splice(pos, 0, n);
      fill(nodes);
    },
    async rename(id, title) { find(id)!.title = title; },
    async create(title, parentId) { const p = find(parentId)!; const n = f(`n${all().length}`, title); (p.children = p.children || []).push(n); fill(nodes); return n.id; },
  };
}

test('同名文件夹不会被合并，空文件夹也在树里', () => {
  fill(tree());
  const t = tree(); fill(t);
  const { folders, records } = flattenTree(t as never);
  const items = records.map(r => ({ ...r, tags: [], tagEntries: [] })) as never;
  const roots = folderTree(folders, items);
  const bar = roots.find(r => r.folder.id === '1')!;
  assert.deepEqual(bar.children.map(c => c.folder.id), ['10', '11', '12']);
  assert.equal(bar.children[0].direct, 1);
  assert.equal(bar.children[1].direct, 1);
  assert.equal(bar.children[2].total, 0);
  assert.deepEqual([...descendantIds(folders, '20')].sort(), ['20', '21']);
  assert.equal(folders.find(x => x.id === '10')!.parentId, '1');
});

test('flattenTree 记录父文件夹和顺序（顶层文件夹没有父级）', () => {
  const t = tree(); fill(t);
  const { folders } = flattenTree(t as never);
  assert.equal(folders.find(x => x.id === '1')!.parentId, undefined);
  assert.equal(folders.find(x => x.id === '21')!.parentId, '20');
  assert.equal(folders.find(x => x.id === '11')!.index, 1);
});

test('不能把文件夹移进自己或子孙，也不能移动顶层文件夹', () => {
  const t = tree(); fill(t);
  const { folders } = flattenTree(t as never);
  assert.equal(canMoveFolder(folders, '20', '21').ok, false);
  assert.equal(canMoveFolder(folders, '20', '20').ok, false);
  assert.equal(canMoveFolder(folders, '1', '2').ok, false);
  assert.equal(canMoveFolder(folders, '10', '1').ok, false); // 本来就在里面
  assert.equal(canMoveFolder(folders, '10', '20').ok, true);
});

test('移动文件夹并撤销', async () => {
  const t = tree(); const w = memWriter(t);
  const { folders } = flattenTree(t as never);
  const r = await moveFolder(folders, '10', '20', w);
  assert.equal(r.ok, true);
  assert.deepEqual((await w.children('20')), ['21', '10']);
  await r.undo!.run();
  assert.deepEqual((await w.children('1')), ['10', '11', '12', '13']);
});

test('上移 / 下移同级文件夹，头尾不动，可撤销', async () => {
  const t = tree(); const w = memWriter(t);
  assert.equal((await shiftFolder('10', -1, w)).ok, false);
  const down = await shiftFolder('10', 1, w);
  assert.equal(down.ok, true);
  assert.deepEqual(await w.children('1'), ['11', '10', '12', '13']);
  const up = await shiftFolder('12', -1, w);
  assert.deepEqual(await w.children('1'), ['11', '12', '10', '13']);
  await up.undo!.run(); await down.undo!.run();
  assert.deepEqual(await w.children('1'), ['10', '11', '12', '13']);
  assert.equal((await shiftFolder('13', 1, w)).ok, false);
});

test('书签置顶并撤销', async () => {
  const t = tree(); const w = memWriter(t);
  const r = await moveToTop('13', w);
  assert.equal(r.ok, true);
  assert.deepEqual(await w.children('1'), ['13', '10', '11', '12']);
  await r.undo!.run();
  assert.deepEqual(await w.children('1'), ['10', '11', '12', '13']);
  assert.equal((await moveToTop('10', w)).ok, false);
});

test('新文件夹默认放在"其他收藏夹"，找不到名字时不写死 id', () => {
  const t = tree(); fill(t);
  const { folders } = flattenTree(t as never);
  assert.equal(defaultNewFolderParent(folders), '2');
  assert.equal(defaultNewFolderParent([{ id: '7', title: 'Favorites bar', path: ['Favorites bar'] }, { id: '9', title: 'X', path: ['X'] }]), '9');
});
