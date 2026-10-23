import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenTree } from '../src/core/bookmarkSource';
import { addTags, buildItems } from '../src/core/library';
import { inferRuleTags } from '../src/core/ruleTagger';
import { emptyMeta } from '../src/core/types';
import { buildLocalModel, toDoc } from '../src/core/vectors/localEmbed';
import { VectorIndex } from '../src/core/vectors/semantic';
import { uniqueByKey } from '../src/core/tagGraph';
import { planOrganize, groupMoves, isLoose, defaultOrganizeOptions } from '../src/core/organize/organizer';
import { executeMoves, undoLog, type BookmarkWriter } from '../src/core/organize/executor';
import { aiPlanOrganize } from '../src/core/organize/aiPlan';

type N = chrome.bookmarks.BookmarkTreeNode;
const bm = (id: string, title: string, url: string): N => ({ id, title, url } as N);
const folder = (id: string, title: string, children: N[]): N => ({ id, title, children } as N);

// 散落的书签 + 已有分类文件夹
const TREE: N[] = [folder('0', '', [
  folder('1', '收藏夹栏', [
    folder('10', '前端', [bm('11', 'React 官方文档', 'https://react.dev/learn'), bm('12', 'Vue.js 文档', 'https://cn.vuejs.org/guide/'), bm('13', 'MDN', 'https://developer.mozilla.org/')]),
    folder('20', 'AI 工具', [bm('21', 'ChatGPT', 'https://chat.openai.com/'), bm('22', 'Claude', 'https://claude.ai/')]),
    bm('101', 'Vite 官方文档', 'https://vite.dev/guide/'),
    bm('102', 'DeepSeek', 'https://chat.deepseek.com/'),
    bm('103', '淘宝', 'https://www.taobao.com/'),
    bm('104', '京东', 'https://www.jd.com/'),
    bm('105', '拼多多', 'https://www.pinduoduo.com/'),
    bm('106', '哔哩哔哩', 'https://www.bilibili.com/'),
  ]),
  folder('2', '其他收藏夹', [bm('201', 'Tailwind CSS 文档', 'https://tailwindcss.com/docs'), bm('202', 'Kimi', 'https://kimi.moonshot.cn/')]),
])];

function setup() {
  const { records, folders } = flattenTree(TREE);
  let meta = emptyMeta();
  for (const r of records) meta = addTags(meta, [r.key], inferRuleTags(r), 'rule');
  const items = buildItems(records, meta);
  const model = buildLocalModel(uniqueByKey(items).map(i => toDoc(i)));
  return { items, folders, index: new VectorIndex('local', model.vectors) };
}

test('散落判断', () => {
  const { items } = setup();
  assert.equal(isLoose(items.find(i => i.id === '101')!), true);
  assert.equal(isLoose(items.find(i => i.id === '11')!), false);
});

test('本地方案：归入已有文件夹 + 新建主题文件夹', () => {
  const { items, folders, index } = setup();
  const plan = planOrganize(items, folders, index);
  const to = (id: string) => plan.moves.find(m => m.bookmarkId === id);
  assert.equal(to('101')?.toFolderId, '10', 'Vite → 前端');
  assert.equal(to('201')?.toFolderId, '10', 'Tailwind → 前端');
  assert.equal(to('102')?.toFolderId, '20', 'DeepSeek → AI 工具');
  assert.equal(to('202')?.toFolderId, '20', 'Kimi → AI 工具');
  assert.equal(to('103')?.toNewFolder, '购物');
  assert.equal(plan.newFolders.find(f => f.name === '购物')?.count, 3);
  assert.equal(to('106'), undefined, '哔哩哔哩没有合适去处，不动');
  assert.ok(!plan.moves.some(m => ['11', '12', '21'].includes(m.bookmarkId)), '已分类的不动');
  const groups = groupMoves(plan);
  assert.ok(groups.some(g => g.isNew && g.target.endsWith('购物')));
  console.log('  ', groups.map(g => `${g.target}${g.isNew ? '(新)' : ''}: ${g.moves.map(m => m.title).join(',')}`).join(' | '));
});

test('不允许新建文件夹时只归入已有', () => {
  const { items, folders, index } = setup();
  const plan = planOrganize(items, folders, index, { ...defaultOrganizeOptions(), allowNewFolders: false });
  assert.ok(plan.moves.every(m => m.toFolderId));
  assert.equal(plan.newFolders.length, 0);
});

// 内存书签树
function memWriter(): BookmarkWriter & { tree: Map<string, { parentId?: string; title: string }>; order: Map<string, string[]> } {
  const tree = new Map<string, { parentId?: string; title: string }>();
  const order = new Map<string, string[]>();
  const walk = (nodes: N[], parent?: string) => nodes.forEach(n => {
    tree.set(n.id, { parentId: parent, title: n.title });
    if (parent) order.set(parent, [...(order.get(parent) || []), n.id]);
    if (n.children) walk(n.children, n.id);
  });
  walk(TREE);
  let seq = 1000;
  return {
    tree, order,
    async get(id) { const n = tree.get(id); return n ? { id, parentId: n.parentId, index: n.parentId ? order.get(n.parentId)!.indexOf(id) : 0 } : undefined; },
    async createFolder(title, parentId) { const id = String(seq++); tree.set(id, { parentId, title }); order.set(parentId, [...(order.get(parentId) || []), id]); return id; },
    async move(id, parentId, index) {
      const n = tree.get(id)!;
      order.set(n.parentId!, order.get(n.parentId!)!.filter(x => x !== id));
      const list = order.get(parentId) || [];
      list.splice(index === undefined ? list.length : index, 0, id);
      order.set(parentId, list);
      n.parentId = parentId;
    },
    async childCount(id) { return (order.get(id) || []).length; },
    async removeFolder(id) { const n = tree.get(id)!; order.set(n.parentId!, order.get(n.parentId!)!.filter(x => x !== id)); tree.delete(id); },
  };
}

test('执行与撤销：完整还原位置，删除新建的空文件夹', async () => {
  const { items, folders, index } = setup();
  const plan = planOrganize(items, folders, index);
  const w = memWriter();
  const before = JSON.stringify([...w.order.entries()]);
  const { log, failed } = await executeMoves(plan.moves, '2', w);
  assert.equal(failed, 0);
  assert.equal(log.moves.length, plan.moves.length);
  assert.equal(log.createdFolders.length, 1);
  assert.equal(w.tree.get('101')!.parentId, '10');
  assert.equal(w.tree.get('103')!.parentId, log.createdFolders[0]);
  const r = await undoLog(log.id, w);
  assert.equal(r.restored, plan.moves.length);
  assert.equal(JSON.stringify([...w.order.entries()].filter(([k]) => k !== log.createdFolders[0])), before, '顺序完全还原');
  assert.equal(w.tree.has(log.createdFolders[0]), false, '空的新文件夹已删除');
});

test('撤销时跳过用户之后手动移动过的书签', async () => {
  const { items, folders, index } = setup();
  const plan = planOrganize(items, folders, index);
  const w = memWriter();
  const { log } = await executeMoves(plan.moves, '2', w);
  await w.move('101', '20');
  const r = await undoLog(log.id, w);
  assert.equal(r.skipped, 1);
  assert.equal(w.tree.get('101')!.parentId, '20');
});

test('AI 方案：校验文件夹 id、合并同名、丢弃单个新文件夹', async () => {
  const { items, folders } = setup();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    const user: string = JSON.parse(String(init.body)).messages[1].content;
    const ref = (t: string) => user.match(new RegExp(`^(b\\d+) \\| ${t}`, 'm'))![1];
    const moves = [
      { ref: ref('Vite'), folderId: '10' },
      { ref: ref('DeepSeek'), folderId: '999' }, // 不存在的文件夹
      { ref: ref('淘宝'), newFolder: '网购' }, { ref: ref('京东'), newFolder: '网购' },
      { ref: ref('哔哩哔哩'), newFolder: '视频' }, // 只有 1 个
      { ref: ref('Kimi'), newFolder: 'AI 工具' }, // 与已有同名 → 归入已有
    ];
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ moves }) } }] }));
  }) as unknown as typeof fetch;
  try {
    const plan = await aiPlanOrganize({ enabled: true, provider: 'deepseek', format: 'openai', baseUrl: 'https://x', apiKey: 'k', model: 'm' }, items, folders, defaultOrganizeOptions());
    const to = (id: string) => plan.moves.find(m => m.bookmarkId === id);
    assert.equal(to('101')?.toFolderId, '10');
    assert.equal(to('102'), undefined);
    assert.equal(to('103')?.toNewFolder, '网购');
    assert.equal(to('106'), undefined);
    assert.equal(to('202')?.toFolderId, '20');
    assert.deepEqual(plan.newFolders.map(f => f.name), ['网购']);
  } finally {
    globalThis.fetch = realFetch;
  }
});
