// 客户端同步引擎 ↔ 真实的 server.mjs（本机端口）端到端
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };

test('两个浏览器通过服务器同步，并用社区共识补标签', async () => {
  const { createApp } = await import('../server/server.mjs');
  const { syncOnce } = await import('../src/core/cloud/engine');
  const { cloudAuth } = await import('../src/core/cloud/api');
  const { defaultCloud } = await import('../src/core/cloud/config');
  const { stampChanges } = await import('../src/core/cloud/sync');
  const { contribute, fetchProposals, applyProposals } = await import('../src/core/cloud/community');
  const { addTags } = await import('../src/core/library');
  const { emptyMeta } = await import('../src/core/types');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttab-e2e-'));
  const app = createApp({ dataDir: dir, minVotes: 2 });
  await new Promise<void>(r => app.listen(0, '127.0.0.1', r));
  const server = `http://127.0.0.1:${(app.address() as any).port}`;
  try {
    const a = (await cloudAuth({ server }, 'register', 'a@x.com', 'password123')).token;
    const b = (await cloudAuth({ server }, 'login', 'a@x.com', 'password123')).token;
    const cfgA = { ...defaultCloud(), server, token: a, sync: true };
    const cfgB = { ...defaultCloud(), server, token: b, sync: true };

    // 设备 A 打标签并同步
    let metaA = stampChanges(emptyMeta(), addTags(emptyMeta(), ['https://example.com/'], ['示例'], 'manual'), Date.now());
    const ra = await syncOnce(cfgA, () => metaA, fn => { metaA = fn(metaA); });
    assert.equal(ra.result.pushed, 1);

    // 设备 B 拉取
    let metaB = emptyMeta();
    const rb = await syncOnce(cfgB, () => metaB, fn => { metaB = fn(metaB); });
    assert.equal(rb.result.pulled, 1);
    assert.deepEqual(metaB.pages['https://example.com/'].tags.map(t => t.name), ['示例']);

    // 再同步一次：没有新东西
    const rb2 = await syncOnce(rb.cfg, () => metaB, fn => { metaB = fn(metaB); });
    assert.equal(rb2.result.pulled, 0);
    assert.equal(rb2.result.pushed, 0);

    // 社区：两个用户给同一网页打同样的标签；第三者没有标签时得到建议
    const u2 = (await cloudAuth({ server }, 'register', 'b@x.com', 'password123')).token;
    const u3 = (await cloudAuth({ server }, 'register', 'c@x.com', 'password123')).token;
    const k = 'https://site.dev/page';
    const mine = addTags(emptyMeta(), [k], ['编程'], 'manual');
    await contribute({ ...cfgA, token: a }, mine);
    await contribute({ ...cfgA, token: u2 }, mine);
    const c3 = { ...cfgA, token: u3 };
    const empty = addTags(emptyMeta(), [k], ['乱七八糟'], 'ai');
    const ps = await fetchProposals(c3, empty, [k]);
    assert.deepEqual(ps[0].add, ['编程']);
    assert.deepEqual(ps[0].remove, []);   // 只有 1 个网页级共识标签，不够强，不纠正
    const out = applyProposals(empty, ps);
    assert.ok(out.pages[k].tags.some(t => t.name === '编程' && t.source === 'cloud'));
  } finally { app.close_all(); app.close(); }
});
