import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chat, extractJson, type AIConfig } from '../src/core/ai/client';
import { RefMap, resolveActions, applyActions } from '../src/core/ai/actions';
import { aiTagBatch, planCommand, buildPlanPrompt } from '../src/core/ai/tasks';
import { flattenTree, MOCK_TREE } from '../src/core/bookmarkSource';
import { buildItems, addTags } from '../src/core/library';
import { inferRuleTags } from '../src/core/ruleTagger';
import { emptyMeta } from '../src/core/types';

const { records, folders } = flattenTree(MOCK_TREE);
let meta = emptyMeta();
for (const r of records) meta = addTags(meta, [r.key], inferRuleTags(r), 'rule');
const items = buildItems(records, meta);

const openaiCfg: AIConfig = { enabled: true, provider: 'deepseek', format: 'openai', baseUrl: 'https://api.x.com/v1/', apiKey: 'sk-1', model: 'm' };
const claudeCfg: AIConfig = { enabled: true, provider: 'claude', format: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'k', model: 'claude-haiku-5-5' };

function fakeFetch(reply: string, capture: { url?: string; init?: RequestInit } = {}, status = 200, anthropic = false) {
  return (async (url: string, init: RequestInit) => {
    capture.url = url; capture.init = init;
    const body = anthropic ? { content: [{ type: 'text', text: reply }] } : { choices: [{ message: { content: reply } }] };
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

test('OpenAI 兼容格式请求', async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const out = await chat(openaiCfg, 'sys', 'hi', { json: true, fetchImpl: fakeFetch('ok', cap) });
  assert.equal(out, 'ok');
  assert.equal(cap.url, 'https://api.x.com/v1/chat/completions');
  const body = JSON.parse(String(cap.init!.body));
  assert.equal(body.messages[0].role, 'system');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal((cap.init!.headers as Record<string, string>).authorization, 'Bearer sk-1');
});

test('Claude 原生格式请求', async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const out = await chat(claudeCfg, 'sys', 'hi', { fetchImpl: fakeFetch('hello', cap, 200, true) });
  assert.equal(out, 'hello');
  assert.equal(cap.url, 'https://api.anthropic.com/v1/messages');
  const h = cap.init!.headers as Record<string, string>;
  assert.equal(h['x-api-key'], 'k');
  assert.equal(h['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(JSON.parse(String(cap.init!.body)).system, 'sys');
});

test('错误信息友好', async () => {
  await assert.rejects(chat(openaiCfg, 's', 'u', { fetchImpl: fakeFetch('x', {}, 401) }), /API Key/);
});

test('extractJson 容错', () => {
  assert.deepEqual(extractJson('好的：\n```json\n{"a":1,}\n```'), { a: 1 });
  assert.deepEqual(extractJson('前缀 {"a":[1,2]} 后缀'), { a: [1, 2] });
  assert.throws(() => extractJson('没有 json'));
});

test('resolveActions 过滤编造的编号和非法动作', () => {
  const refs = new RefMap(items);
  const acts = resolveActions([
    { type: 'addTags', items: ['b1', 'b999'], tags: ['#常用', ''] },
    { type: 'deleteBookmarks', items: ['b1'] },
    { type: 'createCollection', name: '设计', tags: ['设计'] },
    { type: 'moveBookmarks', items: ['b2'], folderId: 'nope' },
    { type: 'moveBookmarks', items: ['b2'], newFolder: '归档' },
    { type: 'open', items: [] },
  ], refs, folders);
  assert.deepEqual(acts.map(a => a.raw.type), ['addTags', 'createCollection', 'moveBookmarks']);
  assert.equal(acts[0].items.length, 1);
  assert.deepEqual((acts[0].raw as { tags: string[] }).tags, ['常用']);
  const move = acts[2];
  assert.equal(move.touchesBrowser, true);
  assert.equal(move.defaultChecked, false);
});

test('applyActions 更新数据并返回界面副作用', () => {
  const refs = new RefMap(items);
  const acts = resolveActions([
    { type: 'addTags', items: ['b1', 'b2'], tags: ['每日'] },
    { type: 'createCollection', name: '早上打开', emoji: '☀️', items: ['b1', 'b2'] },
    { type: 'open', items: ['b1'], groupTitle: '早' },
    { type: 'filter', tags: ['前端'] },
  ], refs, folders);
  const r = applyActions(meta, acts, refs);
  assert.ok(r.state.pages[refs.get('b1')!.key].tags.some(t => t.name === '每日' && t.source === 'ai'));
  assert.equal(r.state.collections[0].name, '早上打开');
  assert.equal(r.createdCollectionIds.length, 1);
  assert.equal(r.open[0].urls[0], refs.get('b1')!.url);
  assert.deepEqual(r.filter?.tags, ['前端']);
  assert.equal(meta.collections.length, 0, '原状态不变');
});

test('aiTagBatch 解析模型输出', async () => {
  const batch = items.slice(0, 3);
  const reply = JSON.stringify({ items: [
    { ref: 'b1', tags: ['开发', '代码托管', 'Git'], summary: '代码托管平台' },
    { ref: 'b77', tags: ['x'] },
  ] });
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch(reply);
  try {
    const res = await aiTagBatch(openaiCfg, batch, items);
    assert.equal(res.length, 1, '编造的 b77 被丢弃');
    assert.equal(res[0].key, batch[0].key);
    assert.deepEqual(res[0].tags, ['开发', '代码托管', 'git']);
    assert.equal(res[0].summary, '代码托管平台');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('planCommand 端到端（模拟模型）', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch(JSON.stringify({
    reply: '帮你建一个设计灵感组合',
    actions: [{ type: 'createCollection', name: '设计灵感', items: ['b20', 'b21'], tags: ['设计'] }],
  }));
  try {
    const plan = await planCommand(openaiCfg, '整理设计相关的网站', { items, folders, state: meta, selectedKeys: [], activeTags: [] });
    assert.equal(plan.reply, '帮你建一个设计灵感组合');
    assert.equal(plan.actions.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('提示词包含选中项、文件夹和词表', () => {
  const { user } = buildPlanPrompt('把这些打上 #常用', { items, folders, state: meta, selectedKeys: [items[0].key], activeTags: ['前端'] });
  assert.match(user, /【当前选中】b1/);
  assert.match(user, /【当前筛选标签】前端/);
  assert.match(user, /前端\(\d+\)/);
  assert.match(user, /\d+:收藏夹栏\/前端/);
});
