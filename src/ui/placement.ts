/**
 * 计算浮层位置：默认在锚点下方左对齐；下方放不下就翻到上方，右侧超出就左移。
 */
export function placePopover(anchor: DOMRect, size: { w: number; h: number }, vw: number, vh: number, gap = 6) {
  let left = anchor.left;
  if (left + size.w > vw - 8) left = Math.max(8, anchor.right - size.w);
  let top = anchor.bottom + gap;
  let placement: 'bottom' | 'top' = 'bottom';
  if (top + size.h > vh - 8 && anchor.top - gap - size.h > 8) { top = anchor.top - gap - size.h; placement = 'top'; }
  else if (top + size.h > vh - 8) top = Math.max(8, vh - 8 - size.h);
  return { left, top, placement };
}
