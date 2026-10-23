import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateHistory, slotsFromVisitTimes, nowScore, slotOf, slotLabel } from '../src/core/usage';
import { flattenTree, MOCK_TREE } from '../src/core/bookmarkSource';
import { buildItems } from '../src/core/library';
import { smartViews } from '../src/core/tagGraph';
import { emptyMeta } from '../src/core/types';

const { records } = flattenTree(MOCK_TREE);
const now = new Date('2026-10-22T10:00:00'); // 周四上午
const T = now.getTime();

test('历史记录映射到书签，首页书签合并同域名访问', () => {
  const { entries, exactUrls } = aggregateHistory(records, [
    { url: 'https://github.com/', visitCount: 10, lastVisitTime: T },
    { url: 'https://github.com/foo/bar', visitCount: 40, lastVisitTime: T },
    { url: 'https://react.dev/learn?utm_source=x', visitCount: 5, lastVisitTime: T },
    { url: 'https://react.dev/reference', visitCount: 50, lastVisitTime: T },
    { url: 'chrome://settings', visitCount: 99 },
  ]);
  assert.equal(entries['github.com'].visits, 10 + 20, '首页 = 自身 + 同域一半');
  assert.equal(entries['react.dev/learn'].visits, 5, '非首页书签只算自身');
  assert.equal(exactUrls['github.com'], 'https://github.com/');
});

test('时段划分', () => {
  assert.equal(slotOf(now), 1);
  assert.equal(slotLabel(1), '工作日上午');
  assert.equal(slotLabel(7), '周末晚上');
  const slots = slotsFromVisitTimes([T, T - 3600e3, new Date('2026-10-24T20:00:00').getTime(), 0], T - 30 * 86400e3);
  assert.equal(slots[1], 2);
  assert.equal(slots[7], 1);
  assert.equal(slots.reduce((a, b) => a + b, 0), 3, '窗口外的访问不计');
});

test('此刻推荐：当前时段常用的排在前面', () => {
  const morning = [0, 30, 2, 2, 0, 0, 0, 0];
  const evening = [0, 2, 2, 30, 0, 0, 0, 0];
  const a = nowScore({ visits: 34, last: T - 2 * 86400e3, slots: morning }, 0, now);
  const b = nowScore({ visits: 34, last: T - 2 * 86400e3, slots: evening }, 0, now);
  assert.ok(a > b * 2, `${a} vs ${b}`);
  assert.equal(nowScore(undefined, 0, now), 0);
  assert.ok(nowScore(undefined, 3, now) > 0, 'TTab 打开次数也计入');
});

test('有历史数据时出现"此刻常用"和"常用"视图', () => {
  const entries: Record<string, { visits: number; last: number; slots?: number[] }> = {};
  records.slice(0, 8).forEach((r, i) => { entries[r.key] = { visits: 10 + i, last: T, slots: [0, 5 + i, 1, 1, 0, 0, 0, 0] }; });
  const items = buildItems(records, emptyMeta(), { computedAt: T, entries }, now);
  const views = smartViews(items, T);
  assert.ok(views.find(v => v.id === 'now')!.keys.length >= 4);
  assert.equal(views.find(v => v.id === 'frequent')!.keys[0], records[7].key);
  const none = smartViews(buildItems(records, emptyMeta()), T);
  assert.equal(none.find(v => v.id === 'now')!.keys.length, 0);
});
