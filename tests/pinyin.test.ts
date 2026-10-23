import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinyinMatch, getPinyinInitials, getPinyinFull } from '../src/utils/pinyinUtils';

test('全拼、首字母、混合', () => {
  for (const q of ['zhihu', 'zh', 'zhh', 'zhih', 'zhihu', 'zhi']) assert.ok(pinyinMatch('知乎', q), q);
  for (const q of ['bilibili', 'blbl', 'bili', 'lbl']) assert.ok(pinyinMatch('哔哩哔哩', q), q);
  assert.ok(pinyinMatch('网易云音乐', 'yyy'));
  assert.ok(pinyinMatch('网易云音乐', 'yinyue'));
  assert.ok(pinyinMatch('高德地图', 'gaode'));
  assert.ok(pinyinMatch('Flutter 中文文档', 'zwwd'));
  assert.ok(pinyinMatch('Flutter 中文文档', 'flutter'));
  assert.ok(pinyinMatch('LeetCode 力扣', 'likou'));
  assert.ok(pinyinMatch('LeetCode 力扣', 'lk'));
});

test('多音字任一读音', () => {
  assert.ok(pinyinMatch('银行', 'yinhang'));
  assert.ok(pinyinMatch('行走', 'xingzou'));
  assert.ok(pinyinMatch('重庆', 'chongqing'));
});

test('不应误匹配', () => {
  assert.ok(!pinyinMatch('知乎', 'zhihuu'));
  assert.ok(!pinyinMatch('淘宝', 'jd'));
  assert.ok(!pinyinMatch('京东', 'jingdongx'));
  assert.ok(!pinyinMatch('GitHub', 'gitlab'));
});

test('首字母与全拼串', () => {
  assert.equal(getPinyinInitials('少数派'), 'ssp');
  assert.equal(getPinyinFull('掘金'), 'juejin');
});

test('性能：长标题', () => {
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) pinyinMatch('这是一个非常非常长的中文书签标题用于测试拼音匹配的性能表现', 'xnbx');
  assert.ok(Date.now() - t0 < 1500, `${Date.now() - t0}ms`);
});
