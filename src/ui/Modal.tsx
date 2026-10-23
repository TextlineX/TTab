import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { fade, pop } from './motion';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 标题栏右侧的额外内容 */
  headerExtra?: React.ReactNode;
  /** 去掉内容区内边距（内容自己布局时） */
  bare?: boolean;
  icon?: React.ReactNode;
}

/** 通用弹窗：遮罩淡入 + 面板浮现，Esc 关闭 */
const Modal: React.FC<Props> = ({ title, subtitle, onClose, width = 560, children, footer, headerExtra, bare, icon }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[6vh] pb-6">
      <motion.div variants={fade} initial="hidden" animate="show" exit="exit" onClick={onClose} className="absolute inset-0 bg-[color:var(--scrim)] backdrop-blur-[3px]" />
      <motion.div
        variants={pop} initial="hidden" animate="show" exit="exit"
        className="tt-raised relative w-full max-h-[88vh] rounded-[22px] flex flex-col overflow-hidden"
        style={{ maxWidth: width }}
        role="dialog" aria-modal="true" aria-label={title}
      >
        <header className="flex items-start gap-3 px-6 pt-5 pb-4">
          {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted mt-1 leading-relaxed">{subtitle}</p>}
          </div>
          {headerExtra}
          <button onClick={onClose} aria-label="关闭" className="shrink-0 -mr-2 p-2 rounded-xl text-muted hover:text-fg hover:bg-fill-2 transition-colors"><X size={18} /></button>
        </header>
        <div className={`flex-1 min-h-0 overflow-y-auto ${bare ? '' : 'px-6 pb-6'}`}>{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">{footer}</footer>}
      </motion.div>
    </div>,
    document.body,
  );
};

export default Modal;
