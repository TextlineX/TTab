import React from 'react';
import { motion } from 'framer-motion';
import { spring } from './motion';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/** 开关：滑块带弹性 */
const Switch: React.FC<Props> = ({ checked, onChange, label, disabled }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative shrink-0 w-10 h-6 rounded-full p-[3px] transition-colors duration-200 disabled:opacity-40 ${checked ? 'bg-accent' : 'bg-fill-3'}`}
  >
    <motion.span
      layout
      transition={spring.snappy}
      className={`block w-[18px] h-[18px] rounded-full shadow-sm ${checked ? 'ml-auto bg-[color:var(--on-accent)]' : 'bg-white'}`}
    />
  </button>
);

export default Switch;
