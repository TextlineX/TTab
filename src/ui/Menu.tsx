import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { dropdown } from './motion';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  hint?: string;
  disabled?: boolean;
  divider?: boolean;
}

interface Props {
  x: number;
  y: number;
  title?: string;
  items: MenuItem[];
  onClose: () => void;
}

/** 右键 / 更多菜单：自动避开屏幕边缘，支持键盘 */
const Menu: React.FC<Props> = ({ x, y, title, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const actionable = items.map((it, i) => (!it.divider && !it.disabled ? i : -1)).filter(i => i >= 0);
  const [hi, setHi] = useState(-1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    setPos({ left: Math.min(x, window.innerWidth - w - 8), top: y + h > window.innerHeight - 8 ? Math.max(8, y - h) : y });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => actionable[(actionable.indexOf(h) + 1) % actionable.length]); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => actionable[(actionable.indexOf(h) - 1 + actionable.length) % actionable.length]); }
      else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); items[hi].onSelect?.(); onClose(); }
    };
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('blur', onClose);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown); window.removeEventListener('blur', onClose); };
  }, [actionable, hi, items, onClose]);

  return createPortal(
    <motion.div
      ref={ref}
      variants={dropdown} initial="hidden" animate="show" exit="exit"
      style={{ position: 'fixed', left: pos.left, top: pos.top, transformOrigin: 'top left' }}
      className="tt-raised z-[210] min-w-[200px] max-w-[280px] rounded-2xl p-1.5"
      role="menu"
      onContextMenu={e => e.preventDefault()}
    >
      {title && <div className="px-3 pt-1.5 pb-2 text-[12px] text-faint truncate border-b border-line mb-1">{title}</div>}
      {items.map((it, i) => it.divider ? (
        <div key={i} className="h-px my-1 mx-2 bg-line" />
      ) : (
        <button
          key={i}
          role="menuitem"
          disabled={it.disabled}
          onMouseEnter={() => setHi(i)}
          onClick={() => { it.onSelect?.(); onClose(); }}
          className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-xl text-[13.5px] text-left disabled:opacity-40 ${i === hi ? 'bg-fill-2' : ''} ${it.danger ? 'text-danger' : 'text-fg'}`}
        >
          <span className={`shrink-0 ${it.danger ? '' : 'text-muted'}`}>{it.icon}</span>
          <span className="flex-1 truncate">{it.label}</span>
          {it.hint && <span className="text-[11.5px] text-faint">{it.hint}</span>}
        </button>
      ))}
    </motion.div>,
    document.body,
  );
};

export default Menu;
