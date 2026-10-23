import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { dropdown } from './motion';
import { usePopoverPosition } from './popover';
import { pinyinMatch } from '../utils/pinyinUtils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  group?: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  placeholder?: string;
  /** 选项多于这个数时显示搜索框（支持拼音） */
  searchAt?: number;
  size?: 'sm' | 'md';
  className?: string;
  minWidth?: number;
}

/**
 * 下拉选择：替代原生 select。
 * 键盘：↑↓ 移动、回车选择、Esc 关闭、直接输入即可搜索（支持拼音首字母）。
 */
function Select<T extends string>({ value, options, onChange, ariaLabel, placeholder = '请选择', searchAt = 8, size = 'md', className = '', minWidth = 200 }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const pos = usePopoverPosition(btn.current, pop.current, open, minWidth);
  const current = options.find(o => o.value === value);
  const searchable = options.length > searchAt;

  const filtered = useMemo(() => (q ? options.filter(o => pinyinMatch(o.label, q) || o.hint?.toLowerCase().includes(q.toLowerCase())) : options), [options, q]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setHi(Math.max(0, options.findIndex(o => o.value === value)));
    const onDown = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, options, value]);

  useEffect(() => { list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }); }, [hi]);

  const choose = (o: SelectOption<T> | undefined) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(filtered.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(filtered[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKey}
        className={`group inline-flex items-center gap-2 rounded-xl border border-line bg-fill-1 hover:bg-fill-2 hover:border-line-strong text-left transition-colors ${size === 'sm' ? 'h-8 px-2.5 text-[12.5px]' : 'h-10 px-3 text-[13.5px]'} ${open ? 'border-[color:var(--accent-line)]' : ''} ${className}`}
      >
        {current?.icon}
        <span className={`flex-1 min-w-0 truncate ${current ? 'text-fg' : 'text-faint'}`}>{current?.label || placeholder}</span>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={pop}
              variants={dropdown} initial="hidden" animate="show" exit="exit"
              style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width, transformOrigin: pos?.placement === 'top' ? 'bottom' : 'top' }}
              className="tt-raised z-[200] rounded-2xl p-1.5 flex flex-col max-h-[340px]"
              onKeyDown={onKey}
            >
              {searchable && (
                <div className="flex items-center gap-2 px-2.5 h-9 mb-1 rounded-xl bg-fill-1">
                  <Search size={14} className="text-muted" />
                  <input autoFocus value={q} onChange={e => { setQ(e.target.value); setHi(0); }} placeholder="搜索（支持拼音）" className="flex-1 min-w-0 bg-transparent outline-none text-[13px] placeholder:text-faint" />
                </div>
              )}
              <ul ref={list} role="listbox" aria-label={ariaLabel} tabIndex={searchable ? -1 : 0} className="overflow-y-auto flex flex-col outline-none" autoFocus={!searchable}>
                {filtered.map((o, i) => {
                  const showGroup = o.group && o.group !== lastGroup;
                  lastGroup = o.group;
                  return (
                    <React.Fragment key={o.value}>
                      {showGroup && <li className="px-3 pt-2 pb-1 text-[11px] text-faint">{o.group}</li>}
                      <li
                        data-i={i}
                        role="option"
                        aria-selected={o.value === value}
                        aria-disabled={o.disabled}
                        onMouseEnter={() => setHi(i)}
                        onClick={() => choose(o)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer text-[13.5px] ${i === hi ? 'bg-fill-2' : ''} ${o.disabled ? 'opacity-40' : ''}`}
                      >
                        {o.icon}
                        <span className="flex-1 min-w-0 truncate text-fg">{o.label}</span>
                        {o.hint && <span className="shrink-0 text-[11.5px] text-faint">{o.hint}</span>}
                        <Check size={14} className={`shrink-0 text-accent-text ${o.value === value ? 'opacity-100' : 'opacity-0'}`} />
                      </li>
                    </React.Fragment>
                  );
                })}
                {!filtered.length && <li className="px-3 py-3 text-[13px] text-muted">没有匹配的选项</li>}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

export default Select;
