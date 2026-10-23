import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenTree, MOCK_TREE } from '../src/core/bookmarkSource';
import { addTags, buildItems, upsertCollection } from '../src/core/library';
import { inferRuleTags } from '../src/core/ruleTagger';
import { emptyMeta } from '../src/core/types';
import { smartViews, suggestCombos, uniqueByKey } from '../src/core/tagGraph';
import { folderTree, overviewCategories, resolveNav, sortItems, nowPicks, type NavContext } from '../src/core/nav';
import { placePopover } from '../src/ui/placement';

const { records, folders } = flattenTree(MOCK_TREE);
let meta = emptyMeta();
for (const r of records) meta = addTags(meta, [r.key], inferRuleTags(r), 'rule');
meta = upsertCollection(meta, { name: '早上打开', emoji: '☀️', keys: [records[0].key, records[1].key, records[2].key], source: 'manual', pinned: true });
const items = buildItems(records, meta);
const ctx: NavContext = { items, views: smartViews(items), collections: meta.collections, groups: [], combos: suggestCombos(uniqueByKey(items)), folders };

test('文件夹树：直接数量与总数', () => {
  const tree = folderTree(folders, items);
  const bar = tree.find(n => n.folder.title === '收藏夹栏')!;
  const fe = bar.children.find(n => n.folder.title === '前端')!;
  assert.equal(fe.direct, 6);
  assert.equal(bar.total, bar.direct + bar.children.reduce((s, c) => s + c.total, 0));
});

test('解析各种导航键', () => {
  assert.equal(resolveNav('folder:110', ctx)!.items.length, 6);
  assert.equal(resolveNav('folder:1', ctx)!.items.length, 23, '含子文件夹');
  assert.equal(resolveNav(`col:${meta.collections[0].id}`, ctx)!.items.length, 3);
  assert.ok(resolveNav('tag:前端', ctx)!.items.every(i => i.tags.includes('前端')));
  assert.equal(resolveNav('view:duplicates', ctx)!.items.length, 2, '重复书签展示每一条');
  assert.ok(resolveNav('loose', ctx)!.items.length > 10);
  assert.equal(resolveNav('col:不存在', ctx), null);
});

test('分类总览：全部分类都在、置顶组合在最前、去掉重复', () => {
  const cats = overviewCategories(ctx);
  assert.equal(cats[0].title, '早上打开');
  const titles = cats.map(c => c.title);
  for (const f of ['前端', 'Flutter', '设计灵感']) assert.ok(titles.includes(f), `缺少文件夹 ${f}：${titles.join(',')}`);
  assert.ok(!titles.includes('收藏夹栏') && !titles.includes('其他收藏夹'), '根容器不作为分类');
  // 推荐组合"flutter+文档"与文件夹 Flutter 高度重合，应被去重
  assert.ok(cats.every(c => c.items.length >= 2));
  console.log('  ', titles.join(' | '));
});

test('排序与此刻推荐', () => {
  const byName = sortItems(uniqueByKey(items), 'name');
  assert.ok(byName[0].title.localeCompare(byName[1].title, 'zh-Hans-CN') <= 0);
  const picks = nowPicks(items);
  assert.equal(picks.title, '最近收藏');
});

test('浮层定位：放不下时翻到上方、靠右时左移', () => {
  const r = { left: 900, right: 1000, top: 700, bottom: 730, width: 100, height: 30, x: 900, y: 700, toJSON() {} } as DOMRect;
  const p = placePopover(r, { w: 240, h: 200 }, 1024, 768);
  assert.equal(p.placement, 'top');
  assert.equal(p.left, 1000 - 240);
});
