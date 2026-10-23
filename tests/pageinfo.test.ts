import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml, detectCharset, fetchPageInfo, getPageInfos, describeForAI } from '../src/core/pageInfo';
import { aiTagBatch } from '../src/core/ai/tasks';
import { flattenTree, MOCK_TREE } from '../src/core/bookmarkSource';
import { buildItems } from '../src/core/library';
import { emptyMeta } from '../src/core/types';

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title> 少数派 &amp; 效率 </title>
<meta name="description" content="高效工作，品质生活">
<meta property="og:description" content="og 描述">
<meta name="keywords" content='效率,数码,App'>
<script>var x = "<title>假的</title>";</script></head>
<body><nav>菜单 菜单</nav><h1>今日 <b>推荐</b></h1><p>正文第一段&nbsp;内容</p></body></html>`;

test('parseHtml 提取标题、描述、关键词、标题和正文', () => {
  const r = parseHtml(HTML);
  assert.equal(r.title, '少数派 & 效率');
  assert.equal(r.description, '高效工作，品质生活');
  assert.equal(r.keywords, '效率,数码,App');
  assert.equal(r.heading, '今日 推荐');
  assert.ok(r.text!.includes('正文第一段 内容'));
  assert.ok(!r.text!.includes('菜单'), '导航被去掉');
});

test('detectCharset', () => {
  const enc = new TextEncoder();
  assert.equal(detectCharset('text/html; charset=GBK', new Uint8Array()), 'gbk');
  assert.equal(detectCharset(null, enc.encode('<meta charset="gb2312">')), 'gb2312');
  assert.equal(detectCharset('text/html', enc.encode('<html>')), 'utf-8');
});

test('fetchPageInfo 正确解码 GBK 网页', async () => {
  // "百度一下" 的 GBK 编码
  const gbkTitle = new Uint8Array([0xb0, 0xd9, 0xb6, 0xc8, 0xd2, 0xbb, 0xcf, 0xc2]);
  const pre = new TextEncoder().encode('<html><head><meta charset="gbk"><title>');
  const post = new TextEncoder().encode('</title></head><body></body></html>');
  const body = new Uint8Array([...pre, ...gbkTitle, ...post]);
  const fake = (async () => new Response(body, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
  const info = await fetchPageInfo('https://www.baidu.com', fake);
  assert.equal(info.title, '百度一下');
});

test('fetchPageInfo：非 HTML 或失败时标记 failed', async () => {
  const pdf = (async () => new Response('x', { headers: { 'content-type': 'application/pdf' } })) as unknown as typeof fetch;
  assert.equal((await fetchPageInfo('https://a.com/x.pdf', pdf)).failed, true);
  const boom = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
  assert.equal((await fetchPageInfo('https://a.com', boom)).failed, true);
});

test('getPageInfos 并发抓取', async () => {
  let n = 0;
  const fake = (async () => { n++; return new Response(HTML, { headers: { 'content-type': 'text/html' } }); }) as unknown as typeof fetch;
  const r = await getPageInfos(['https://a.com', 'https://b.com', 'https://c.com'], { fetchImpl: fake, skipPermissionCheck: true, concurrency: 2 });
  assert.equal(Object.keys(r).length, 3);
  assert.equal(n, 3);
  assert.match(describeForAI(r['https://a.com']), /高效工作/);
});

test('AI 打标签：提示词带简介，过滤用户删除过的标签', async () => {
  const { records } = flattenTree(MOCK_TREE);
  const items = buildItems(records, emptyMeta());
  const it = items.find(i => i.domain === 'sspai.com')!;
  let sentUser = '';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    sentUser = JSON.parse(String(init.body)).messages[1].content;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ ref: 'b1', tags: ['效率', '数码', '资讯'] }] }) } }] }));
  }) as unknown as typeof fetch;
  try {
    const res = await aiTagBatch(
      { enabled: true, provider: 'deepseek', format: 'openai', baseUrl: 'https://x', apiKey: 'k', model: 'm' },
      [it], items, undefined,
      { pageInfos: { [it.url]: { ...parseHtml(HTML), fetchedAt: 1 } }, removed: { [it.key]: ['资讯'] } },
    );
    assert.match(sentUser, /简介:高效工作/);
    assert.match(sentUser, /不要:资讯/);
    assert.deepEqual(res[0].tags, ['效率', '数码']);
  } finally {
    globalThis.fetch = realFetch;
  }
});
