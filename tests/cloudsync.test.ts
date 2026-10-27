import test from 'node:test';
import assert from 'node:assert/strict';
import { stampChanges, mergeRemote, buildPush } from '../src/core/cloud/sync';
import { buildProposals, applyProposals, contributable, sha256Hex } from '../src/core/cloud/community';
import { addTags, removeTags, upsertCollection, deleteCollection } from '../src/core/library';
import { setExtraAliases, normalizeTag } from '../src/core/normalize';
import { emptyMeta } from '../src/core/types';

test('stampChanges：只给变化的网页盖时间，没变的保持原样', () => {
  let a = addTags(emptyMeta(), ['https://a.com/', 'https://b.com/'], ['x'], 'manual');
  a = stampChanges(emptyMeta(), a, 100);
  assert.equal(a.pages['https://a.com/'].updatedAt, 100);
  const b = stampChanges(a, addTags(a, ['https://a.com/'], ['y'], 'manual'), 200);
  assert.equal(b.pages['https://a.com/'].updatedAt, 200);
  assert.equal(b.pages['https://b.com/'], a.pages['https://b.com/']);
  assert.equal(b.pages['https://b.com/'].updatedAt, 100);
});

test('stampChanges：删除组合记墓碑', () => {
  let s = upsertCollection(emptyMeta(), { id: 'c1', name: '学', keys: [], source: 'manual' });
  s = stampChanges(emptyMeta(), s, 50);
  const id = s.collections[0].id;
  const d = stampChanges(s, deleteCollection(s, id), 90);
  assert.equal(d.tombstones?.[id], 90);
  assert.equal(d.collections.length, 0);
});

test('mergeRemote：新的覆盖旧的，旧的不覆盖新的，打开次数取大', () => {
  let local = stampChanges(emptyMeta(), addTags(emptyMeta(), ['k'], ['本地'], 'manual'), 500);
  local = { ...local, pages: { k: { ...local.pages.k, opens: 5 } } };
  const older = mergeRemote(local, { pages: { k: { tags: [{ name: '旧', source: 'manual' }], updatedAt: 100, opens: 9 } }, collections: [], tombstones: {} });
  assert.equal(older, local);
  const newer = mergeRemote(local, { pages: { k: { tags: [{ name: '新', source: 'manual' }], updatedAt: 900, opens: 2 } }, collections: [], tombstones: {} });
  assert.deepEqual(newer.pages.k.tags.map(t => t.name), ['新']);
  assert.equal(newer.pages.k.opens, 5);
  assert.equal(newer.pages.k.updatedAt, 900);
});

test('mergeRemote：墓碑删除组合，但本机之后又改过的保留', () => {
  let s = upsertCollection(emptyMeta(), { name: '学', keys: [], source: 'manual' });
  s = stampChanges(emptyMeta(), s, 1000);
  const id = s.collections[0].id;
  const kept = mergeRemote(s, { pages: {}, collections: [], tombstones: { [id]: 500 } });
  assert.equal(kept.collections.length, 1);
  const gone = mergeRemote(s, { pages: {}, collections: [], tombstones: { [id]: 2000 } });
  assert.equal(gone.collections.length, 0);
  assert.equal(gone.tombstones?.[id], 2000);
  // 墓碑之后到达的旧版本不会复活
  const again = mergeRemote(gone, { pages: {}, collections: [{ ...s.collections[0], updatedAt: 1500 }], tombstones: {} });
  assert.equal(again.collections.length, 0);
});

test('mergeRemote：没有变化时返回同一个对象（避免无谓保存）', () => {
  const s = stampChanges(emptyMeta(), addTags(emptyMeta(), ['k'], ['x'], 'manual'), 10);
  assert.equal(mergeRemote(s, { pages: { k: { tags: [], updatedAt: 10 } }, collections: [], tombstones: {} }), s);
});

test('buildPush：首次全部上传，之后只传新的', () => {
  let s = addTags(emptyMeta(), ['a', 'b'], ['x'], 'manual');
  assert.equal(Object.keys(buildPush(s, 0).pages).length, 2); // 旧数据没有时间戳也要传
  s = stampChanges(emptyMeta(), s, 100);
  s = stampChanges(s, addTags(s, ['a'], ['y'], 'manual'), 300);
  assert.deepEqual(Object.keys(buildPush(s, 200).pages), ['a']);
  assert.deepEqual(Object.keys(buildPush(s, 300).pages), []);
});

test('两台设备经服务器收敛到相同结果', () => {
  const A0 = stampChanges(emptyMeta(), addTags(emptyMeta(), ['k'], ['工具'], 'manual'), 100);
  // 设备 B 拿到 A 的页面，然后改了
  let B = mergeRemote(emptyMeta(), { pages: A0.pages, collections: [], tombstones: {} });
  B = stampChanges(B, addTags(B, ['k'], ['设计'], 'manual'), 200);
  const A1 = mergeRemote(A0, { pages: buildPush(B, 0).pages, collections: [], tombstones: {} });
  assert.deepEqual(A1.pages.k.tags.map(t => t.name).sort(), ['工具', '设计']);
  assert.deepEqual(A1.pages.k.tags, B.pages.k.tags);
});

test('社区比对：只对没有手动标签的网页给建议，手动标签从不被动', () => {
  let s = addTags(emptyMeta(), ['m'], ['我的'], 'manual');
  s = addTags(s, ['a'], ['乱标', '工具'], 'ai');
  const sug = {
    hm: { page: [{ t: '大家的', n: 3 }], domain: [] },
    ha: { page: [{ t: '编程', n: 3 }, { t: '工具', n: 2 }], domain: [] },
    hn: { page: [], domain: [{ t: '新闻', n: 6 }, { t: '资讯', n: 5 }, { t: '媒体', n: 4 }] },
  };
  const hashed = [{ key: 'm', h: 'hm', d: '' }, { key: 'a', h: 'ha', d: '' }, { key: 'n', h: 'hn', d: '' }];
  const ps = buildProposals(s, hashed, sug);
  assert.equal(ps.find(p => p.key === 'm'), undefined);
  const a = ps.find(p => p.key === 'a')!;
  assert.deepEqual(a.add, ['编程']);
  assert.deepEqual(a.remove, ['乱标']);
  assert.deepEqual(ps.find(p => p.key === 'n')!.add, ['新闻', '资讯']); // 站点兜底最多 2 个
  const out = applyProposals(s, ps);
  assert.deepEqual(out.pages.a.tags.map(t => `${t.name}:${t.source}`).sort(), ['工具:ai', '编程:cloud']);
  assert.deepEqual(out.pages.m.tags.map(t => t.name), ['我的']);
  assert.equal(out.pages.a.removed, undefined); // 纠正不写进「不想要」名单
});

test('社区比对：用户移除过的标签不会再被建议', () => {
  let s = addTags(emptyMeta(), ['a'], ['编程'], 'ai');
  s = removeTags(s, ['a'], ['编程']);
  const ps = buildProposals(s, [{ key: 'a', h: 'ha', d: '' }], { ha: { page: [{ t: '编程', n: 5 }], domain: [] } });
  assert.equal(ps.length, 0);
});

test('贡献只包含手动标签，且最多 5 个；哈希不含网址', async () => {
  let s = addTags(emptyMeta(), ['https://a.com/x'], ['1', '2', '3', '4', '5', '6', '7'], 'manual');
  s = addTags(s, ['https://b.com/'], ['ai标签'], 'ai');
  const c = contributable(s);
  assert.equal(c.length, 1);
  assert.equal(c[0].tags.length, 5);
  const h = await sha256Hex('p:https://a.com/x');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes('a.com'));
});

test('服务器下发的同义词表生效，且不能覆盖内置之外的危险键', () => {
  setExtraAliases({ Rust语言: 'rust', __proto__: 'x' as unknown as string, constructor: 'y' });
  assert.equal(normalizeTag('rust语言'), 'rust');
  assert.equal(normalizeTag('toString'), 'tostring');
  setExtraAliases({});
});
