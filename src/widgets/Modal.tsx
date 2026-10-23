import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const Modal: React.FC<Props> = ({ title, subtitle, onClose, width = 560, children, footer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[96] flex items-start justify-center pt-[5vh] px-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/55" />
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        className="tt-plan relative w-full max-h-[90vh] rounded-[20px] flex flex-col overflow-hidden"
        style={{ maxWidth: width }}
        role="dialog" aria-label={title}
      >
        <header className="flex items-start gap-3 p-5 pb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] text-[color:var(--text)]">{title}</h2>
            {subtitle && <p className="text-[12px] text-[color:var(--muted)] mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="关闭" className="p-1.5 rounded-lg hover:bg-white/10 text-[color:var(--muted)]"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 p-4 border-t border-white/8">{footer}</footer>}
      </motion.div>
    </div>
  );
};

export default Modal;
