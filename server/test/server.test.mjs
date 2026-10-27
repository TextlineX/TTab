import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

async function boot(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttab-'));
  const app = createApp({ dataDir: dir, ...opts });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const call = async (method, p, body, token) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    return { status: r.status, body: await r.json() };
  };
  const close = () => { app.close_all(); app.close(); };
  return { call, close, dir };
}
const reg = async (call, email) => (await call('POST', '/api/register', { email, password: 'password123' })).body.token;

test('注册、登录、错误密码、重复邮箱', async () => {
  const { call, close } = await boot();
  const r = await call('POST', '/api/register', { email: 'A@x.com', password: 'password123' });
  assert.equal(r.status, 200);
  assert.equal((await call('POST', '/api/register', { email: 'a@x.com', password: 'password123' })).status, 409);
  assert.equal((await call('POST', '/api/register', { email: 'bad', password: 'password123' })).status, 400);
  assert.equal((await call('POST', '/api/register', { email: 'b@x.com', password: 'short' })).status, 400);
  assert.equal((await call('POST', '/api/login', { email: 'a@x.com', password: 'nope' })).status, 401);
  const ok = await call('POST', '/api/login', { email: 'a@x.com', password: 'password123' });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/api/me', null, ok.body.token)).body.user.email, 'a@x.com');
  assert.equal((await call('GET', '/api/me', null, 'garbage')).status, 401);
  close();
});

test('退出登录让旧令牌失效', async () => {
  const { call, close } = await boot();
  const t = await reg(call, 'a@x.com');
  await call('POST', '/api/logout', {}, t);
  assert.equal((await call('GET', '/api/me', null, t)).status, 401);
  close();
});

test('关闭注册', async () => {
  const { call, close } = await boot({ allowRegister: false });
  assert.equal((await call('POST', '/api/register', { email: 'a@x.com', password: 'password123' })).status, 403);
  close();
});

test('同步：后修改者优先，游览器之间互相拿到', async () => {
  const { call, close } = await boot();
  const t = await reg(call, 'a@x.com');
  const now = Date.now();
  await call('POST', '/api/sync', { pages: { 'https://a.com/': { tags: [{ name: '工具', source: 'manual' }], updatedAt: now - 1000 } } }, t);
  // 旧的修改不会覆盖
  await call('POST', '/api/sync', { pages: { 'https://a.com/': { tags: [{ name: '旧', source: 'ai' }], updatedAt: now - 5000 } } }, t);
  const b = await call('POST', '/api/sync', { cursor: 0 }, t);
  assert.deepEqual(b.body.pages['https://a.com/'].tags.map(x => x.name), ['工具']);
  // 增量：游标之后没有变化
  const c = await call('POST', '/api/sync', { cursor: b.body.cursor }, t);
  assert.equal(Object.keys(c.body.pages).length, 0);
  // 新的修改会覆盖
  await call('POST', '/api/sync', { pages: { 'https://a.com/': { tags: [{ name: '新', source: 'manual' }], updatedAt: now } } }, t);
  const d = await call('POST', '/api/sync', { cursor: b.body.cursor }, t);
  assert.deepEqual(d.body.pages['https://a.com/'].tags.map(x => x.name), ['新']);
  close();
});

test('同步：用户之间互相隔离；组合删除用墓碑', async () => {
  const { call, close } = await boot();
  const a = await reg(call, 'a@x.com'); const b = await reg(call, 'b@x.com');
  const now = Date.now();
  await call('POST', '/api/sync', { collections: [{ id: 'c1', name: '学习', keys: ['https://a.com/'], updatedAt: now - 100 }] }, a);
  assert.equal((await call('POST', '/api/sync', {}, b)).body.collections.length, 0);
  const got = await call('POST', '/api/sync', { cursor: 0 }, a);
  assert.equal(got.body.collections.length, 1);
  await call('POST', '/api/sync', { tombstones: { c1: now } }, a);
  const after = await call('POST', '/api/sync', { cursor: 0 }, a);
  assert.equal(after.body.collections.length, 0);
  assert.equal(after.body.tombstones.c1, now);
  // 另一台设备带着更旧的组合上传，不能把它复活
  await call('POST', '/api/sync', { collections: [{ id: 'c1', name: '学习', keys: [], updatedAt: now - 50 }] }, a);
  assert.equal((await call('POST', '/api/sync', { cursor: 0 }, a)).body.collections.length, 0);
  close();
});

test('同步：脏数据被清理，未知来源回落为手动', async () => {
  const { call, close } = await boot();
  const t = await reg(call, 'a@x.com');
  await call('POST', '/api/sync', { pages: { 'https://a.com/': { tags: [{ name: 'x', source: 'evil' }, { name: '' }, null], updatedAt: 'now' }, '': {}, 'https://b.com/': 5 } }, t);
  const r = await call('POST', '/api/sync', { cursor: 0 }, t);
  assert.deepEqual(Object.keys(r.body.pages), ['https://a.com/']);
  assert.deepEqual(r.body.pages['https://a.com/'].tags, [{ name: 'x', source: 'manual' }]);
  close();
});

test('社区：达到票数才给建议，同一人重复投票只算一票', async () => {
  const { call, close } = await boot({ minVotes: 2 });
  const a = await reg(call, 'a@x.com'); const b = await reg(call, 'b@x.com');
  const item = { h: 'abc123', d: 'def456', tags: ['编程'] };
  await call('POST', '/api/contribute', { items: [item, item] }, a);
  assert.deepEqual((await call('POST', '/api/suggest', { items: [{ h: 'abc123' }] }, b)).body.suggestions, {});
  await call('POST', '/api/contribute', { items: [item] }, b);
  const s = await call('POST', '/api/suggest', { items: [{ h: 'abc123', d: 'def456' }] }, a);
  assert.deepEqual(s.body.suggestions.abc123.page, [{ t: '编程', n: 2 }]);
  // 收回贡献
  await call('DELETE', '/api/contributions', {}, b);
  assert.deepEqual((await call('POST', '/api/suggest', { items: [{ h: 'abc123' }] }, a)).body.suggestions, {});
  close();
});

test('删除账号会清掉数据与投票', async () => {
  const { call, close, dir } = await boot({ minVotes: 1 });
  const t = await reg(call, 'a@x.com');
  await call('POST', '/api/contribute', { items: [{ h: 'aa', tags: ['x'] }] }, t);
  await call('POST', '/api/sync', { pages: { 'https://a.com/': { tags: [], updatedAt: 1 } } }, t);
  assert.equal((await call('DELETE', '/api/account', { password: 'wrong' }, t)).status, 401);
  assert.equal((await call('DELETE', '/api/account', { password: 'password123' }, t)).status, 200);
  assert.equal((await call('GET', '/api/me', null, t)).status, 401);
  const t2 = await reg(call, 'b@x.com');
  assert.deepEqual((await call('POST', '/api/suggest', { items: [{ h: 'aa' }] }, t2)).body.suggestions, {});
  close();
  assert.equal(fs.readdirSync(path.join(dir, 'sync')).length, 0);
});

test('数据落盘后重启仍在', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttab-'));
  let s = await boot(); s.close();
  const first = createApp({ dataDir: dir }); await new Promise(r => first.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${first.address().port}`;
  const post = (u, b, t) => fetch(url + u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(b) }).then(r => r.json());
  const { token } = await post('/api/register', { email: 'a@x.com', password: 'password123' });
  await post('/api/sync', { pages: { 'https://a.com/': { tags: [{ name: 'k', source: 'manual' }], updatedAt: 5 } } }, token);
  first.close_all(); first.close();
  const second = createApp({ dataDir: dir }); await new Promise(r => second.listen(0, '127.0.0.1', r));
  const u2 = `http://127.0.0.1:${second.address().port}`;
  const r = await fetch(u2 + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{"cursor":0}' }).then(x => x.json());
  assert.equal(r.pages['https://a.com/'].tags[0].name, 'k');
  second.close_all(); second.close();
});

test('同义词表由服务器管理员编辑', async () => {
  const { call, close, dir } = await boot();
  assert.deepEqual((await call('GET', '/api/aliases')).body.aliases, {});
  fs.writeFileSync(path.join(dir, 'aliases.json'), JSON.stringify({ js: '编程' }));
  assert.equal((await call('GET', '/api/aliases')).body.aliases.js, '编程');
  close();
});
