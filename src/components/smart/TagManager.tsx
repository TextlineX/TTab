import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Trash2, Search } from 'lucide-react';
import type { LibraryItem, MetaState } from '../../core/types';
import { topTags } from '../../core/tagGraph';
import { renameTag, deleteTagEverywhere } from '../../core/library';
import { normalizeTag } from '../../core/normalize';
import { tagChipStyle } from './tagColor';

interface Props {
  items: LibraryItem[];
  update: (fn: (s: MetaState) => MetaState, label?: string) => void;
  onPick: (tag: string) => void;
  onClose: () => void;
}

/** 标签管理：重命名、合并（改成已有的名字即合并）、删除 */
const TagManager: React.FC<Props> = ({ items, update, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const tags = useMemo(() => topTags(items, 1000), [items]);
  const shown = tags.filter(t => !q || t.tag.toLowerCase().includes(q.toLowerCase()));

  const commit = (from: string) => {
    const to = normalizeTag(draft);
    setEditing(null);
    if (!to || to === from) return;
    const merging = tags.some(t => t.tag === to);
    update(s => renameTag(s, from, to), merging ? `合并 #${from} 到 #${to}` : `重命名 #${from}`);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center pt-[10vh] px-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        className="tt-plan relative w-full max-w-[520px] max-h-[75vh] rounded-[20px] flex flex-col overflow-hidden"
        role="dialog" aria-label="管理标签"
      >
        <div className="flex items-center gap-3 p-4 border-b border-white/8">
          <Search size={16} className="text-[color:var(--muted)]" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`在 ${tags.length} 个标签中查找`} className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]" />
          <button onClick={onClose} aria-label="关闭" className="p-1.5 rounded-lg hover:bg-white/10 text-[color:var(--muted)]"><X size={16} /></button>
        </div>
        <p className="px-5 pt-3 text-[12px] text-[color:var(--muted)]">双击改名；改成已有标签的名字会把两个标签合并。</p>
        <ul className="flex-1 overflow-y-auto p-3 flex flex-col">
          {shown.map(t => (
            <li key={t.tag} className="group flex items-center gap-3 px-2 py-1.5 rounded-[10px] hover:bg-white/5">
              {editing === t.tag ? (
                <input
                  autoFocus value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => commit(t.tag)}
                  onKeyDown={e => { if (e.key === 'Enter') commit(t.tag); if (e.key === 'Escape') setEditing(null); }}
                  className="flex-1 h-7 px-2 rounded-md bg-white/8 border border-white/20 outline-none text-[13px] text-[color:var(--text)]"
                />
              ) : (
                <button
                  onClick={() => { onPick(t.tag); onClose(); }}
                  onDoubleClick={() => { setEditing(t.tag); setDraft(t.tag); }}
                  style={tagChipStyle(t.tag, 'soft')}
                  className="px-2 h-7 rounded-full border text-[13px]"
                  title="单击筛选，双击改名"
                >
                  {t.tag}
                </button>
              )}
              <span className="text-[12px] text-[color:var(--muted)]">{t.count}</span>
              <button
                onClick={() => update(s => deleteTagEverywhere(s, t.tag), `删除标签 #${t.tag}`)}
                aria-label={`删除标签 ${t.tag}`}
                className="ml-auto p-1.5 rounded-md text-[color:var(--muted)] opacity-0 group-hover:opacity-100 hover:text-red-300 hover:bg-red-500/10"
              ><Trash2 size={14} /></button>
            </li>
          ))}
          {!shown.length && <li className="p-4 text-center text-[13px] text-[color:var(--muted)]">没有匹配的标签</li>}
        </ul>
      </motion.div>
    </div>
  );
};

export default TagManager;
