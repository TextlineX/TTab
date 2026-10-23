import type { CSSProperties } from 'react';

/** 每个标签有一个稳定的色相，卡片上的标签与筛选栏里的同色，方便对应 */
export function tagHue(tag: string): number {
  let h = 2166136261;
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 16777619);
  return Math.abs(h) % 360;
}

export function tagChipStyle(tag: string, variant: 'soft' | 'solid' | 'ghost' = 'soft', strength = 1): CSSProperties {
  const h = tagHue(tag);
  if (variant === 'solid') {
    return { background: `hsl(${h} 70% 70%)`, color: `hsl(${h} 45% 12%)`, borderColor: `hsl(${h} 70% 70%)` };
  }
  if (variant === 'ghost') {
    const a = 0.35 + 0.65 * Math.max(0, Math.min(1, strength));
    return { color: `hsl(${h} 80% 82% / ${a})`, borderColor: `hsl(${h} 60% 65% / ${0.18 + 0.3 * strength})`, background: 'transparent' };
  }
  return { background: `hsl(${h} 60% 60% / 0.14)`, color: `hsl(${h} 85% 84%)`, borderColor: `hsl(${h} 60% 65% / 0.25)` };
}

export const faviconUrl = (pageUrl: string, size = 64) => {
  if (!pageUrl || typeof chrome === 'undefined' || !chrome.runtime?.id) return '';
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
};
