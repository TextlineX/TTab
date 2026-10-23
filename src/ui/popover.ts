import { useLayoutEffect, useState } from 'react';
import { placePopover } from './placement';

export { placePopover };

export function usePopoverPosition(anchor: HTMLElement | null, popover: HTMLElement | null, open: boolean, minWidth?: number) {
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'bottom' | 'top'; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor) { setPos(null); return; }
    const update = () => {
      const r = anchor.getBoundingClientRect();
      const w = Math.max(minWidth || 0, r.width);
      const h = popover?.offsetHeight || 280;
      const p = placePopover(r, { w, h }, window.innerWidth, window.innerHeight);
      setPos({ ...p, width: w });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [anchor, popover, open, minWidth]);
  return pos;
}
