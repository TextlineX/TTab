import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Tag, FolderPlus, ExternalLink, Sparkles, X } from 'lucide-react';

interface Props {
  count: number;
  aiReady: boolean;
  onAddTag: (tag: string) => void;
  onCreateCollection: (name: string) => void;
  onOpenAll: () => void;
  onAskAI: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}

/** 多选后的批量操作条 */
const SelectionBar: React.FC<Props> = ({ count, aiReady, onAddTag, onCreateCollection, onOpenAll, onAskAI, onSelectAll, onClear }) => {
  const [mode, setMode] = useState<null | 'tag' | 'collection'>(null);
  const [text, setText] = useState('');

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    if (mode === 'tag') onAddTag(v); else onCreateCollection(v);
    setText(''); setMode(null);
  };

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
      className="tt-pop fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-1 p-1.5 rounded-[16px] max-w-[calc(100vw-32px)]"
      role="toolbar" aria-label="批量操作"
    >
      <span className="px-3 text-[13px] text-[color:var(--text)] whitespace-nowrap">已选 {count} 个</span>
      {mode ? (
        <>
          <input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setMode(null); }}
            placeholder={mode === 'tag' ? '标签名' : '组合名称'}
            className="w-40 h-9 px-3 rounded-[10px] bg-white/8 border border-white/15 outline-none text-[13px] text-[color:var(--text)]"
          />
          <Btn onClick={submit}>确定</Btn>
          <Btn onClick={() => setMode(null)}>取消</Btn>
        </>
      ) : (
        <>
          <Btn onClick={() => setMode('tag')}><Tag size={14} /> 加标签</Btn>
          <Btn onClick={() => setMode('collection')}><FolderPlus size={14} /> 存为组合</Btn>
          <Btn onClick={onOpenAll}><ExternalLink size={14} /> 全部打开</Btn>
          {aiReady && <Btn onClick={onAskAI} ai><Sparkles size={14} /> 让 AI 处理</Btn>}
          <span className="w-px h-5 bg-white/12 mx-1" />
          <Btn onClick={onSelectAll}>全选</Btn>
          <button onClick={onClear} aria-label="取消选择" className="p-2 rounded-[10px] text-[color:var(--muted)] hover:bg-white/8"><X size={16} /></button>
        </>
      )}
    </motion.div>
  );
};

const Btn: React.FC<{ onClick: () => void; children: React.ReactNode; ai?: boolean }> = ({ onClick, children, ai }) => (
  <button onClick={onClick} className={`h-9 px-3 rounded-[10px] flex items-center gap-1.5 text-[13px] whitespace-nowrap hover:bg-white/8 ${ai ? 'text-[color:var(--ai)]' : 'text-[color:var(--text)]'}`}>
    {children}
  </button>
);

export default SelectionBar;
