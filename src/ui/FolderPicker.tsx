import React, { useMemo, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './Modal';
import Button from './Button';
import type { FolderRecord } from '../core/types';
import { pinyinMatch } from '../utils/pinyinUtils';

interface Props {
  folders: FolderRecord[];
  title?: string;
  subtitle?: string;
  value?: string;
  /** 每个文件夹里的书签数（可选，显示在右侧） */
  counts?: Map<string, number>;
  confirmLabel?: string;
  onPick: (folderId: string) => void;
  onClose: () => void;
}

interface Node { f: FolderRecord; children: Node[] }

/** 文件夹选择器：树形浏览 + 搜索（支持拼音），双击直接选择 */
const FolderPicker: React.FC<Props> = ({ folders, title = '选择文件夹', subtitle, value, counts, confirmLabel = '选择', onPick, onClose }) => {
  const [sel, setSel] = useState<string | undefined>(value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => {
    // 默认展开到当前选中项
    const s = new Set<string>(folders.filter(f => f.path.length === 1).map(f => f.id));
    const cur = folders.find(f => f.id === value);
    if (cur) folders.filter(f => cur.path.slice(0, -1).join('/').startsWith(f.path.join('/'))).forEach(f => s.add(f.id));
    return s;
  });

  const tree = useMemo(() => {
    const byPath = new Map(folders.map(f => [f.path.join('/'), { f, children: [] as Node[] }]));
    const roots: Node[] = [];
    for (const n of byPath.values()) {
      const parent = byPath.get(n.f.path.slice(0, -1).join('/'));
      (parent ? parent.children : roots).push(n);
    }
    return roots;
  }, [folders]);

  const matches = useMemo(() => (q ? folders.filter(f => pinyinMatch(f.title, q)) : []), [folders, q]);
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const row = (f: FolderRecord, depth: number, hasChildren: boolean, label?: string) => (
    <div
      key={f.id}
      role="treeitem"
      aria-selected={sel === f.id}
      onClick={() => setSel(f.id)}
      onDoubleClick={() => onPick(f.id)}
      className={`flex items-center gap-1.5 h-9 pr-3 rounded-xl cursor-pointer text-[13.5px] ${sel === f.id ? 'bg-accent-soft text-fg' : 'hover:bg-fill-1 text-fg'}`}
      style={{ paddingLeft: 8 + depth * 18 }}
    >
      <button
        aria-label={open.has(f.id) ? '收起' : '展开'}
        onClick={e => { e.stopPropagation(); toggle(f.id); }}
        className={`w-5 h-5 flex items-center justify-center rounded-md text-faint hover:text-fg ${hasChildren ? '' : 'invisible'}`}
      >
        <ChevronRight size={14} className={`transition-transform duration-200 ${open.has(f.id) ? 'rotate-90' : ''}`} />
      </button>
      {sel === f.id ? <FolderOpen size={16} className="text-accent-text shrink-0" /> : <Folder size={16} className="text-muted shrink-0" />}
      <span className="flex-1 truncate">{label || f.title}</span>
      {counts?.get(f.id) ? <span className="text-[11.5px] text-faint">{counts.get(f.id)}</span> : null}
    </div>
  );

  const render = (nodes: Node[], depth: number): React.ReactNode => nodes.map(n => (
    <React.Fragment key={n.f.id}>
      {row(n.f, depth, n.children.length > 0)}
      <AnimatePresence initial={false}>
        {open.has(n.f.id) && n.children.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            {render(n.children, depth + 1)}
          </motion.div>
        )}
      </AnimatePresence>
    </React.Fragment>
  ));

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width={460}
      footer={<>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={!sel} onClick={() => sel && onPick(sel)}>{confirmLabel}</Button>
      </>}
    >
      <div className="flex items-center gap-2 px-3 h-10 mb-3 rounded-xl bg-fill-1 border border-line focus-within:border-[color:var(--accent-line)]">
        <Search size={15} className="text-muted" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="搜索文件夹（支持拼音）" className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] placeholder:text-faint" />
      </div>
      <div role="tree" aria-label="文件夹" className="flex flex-col min-h-[240px]">
        {q
          ? (matches.length ? matches.map(f => row(f, 0, false, f.path.join(' / '))) : <p className="p-3 text-[13px] text-muted">没有匹配的文件夹</p>)
          : render(tree, 0)}
      </div>
    </Modal>
  );
};

export default FolderPicker;
