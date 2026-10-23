import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, normalizeTag, uniqTags } from '../src/core/normalize';
import { flattenTree, MOCK_TREE } from '../src/core/bookmarkSource';
import { inferRuleTags } from '../src/core/ruleTagger';
import { addTags, removeTags, renameTag, setManualTags, buildItems, upsertCollection, resolveCollection, mergeMeta, recordOpen } from '../src/core/library';
import { relatedTags, relatedItems, suggestCombos, smartViews, topTags } from '../src/core/tagGraph';
import { parseQuery, searchItems, currentTagPrefix } from '../src/core/search';
import { emptyMeta, type MetaState } from '../src/core/types';

const { records, folders } = flattenTree(MOCK_TREE);

function ruleTagged(): MetaState {
  let s = emptyMeta();
  for (const r of records) s = addTags(s, [r.key], inferRuleTags(r), 'rule');
  return s;
}

test('normalizeUrl 去掉 www、追踪参数、末尾斜杠', () => {
  assert.equal(normalizeUrl('https://www.github.com/'), 'github.com');
  assert.equal(normalizeUrl('https://github.com/?utm_source=edge'), 'github.com');
  assert.equal(normalizeUrl('http://a.com/x/?b=2&a=1#h'), 'a.com/x?a=1&b=2');
  assert.equal(normalizeUrl('https://bilibili.com/video/1?vd_source=abc&p=2'), 'bilibili.com/video/1?p=2');
});

test('normalizeTag 合并同义词', () => {
  assert.equal(normalizeTag('#JS'), 'javascript');
  assert.equal(normalizeTag('React.js'), 'react');
  assert.equal(normalizeTag('人工智能'), 'AI');
  assert.deepEqual(uniqTags(['React', 'react', ' #前端 ', '']), ['react', '前端']);
});

test('flattenTree 解析书签与文件夹路径', () => {
  assert.ok(records.length > 30);
  const vite = records.find(r => r.title.startsWith('Vite'))!;
  assert.deepEqual(vite.folderPath, ['收藏夹栏', '前端']);
  assert.ok(folders.some(f => f.title === 'Flutter'));
});

test('规则打标签：域名 + 关键词 + 文件夹', () => {
  const vite = records.find(r => r.title.startsWith('Vite'))!;
  const tags = inferRuleTags(vite);
  assert.ok(tags.includes('前端'));
  assert.ok(tags.includes('文档'));
  const claude = records.find(r => r.domain === 'claude.ai')!;
  assert.ok(inferRuleTags(claude).includes('AI'));
  // 通用文件夹名不应成为标签
  assert.ok(!tags.includes('收藏夹栏'));
});

test('手动删除的标签不会被自动流程加回来', () => {
  let s = ruleTagged();
  const key = records.find(r => r.domain === 'github.com')!.key;
  s = removeTags(s, [key], ['开源']);
  s = addTags(s, [key], ['开源'], 'rule');
  assert.ok(!s.pages[key].tags.some(t => t.name === '开源'));
  s = addTags(s, [key], ['开源'], 'manual');
  assert.ok(s.pages[key].tags.some(t => t.name === '开源' && t.source === 'manual'));
});

test('setManualTags / renameTag 合并', () => {
  let s = ruleTagged();
  const key = records[0].key;
  s = setManualTags(s, key, ['工作', '常用']);
  assert.deepEqual(s.pages[key].tags.map(t => t.name), ['工作', '常用']);
  s = addTags(s, [records[1].key], ['常用的'], 'manual');
  s = renameTag(s, '常用的', '常用');
  assert.ok(s.pages[records[1].key].tags.some(t => t.name === '常用'));
});

test('不可变：操作不修改原状态', () => {
  const s = ruleTagged();
  const snapshot = JSON.stringify(s);
  addTags(s, [records[0].key], ['x'], 'manual');
  removeTags(s, [records[0].key], ['开发']);
  recordOpen(s, [records[0].key]);
  assert.equal(JSON.stringify(s), snapshot);
});

test('相关标签：选中“前端”后推荐能继续筛选的标签', () => {
  const items = buildItems(records, ruleTagged());
  const rel = relatedTags(['前端'], items);
  assert.ok(rel.length > 0);
  assert.ok(rel.some(r => r.tag === '文档' && r.narrows));
  assert.ok(!rel.some(r => r.tag === '前端'));
});

test('相关网页：React 文档与前端文档相关', () => {
  const items = buildItems(records, ruleTagged());
  const react = items.find(i => i.domain === 'react.dev')!;
  const rel = relatedItems(react, items, 5);
  assert.ok(rel.length > 0);
  assert.ok(rel.slice(0, 5).some(r => r.item.tags.includes('前端')));
});

test('推荐组合有意义且不重复', () => {
  const items = buildItems(records, ruleTagged());
  const combos = suggestCombos(items);
  assert.ok(combos.length >= 3, `组合太少: ${combos.length}`);
  for (const c of combos) assert.ok(c.keys.length >= 2 && c.tags.length >= 2);
  console.log('  组合：', combos.map(c => `${c.tags.join('+')}(${c.keys.length})`).join('  '));
  console.log('  热门：', topTags(items, 12).map(t => `${t.tag}:${t.count}`).join(' '));
});

test('智能视图识别重复书签与未打标签', () => {
  const items = buildItems(records, emptyMeta());
  const views = smartViews(items);
  const dup = views.find(v => v.id === 'duplicates')!;
  assert.deepEqual(dup.keys, ['github.com']);
  assert.equal(dup.ids!.length, 1);
  assert.equal(views.find(v => v.id === 'untagged')!.keys.length, new Set(records.map(r => r.key)).size);
});

test('搜索语法：#标签 -#标签 site: 拼音', () => {
  const items = buildItems(records, ruleTagged());
  const p = parseQuery('#前端 -#vue 文档');
  assert.deepEqual(p.include, ['前端']);
  assert.deepEqual(p.exclude, ['vue']);
  const res = searchItems(items, p);
  assert.ok(res.length > 0);
  assert.ok(res.every(r => r.tags.includes('前端') && !r.tags.includes('vue')));
  assert.equal(searchItems(items, parseQuery('site:github.com')).length, 1);
  assert.ok(searchItems(items, parseQuery('zh')).some(r => r.title === '知乎'));
  assert.equal(currentTagPrefix('react #前'), '前');
  assert.equal(currentTagPrefix('react'), null);
});

test('动态集合与导入合并', () => {
  let s = ruleTagged();
  s = upsertCollection(s, { name: '设计素材', keys: [], query: { tags: ['设计'], mode: 'and' }, source: 'manual' });
  const items = buildItems(records, s);
  assert.ok(resolveCollection(s.collections[0], items).length >= 3);
  let other = emptyMeta();
  other = addTags(other, [records[0].key], ['从Chrome导入'], 'manual');
  const merged = mergeMeta(s, other);
  assert.ok(merged.pages[records[0].key].tags.some(t => t.name === '从chrome导入' || t.name === '从Chrome导入'));
  assert.equal(merged.collections.length, 1);
});
