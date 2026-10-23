import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetDef, parseWidgetFile, exportWidgetFile, hostPatternsFor, isValidPermission } from '../src/widgets/sdk/validate';
import { handleRpc, netAllowed, type RpcContext } from '../src/widgets/sdk/hostApi';
import { TEMPLATES } from '../src/widgets/templates';
import { flattenTree, MOCK_TREE } from '../src/core/bookmarkSource';
import { addTags, buildItems } from '../src/core/library';
import { inferRuleTags } from '../src/core/ruleTagger';
import { emptyMeta, type LibraryItem } from '../src/core/types';
import { daysUntil, searchUrl, describeWeather } from '../src/widgets/builtins/helpers';
import type { CustomWidgetDef } from '../src/widgets/types';

const { records } = flattenTree(MOCK_TREE);
let meta = emptyMeta();
for (const r of records) meta = addTags(meta, [r.key], inferRuleTags(r), 'rule');
const items: LibraryItem[] = buildItems(records, meta);

test('所有示例模板都能通过校验，并能导出再导入', () => {
  for (const t of TEMPLATES) {
    const r = validateWidgetDef(t.def);
    assert.ok(r.ok, `${t.id}: ${r.errors.join(';')}`);
    const back = parseWidgetFile(exportWidgetFile(r.def!));
    assert.deepEqual(back.def, r.def);
  }
});

test('校验拒绝不合法的定义', () => {
  const bad = validateWidgetDef({ id: 'Bad Id', name: '', sizes: ['x'], permissions: ['tabs', 'net:*'], html: '' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.includes('id')));
  assert.ok(bad.errors.some(e => e.includes('tabs')));
  assert.ok(bad.errors.some(e => e.includes('sizes')));
  assert.equal(parseWidgetFile('not json').ok, false);
  assert.ok(isValidPermission('net:*.example.com'));
  assert.ok(!isValidPermission('net:http://x.com'));
});

const def = (perms: CustomWidgetDef['permissions']): CustomWidgetDef => ({ ...TEMPLATES[0].def, permissions: perms });
function ctx(d: CustomWidgetDef, extra: Partial<RpcContext> = {}): RpcContext & { opened: string[]; data: Record<string, unknown> } {
  const c = {
    def: d, items, opened: [] as string[], data: {} as Record<string, unknown>,
    openUrl(u: string) { c.opened.push(u); }, notify() {},
    async getData() { return c.data; }, async setData(v: Record<string, unknown>) { c.data = v; },
    ...extra,
  };
  return c;
}

test('权限检查：没声明就不能用', async () => {
  const c = ctx(def([]));
  await assert.rejects(handleRpc(c, 'bookmarks.search', ['react']), /bookmarks/);
  await assert.rejects(handleRpc(c, 'open', ['https://a.com']), /open/);
  await assert.rejects(handleRpc(c, 'storage.set', ['k', 1]), /storage/);
  await assert.rejects(handleRpc(c, 'fetch', ['https://evil.com/x']), /没有访问/);
  await assert.rejects(handleRpc(c, 'chrome.bookmarks.remove', []), /不支持/);
  assert.equal(await handleRpc(c, 'notify', ['hi']), true, 'notify 不需要权限');
});

test('书签接口只返回必要字段', async () => {
  const c = ctx(def(['bookmarks']));
  const res = await handleRpc(c, 'bookmarks.search', ['#前端', 3]) as Record<string, unknown>[];
  assert.ok(res.length > 0 && res.length <= 3);
  assert.deepEqual(Object.keys(res[0]).sort(), ['domain', 'folder', 'summary', 'tags', 'title', 'url']);
  const list = await handleRpc(c, 'bookmarks.list', [{ tag: '设计', limit: 2 }]) as { tags: string[] }[];
  assert.ok(list.every(i => i.tags.includes('设计')));
  const tags = await handleRpc(c, 'bookmarks.tags', []) as { tag: string }[];
  assert.ok(tags.some(t => t.tag === '开发'));
});

test('打开网页只允许 http(s)', async () => {
  const c = ctx(def(['open']));
  await handleRpc(c, 'open', ['https://react.dev']);
  await assert.rejects(handleRpc(c, 'open', ['javascript:alert(1)']));
  await assert.rejects(handleRpc(c, 'open', ['chrome://settings']));
  assert.deepEqual(c.opened, ['https://react.dev']);
});

test('存储按小组件隔离、有大小上限', async () => {
  const c = ctx(def(['storage']));
  await handleRpc(c, 'storage.set', ['a', { n: 1 }]);
  assert.deepEqual(await handleRpc(c, 'storage.get', ['a']), { n: 1 });
  assert.deepEqual(await handleRpc(c, 'storage.get', []), { a: { n: 1 } });
  await assert.rejects(handleRpc(c, 'storage.set', ['big', 'x'.repeat(200 * 1024)]), /太大/);
});

test('联网只允许声明过的域名（含通配子域名）', async () => {
  const d = def(['net:api.example.com', 'net:*.cdn.org']);
  assert.ok(netAllowed(d, 'https://api.example.com/x'));
  assert.ok(!netAllowed(d, 'https://api.example.com.evil.io/x'));
  assert.ok(!netAllowed(d, 'https://example.com/'));
  assert.ok(netAllowed(d, 'https://a.b.cdn.org/x'));
  assert.ok(netAllowed(d, 'https://cdn.org/x'));
  assert.ok(!netAllowed(d, 'file:///etc/passwd'));
  const c = ctx(d, { fetchImpl: (async () => new Response('{"ok":1}', { status: 200 })) as unknown as typeof fetch });
  assert.deepEqual(await handleRpc(c, 'fetch', ['https://api.example.com/v1']), { ok: true, status: 200, text: '{"ok":1}' });
  await assert.rejects(handleRpc(c, 'fetch', ['https://api.example.com/v1', { method: 'DELETE' }]), /GET/);
  assert.deepEqual(hostPatternsFor(d), ['https://api.example.com/*', 'http://api.example.com/*', 'https://*.cdn.org/*', 'http://*.cdn.org/*']);
});

test('内置小组件的工具函数', () => {
  const now = new Date(2026, 9, 22, 15);
  assert.equal(daysUntil('2026-10-25', now), 3);
  assert.equal(daysUntil('2026-10-22', now), 0);
  assert.equal(daysUntil('2026-10-20', now), -2);
  assert.equal(daysUntil('bad', now), null);
  assert.equal(searchUrl({ engine: 'baidu', customUrl: '' }, '书签 管理'), 'https://www.baidu.com/s?wd=%E4%B9%A6%E7%AD%BE%20%E7%AE%A1%E7%90%86');
  assert.equal(searchUrl({ engine: 'custom', customUrl: 'https://s.com/?q=%s' }, 'a'), 'https://s.com/?q=a');
  assert.equal(describeWeather(61).text, '雨');
});
