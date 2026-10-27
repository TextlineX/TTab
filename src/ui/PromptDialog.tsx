import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';

interface Props {
  title: string;
  subtitle?: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

/** 输入一行文字的小弹窗（重命名、新建文件夹等），替代浏览器自带的 prompt() */
const PromptDialog: React.FC<Props> = ({ title, subtitle, label, initial = '', placeholder, confirmLabel = '确定', onSubmit, onClose }) => {
  const [v, setV] = useState(initial);
  const ok = v.trim().length > 0 && v.trim() !== initial;
  return (
    <Modal
      title={title} subtitle={subtitle} onClose={onClose} width={420}
      footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button variant="primary" disabled={!ok} onClick={() => onSubmit(v.trim())}>{confirmLabel}</Button></>}
    >
      <form onSubmit={e => { e.preventDefault(); if (ok) onSubmit(v.trim()); }}>
        {label && <label className="block mb-1.5 text-[12.5px] text-muted">{label}</label>}
        <input
          autoFocus value={v} onChange={e => setV(e.target.value)} onFocus={e => e.currentTarget.select()} placeholder={placeholder}
          className="w-full h-10 px-3 rounded-xl bg-fill-1 border border-line focus:border-[color:var(--accent-line)] outline-none text-[14px] text-fg placeholder:text-faint transition-colors"
        />
      </form>
    </Modal>
  );
};

export default PromptDialog;
