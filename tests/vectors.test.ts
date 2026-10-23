import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantize, dequantize, normalize, dot, kmeans } from '../src/core/vectors/vecmath';
import { buildLocalModel, embedQueryLocal, toDoc } from '../src/core/vectors/localEmbed';
import { VectorIndex } from '../src/core/vectors/semantic';
import { embedTexts, resolveEmbedKey, type EmbedConfig } from '../src/core/vectors/embedApi';
import { syncApiVectors, indexFromStore, coverage } from '../src/core/vectors/vectorStore';
import { flattenTree, MOCK_TREE } from '../src/core/bookmarkSource';
import { addTags, buildItems } from '../src/core/library';
import { inferRuleTags } from '../src/core/ruleTagger';
import { uniqueByKey } from '../src/core/tagGraph';
import { emptyMeta } from '../src/core/types';

const { records } = flattenTree(MOCK_TREE);
let meta = emptyMeta();
for (const r of records) meta = addTags(meta, [r.key], inferRuleTags(r), 'rule');
const items = uniqueByKey(buildItems(records, meta));
const byTitle = (t: string) => items.find(i => i.title === t)!;

test('量化往返误差很小', () => {
  const v = normalize(Float32Array.from({ length: 512 }, (_, i) => Math.sin(i * 1.7)));
  const back = dequantize(quantize(v));
  assert.equal(back.length, 512);
  assert.ok(dot(v, back) > 0.999);
  const odd = normalize(Float32Array.from([0.1, -0.5, 0.3]));
  assert.ok(dot(odd, dequantize(quantize(odd))) > 0.999, '长度不是 3 的倍数也能还原');
});

test('k-means 分开两团点', () => {
  const a = [[1, 0.1], [0.9, 0.2], [1, 0]].map(p => normalize(Float32Array.from(p)));
  const b = [[0.1, 1], [0, 1], [0.2, 0.9]].map(p => normalize(Float32Array.from(p)));
  const { assign } = kmeans([...a, ...b], 2);
  assert.equal(new Set([assign[0], assign[1], assign[2]]).size, 1);
  assert.equal(new Set([assign[3], assign[4], assign[5]]).size, 1);
  assert.notEqual(assign[0], assign[3]);
});

test('本地向量：相关网页', () => {
  const model = buildLocalModel(items.map(i => toDoc(i)));
  const idx = new VectorIndex('local', model.vectors);
  const top = (t: string, n = 2) => idx.similarTo(byTitle(t).key, n).map(h => items.find(i => i.key === h.key)!.title);
  assert.ok(top('ChatGPT').every(t => ['Claude', 'DeepSeek'].includes(t)), top('ChatGPT').join());
  assert.deepEqual(top('淘宝', 1), ['京东']);
  assert.ok(top('Figma', 3).includes('Dribbble'));
});

test('本地向量：查询', () => {
  const model = buildLocalModel(items.map(i => toDoc(i)));
  const idx = new VectorIndex('local', model.vectors);
  const q = (s: string) => idx.search(embedQueryLocal(model, s), 3).map(h => items.find(i => i.key === h.key)!.title);
  assert.equal(q('图片素材')[0], 'Unsplash 免费图片');
  assert.ok(q('购物').includes('淘宝'));
  assert.ok(q('前端文档').some(t => /Vue|Vite|React/.test(t)), q('前端文档').join());
  assert.deepEqual(q('完全不存在的词语组合'), []);
});

test('本地向量：自动分组有意义', () => {
  const model = buildLocalModel(items.map(i => toDoc(i)));
  const clusters = new VectorIndex('local', model.vectors).clusters(items);
  assert.ok(clusters.length >= 3);
  const ai = clusters.find(c => c.keys.includes(byTitle('ChatGPT').key))!;
  assert.ok(ai && ai.keys.includes(byTitle('Claude').key));
  assert.ok(clusters.every(c => c.keys.length >= 3 && c.label && !c.label.includes('收藏夹')));
});

const cfg: EmbedConfig = { mode: 'api', provider: 'qwen', baseUrl: 'https://e.example/v1', apiKey: 'k', model: 'text-embedding-v3' };
function fakeEmbed(counter: { calls: number; inputs: number }) {
  return (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    counter.calls++; counter.inputs += body.input.length;
    // 用文本长度造一个确定的向量，故意打乱返回顺序
    const data = body.input.map((t: string, i: number) => ({ index: i, embedding: [t.length % 7 + 1, (t.charCodeAt(0) % 5) + 1, i + 1] })).reverse();
    return new Response(JSON.stringify({ data }));
  }) as unknown as typeof fetch;
}

test('向量接口：分批、按 index 排序', async () => {
  const c = { calls: 0, inputs: 0 };
  const vecs = await embedTexts(cfg, Array.from({ length: 23 }, (_, i) => `t${i}`), { fetchImpl: fakeEmbed(c) });
  assert.equal(vecs.length, 23);
  assert.equal(c.calls, 3, '通义每批 10 条');
  // index 0 对应第一个输入
  const first = await embedTexts(cfg, ['ab', 'abc'], { fetchImpl: fakeEmbed({ calls: 0, inputs: 0 }) });
  assert.ok(Math.abs(first[0][2] / first[0][0] - 1 / 3) < 1e-5);
});

test('增量同步：只处理新增和变化的网页，换模型重建', async () => {
  const docs = items.slice(0, 12).map(i => toDoc(i));
  const c = { calls: 0, inputs: 0 };
  let store = await syncApiVectors(docs, cfg, { fetchImpl: fakeEmbed(c), persist: false });
  assert.equal(c.inputs, 12);
  assert.equal(coverage(store, docs, 'qwen:text-embedding-v3'), 1);
  store = await syncApiVectors(docs, cfg, { fetchImpl: fakeEmbed(c), persist: false, store });
  assert.equal(c.inputs, 12, '没有变化就不请求');
  const changed = docs.map((d, i) => (i === 0 ? { ...d, summary: '新的简介' } : d));
  store = await syncApiVectors(changed.slice(0, 11), cfg, { fetchImpl: fakeEmbed(c), persist: false, store });
  assert.equal(c.inputs, 13, '只重新生成变化的 1 个');
  assert.equal(Object.keys(store.items).length, 11, '删除的书签被清理');
  store = await syncApiVectors(docs, { ...cfg, model: 'other' }, { fetchImpl: fakeEmbed(c), persist: false, store });
  assert.equal(c.inputs, 25, '换模型全部重建');
  assert.equal(indexFromStore(store).size, 12);
});

test('同一家服务商时复用对话 API Key', () => {
  const e = resolveEmbedKey({ ...cfg, apiKey: '' }, { provider: 'qwen', apiKey: 'chat-key' });
  assert.equal(e.apiKey, 'chat-key');
  const e2 = resolveEmbedKey({ ...cfg, apiKey: '' }, { provider: 'deepseek', apiKey: 'chat-key' });
  assert.equal(e2.apiKey, '');
});
