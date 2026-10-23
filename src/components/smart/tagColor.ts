import type { CSSProperties } from 'react';

/** 每个标签有一个稳定的色相，卡片上的标签与筛选栏里的同色，方便对应 */
export function tagHue(tag: string): number {
  let h = 2166136261;
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 16777619);
  return Math.abs(h) % 360;
}

/** 标签的颜色：色相固定，明暗跟随主题（变量在 theme/tokens.ts 里按深色 / 浅色生成） */
export function tagChipStyle(tag: string, variant: 'soft' | 'solid' | 'ghost' = 'soft', strength = 1): CSSProperties {
  const h = tagHue(tag);
  if (variant === 'solid') {
    const bg = `hsl(${h} 65% var(--tag-solid-l, 70%))`;
    return { background: bg, color: `hsl(${h} 45% var(--tag-solid-text, 12%))`, borderColor: bg };
  }
  if (variant === 'ghost') {
    const a = 0.45 + 0.55 * Math.max(0, Math.min(1, strength));
    return { color: `hsl(${h} var(--tag-s, 85%) var(--tag-l, 84%) / ${a})`, borderColor: `hsl(${h} 60% 55% / ${0.18 + 0.3 * strength})`, background: 'transparent' };
  }
  return {
    background: `hsl(${h} 60% var(--tag-bg-l, 60%) / var(--tag-bg-a, 0.14))`,
    color: `hsl(${h} var(--tag-s, 85%) var(--tag-l, 84%))`,
    borderColor: `hsl(${h} 60% 55% / var(--tag-line-a, 0.25))`,
  };
}

export const faviconUrl = (pageUrl: string, size = 64) => {
  if (!pageUrl || typeof chrome === 'undefined' || !chrome.runtime?.id) return '';
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
};
