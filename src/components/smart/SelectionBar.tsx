import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Tag, FolderPlus, ExternalLink, Sparkles, X, FolderInput } from 'lucide-react';
import { spring } from '../../ui/motion';

interface Props {
  count: number;
  aiReady: boolean;
  onAddTag: (tag: string) => void;
  onCreateCollection: (name: string) => void;
  onOpenAll: () => void;
  onMove?: () => void;
  onAskAI: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}

/** 多选后的批量操作条 */
const SelectionBar: React.FC<Props> = ({ count, aiReady, onAddTag, onCreateCollection, onOpenAll, onMove, onAskAI, onSelectAll, onClear }) => {
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
      initial={{ y: 30, opacity: 0, x: '-50%' }} animate={{ y: 0, opacity: 1, x: '-50%' }} exit={{ y: 30, opacity: 0, x: '-50%' }} transition={spring.smooth}
      className="tt-raised fixed bottom-6 left-1/2 z-[80] flex items-center gap-1 p-1.5 rounded-2xl max-w-[calc(100vw-32px)] overflow-x-auto"
      role="toolbar" aria-label="批量操作"
    >
      <span className="flex items-center gap-2 px-3 text-[13px] text-fg whitespace-nowrap"><motion.span key={count} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={spring.snappy} className="min-w-6 h-6 px-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold flex items-center justify-center">{count}</motion.span>已选</span>
      {mode ? (
        <>
          <input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setMode(null); }}
            placeholder={mode === 'tag' ? '标签名' : '组合名称'}
            className="w-40 h-9 px-3 rounded-xl bg-fill-2 border border-[color:var(--accent-line)] outline-none text-[13px] text-fg"
          />
          <Btn onClick={submit}>确定</Btn>
          <Btn onClick={() => setMode(null)}>取消</Btn>
        </>
      ) : (
        <>
          <Btn onClick={() => setMode('tag')}><Tag size={14} /> 加标签</Btn>
          <Btn onClick={() => setMode('collection')}><FolderPlus size={14} /> 存为组合</Btn>
          {onMove && <Btn onClick={onMove}><FolderInput size={14} /> 移动到文件夹</Btn>}
          <Btn onClick={onOpenAll}><ExternalLink size={14} /> 全部打开</Btn>
          {aiReady && <Btn onClick={onAskAI} ai><Sparkles size={14} /> 让 AI 处理</Btn>}
          <span className="w-px h-5 bg-fill-3 mx-1" />
          <Btn onClick={onSelectAll}>全选</Btn>
          <button onClick={onClear} aria-label="取消选择" className="p-2 rounded-[10px] text-muted hover:bg-fill-2"><X size={16} /></button>
        </>
      )}
    </motion.div>
  );
};

const Btn: React.FC<{ onClick: () => void; children: React.ReactNode; ai?: boolean }> = ({ onClick, children, ai }) => (
  <button onClick={onClick} className={`h-9 px-3 rounded-xl flex items-center gap-1.5 text-[13px] whitespace-nowrap hover:bg-fill-2 transition-colors ${ai ? 'text-ai' : 'text-fg'}`}>
    {children}
  </button>
);

export default SelectionBar;
