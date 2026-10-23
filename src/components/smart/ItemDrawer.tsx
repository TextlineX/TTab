import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, Loader2, ExternalLink, Trash2, FolderOpen, Check } from 'lucide-react';
import type { LibraryItem, MetaState, TagSource } from '../../core/types';
import { topTags } from '../../core/tagGraph';
import { blendRelated } from '../../core/vectors/related';
import type { VectorIndex } from '../../core/vectors/semantic';
import { addTags, setManualTags, setSummary, markTagged } from '../../core/library';
import { normalizeTag } from '../../core/normalize';
import { aiTagBatch, buildTagContext } from '../../core/ai/tasks';
import { isAIReady, type AIConfig } from '../../core/ai/client';
import { faviconUrl, tagChipStyle } from './tagColor';

interface Props {
  item: LibraryItem;
  items: LibraryItem[];
  meta: MetaState;
  index: VectorIndex | null;
  ai: AIConfig | undefined;
  onClose: () => void;
  update: (fn: (s: MetaState) => MetaState, label?: string) => void;
  onOpen: (item: LibraryItem) => void;
  onShowItem: (item: LibraryItem) => void;
  onRenameBookmark: (item: LibraryItem, title: string) => void;
  onDeleteBookmark: (item: LibraryItem) => void;
}

const SOURCE_LABEL: Record<TagSource, string> = { manual: '手动', ai: 'AI', rule: '自动' };

const ItemDrawer: React.FC<Props> = ({ item, items, meta, index, ai, onClose, update, onOpen, onShowItem, onRenameBookmark, onDeleteBookmark }) => {
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState(item.title);
  const [summary, setSummaryDraft] = useState(item.summary || '');
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [error, setError] = useState('');

  const vocab = useMemo(() => topTags(items, 300), [items]);
  const related = useMemo(() => blendRelated(item, items, index, 8), [item, items, index]);
  const completions = useMemo(() => {
    const q = normalizeTag(draft).toLowerCase();
    if (!q) return [];
    return vocab.filter(v => v.tag.toLowerCase().includes(q) && !item.tags.includes(v.tag)).slice(0, 6);
  }, [draft, vocab, item.tags]);

  const addTag = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t) return;
    update(s => addTags(s, [item.key], [t], 'manual'), `添加标签 #${t}`);
    setDraft('');
    setSuggested(sug => sug.filter(x => x !== t));
  };
  const removeTag = (t: string) => update(s => setManualTags(s, item.key, item.tags.filter(x => x !== t)), `移除标签 #${t}`);

  const suggest = async () => {
    if (!isAIReady(ai)) { setError('先在设置里配置 AI'); return; }
    setSuggesting(true); setError('');
    try {
      const res = await aiTagBatch(ai, [item], items, undefined, await buildTagContext([item], meta));
      const r = res[0];
      if (!r) { setError('AI 没有给出建议'); return; }
      setSuggested(r.tags.filter(t => !item.tags.includes(t)));
      if (r.summary && !summary) setSummaryDraft(r.summary);
      update(s => markTagged(s, [item.key], 'ai'), 'AI 建议');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  };

  const icon = faviconUrl(item.url, 64);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40" />
      <motion.aside
        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="tt-drawer relative w-full max-w-[420px] h-full flex flex-col"
        aria-label="网页详情"
      >
        <header className="flex items-start gap-3 p-5 pb-4">
          <div className="w-11 h-11 rounded-[12px] bg-white/8 flex items-center justify-center shrink-0">
            {icon ? <img src={icon} alt="" className="w-6 h-6" /> : <span className="text-lg">{item.title[0]}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== item.title && onRenameBookmark(item, title.trim())}
              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-full bg-transparent text-[17px] text-[color:var(--text)] outline-none border-b border-transparent focus:border-white/20"
              aria-label="书签标题"
            />
            <a href={item.url} target="_blank" rel="noreferrer" className="block truncate text-[12px] text-[color:var(--muted)] hover:text-[color:var(--text)]">{item.url}</a>
          </div>
          <button onClick={onClose} aria-label="关闭" className="p-1.5 rounded-lg hover:bg-white/10 text-[color:var(--muted)]"><X size={18} /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-6">
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] text-[color:var(--muted)]">标签</h3>
              <button onClick={suggest} disabled={suggesting} className="flex items-center gap-1.5 text-[12px] text-[color:var(--ai)] hover:brightness-125 disabled:opacity-60">
                {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} AI 建议
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.tagEntries.map(t => (
                <span key={t.name} style={tagChipStyle(t.name, 'soft')} className="group flex items-center gap-1 pl-2 pr-1 h-7 rounded-full border text-[13px]" title={`来源：${SOURCE_LABEL[t.source]}`}>
                  {t.source === 'ai' && <Sparkles size={10} className="opacity-60" />}
                  {t.name}
                  <button onClick={() => removeTag(t.name)} aria-label={`移除 ${t.name}`} className="p-0.5 rounded-full opacity-50 hover:opacity-100 hover:bg-white/10"><X size={12} /></button>
                </span>
              ))}
              {!item.tagEntries.length && <span className="text-[12px] text-[color:var(--muted)]">还没有标签</span>}
            </div>
            {suggested.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-[12px] bg-[color:var(--ai)]/8 border border-[color:var(--ai)]/20">
                <span className="text-[12px] text-[color:var(--ai)] mr-1">建议</span>
                {suggested.map(t => (
                  <button key={t} onClick={() => addTag(t)} style={tagChipStyle(t, 'ghost')} className="h-7 px-2.5 rounded-full border text-[13px] hover:!bg-white/5">+ {t}</button>
                ))}
                <button
                  onClick={() => { update(s => addTags(s, [item.key], suggested, 'ai'), 'AI 建议标签'); setSuggested([]); }}
                  className="ml-auto flex items-center gap-1 text-[12px] text-[color:var(--ai)]"
                ><Check size={13} /> 全部采用</button>
              </div>
            )}
            <div className="relative">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ',' || e.key === '，') && draft.trim()) { e.preventDefault(); addTag(draft); }
                  if (e.key === 'Tab' && completions[0]) { e.preventDefault(); addTag(completions[0].tag); }
                  if (e.key === 'Backspace' && !draft && item.tags.length) removeTag(item.tags[item.tags.length - 1]);
                }}
                placeholder="输入标签，回车添加，Tab 补全"
                className="w-full h-9 px-3 rounded-[10px] bg-white/5 border border-white/10 focus:border-white/25 outline-none text-[13px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
              />
              {completions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {completions.map(c => (
                    <button key={c.tag} onClick={() => addTag(c.tag)} style={tagChipStyle(c.tag, 'ghost')} className="h-6 px-2 rounded-full border text-[12px]">{c.tag} <span className="opacity-50">{c.count}</span></button>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="text-[12px] text-[color:var(--warn)]">{error}</p>}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] text-[color:var(--muted)]">一句话简介</h3>
            <textarea
              value={summary}
              onChange={e => setSummaryDraft(e.target.value)}
              onBlur={() => summary !== (item.summary || '') && update(s => setSummary(s, item.key, summary), '修改简介')}
              rows={2}
              placeholder="写给以后的自己：这个网页用来做什么"
              className="w-full px-3 py-2 rounded-[10px] bg-white/5 border border-white/10 focus:border-white/25 outline-none text-[13px] text-[color:var(--text)] placeholder:text-[color:var(--muted)] resize-none"
            />
          </section>

          {related.length > 0 && (
            <section className="flex flex-col gap-1">
              <h3 className="text-[13px] text-[color:var(--muted)] mb-1">相关网页</h3>
              {related.map(r => (
                <button key={r.item.key} onClick={() => onShowItem(r.item)} className="flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-[10px] hover:bg-white/6 text-left">
                  {faviconUrl(r.item.url, 32)
                    ? <img src={faviconUrl(r.item.url, 32)} alt="" className="w-4 h-4 shrink-0" />
                    : <span className="w-4 h-4 shrink-0 rounded bg-white/10 text-[9px] leading-4 text-center text-[color:var(--muted)]">{r.item.title[0]}</span>}
                  <span className="truncate text-[13px] text-[color:var(--text)] flex-1">{r.item.title}</span>
                  <span className="shrink-0 text-[11px] text-[color:var(--muted)]">{r.shared.slice(0, 2).join('、') || (r.sim ? '内容相近' : r.item.domain)}</span>
                </button>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-1 text-[12px] text-[color:var(--muted)]">
            {item.folderPath.length > 0 && <span className="flex items-center gap-1.5"><FolderOpen size={13} /> {item.folderPath.join(' / ')}</span>}
            {item.dateAdded && <span>收藏于 {new Date(item.dateAdded).toLocaleDateString()}</span>}
            {item.opens > 0 && <span>通过 TTab 打开过 {item.opens} 次</span>}
          </section>
        </div>

        <footer className="flex items-center gap-2 p-4 border-t border-white/8">
          <button onClick={() => onOpen(item)} className="flex-1 h-10 rounded-[12px] bg-[color:var(--text)] text-[#15171c] text-[14px] flex items-center justify-center gap-2"><ExternalLink size={15} /> 打开</button>
          <button
            onClick={() => { if (confirm(`从浏览器书签中删除「${item.title}」？`)) onDeleteBookmark(item); }}
            className="h-10 px-3 rounded-[12px] text-[color:var(--muted)] hover:text-red-300 hover:bg-red-500/10 flex items-center gap-1.5 text-[13px]"
          ><Trash2 size={15} /> 删除书签</button>
        </footer>
      </motion.aside>
    </div>
  );
};

export default ItemDrawer;
