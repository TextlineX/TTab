import React from 'react';
import { motion } from 'framer-motion';
import { spring } from './motion';

interface Props {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  ariaLabel?: string;
  className?: string;
}

/** 复选框：带勾选动画，支持半选 */
const Checkbox: React.FC<Props> = ({ checked, indeterminate, onChange, label, ariaLabel, className = '' }) => {
  const box = (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      className={`${label ? '' : className} shrink-0 w-[18px] h-[18px] rounded-[6px] border flex items-center justify-center transition-colors duration-150 ${checked || indeterminate ? 'bg-accent border-accent' : 'border-line-strong bg-fill-1 hover:border-[color:var(--accent-line)]'}`}
      onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(!checked); }}
    >
      {(checked || indeterminate) && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {indeterminate && !checked
            ? <motion.path d="M3 6h6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={spring.snappy} />
            : <motion.path d="M2.5 6.2 5 8.6 9.5 3.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.18 }} />}
        </svg>
      )}
    </button>
  );
  // 没有文字时只渲染方框，方便放进外层的 <label> 里
  if (!label) return box;
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer select-none ${className}`}>
      {box}
      <span className="text-[13px] text-fg">{label}</span>
    </label>
  );
};

export default Checkbox;
