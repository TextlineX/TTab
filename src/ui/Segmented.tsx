import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { spring } from './motion';

interface Option<T extends string> { value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  full?: boolean;
}

/** 分段选择：选中背景在选项之间滑动 */
function Segmented<T extends string>({ value, options, onChange, size = 'md', ariaLabel, full }: Props<T>) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`relative inline-flex p-1 rounded-xl bg-fill-1 border border-line ${full ? 'w-full' : ''}`}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`relative z-0 flex-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] transition-colors duration-150 ${size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3.5 text-[13px]'} ${on ? 'text-fg' : 'text-muted hover:text-fg'}`}
          >
            {on && <motion.span layoutId={`seg-${id}`} transition={spring.snappy} className="absolute inset-0 -z-10 rounded-[9px] bg-raised shadow-[var(--shadow-sm)] border border-line" />}
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
