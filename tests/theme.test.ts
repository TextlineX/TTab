import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCENTS, buildTokens, contrast, extractPalette, resolveScheme, hexToRgb, rgbToHsl } from '../src/theme/tokens';

test('所有强调色在明暗两种模式下文字都可读', () => {
  for (const scheme of ['dark', 'light'] as const) {
    for (const a of [...ACCENTS.map(x => x.hex), '#ffff00', '#000080', '#ffffff', '#111111']) {
      const v = buildTokens(a, scheme).vars;
      const bg = v['--surface-solid'];
      assert.ok(contrast(v['--text'], bg) >= 10, `${scheme} ${a} 正文对比度 ${contrast(v['--text'], bg).toFixed(1)}`);
      assert.ok(contrast(v['--accent-text'], bg) >= 4.5, `${scheme} ${a} 强调文字对比度 ${contrast(v['--accent-text'], bg).toFixed(1)}`);
      assert.ok(contrast(v['--on-accent'], v['--accent']) >= 3, `${scheme} ${a} 按钮文字对比度 ${contrast(v['--on-accent'], v['--accent']).toFixed(1)}`);
      assert.ok(contrast(v['--accent'], bg) >= 2.9, `${scheme} ${a} 强调色与背景 ${contrast(v['--accent'], bg).toFixed(1)}`);
    }
  }
});

test('明暗模式跟随系统', () => {
  assert.equal(resolveScheme('auto', true), 'dark');
  assert.equal(resolveScheme('auto', false), 'light');
  assert.equal(resolveScheme('light', true), 'light');
});

test('从像素取色：选出鲜艳的主色，忽略灰色', () => {
  const px: number[] = [];
  for (let i = 0; i < 300; i++) px.push(128, 128, 128, 255); // 大面积灰
  for (let i = 0; i < 120; i++) px.push(30, 120, 220, 255); // 蓝
  for (let i = 0; i < 20; i++) px.push(230, 60, 60, 255); // 少量红
  const p = extractPalette(px);
  const h = rgbToHsl(hexToRgb(p.accent)).h;
  assert.ok(h > 195 && h < 230, `取到的色相 ${h}`);
  assert.ok(p.brightness > 0.1 && p.brightness < 0.4);
  // 全灰图片退回默认色
  assert.equal(extractPalette([100, 100, 100, 255, 120, 120, 120, 255]).accent.length, 7);
});
