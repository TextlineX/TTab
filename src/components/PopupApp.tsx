import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, ChevronRight } from 'lucide-react';
import Select from '../ui/Select';
import { fade, pop, spring } from '../ui/motion';
import { useSettings } from '../state/useSettings';
import { useTheme } from '../theme/useTheme';
import { storage } from '../utils/storage';
import { loadMeta, saveMeta } from '../core/metaStore';
import { addTags, markTagged } from '../core/library';
import { getDomain, normalizeTag, normalizeUrl } from '../core/normalize';
import { inferRuleTags, suggestFromVocabulary } from '../core/ruleTagger';
import { tagChipStyle } from './smart/tagColor';

const PopupApp: React.FC = () => {
  const { settings } = useSettings();
  useTheme(settings?.appearance, settings?.wallpaper);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [folders, setFolders] = useState<{ id: string; title: string; path: string[] }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState({ id: '1', title: '收藏夹栏' });
  const [isSaved, setIsSaved] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [folderPath, setFolderPath] = useState<string[]>([]);

  // 根据网址、标题和已有标签词表推荐标签
  useEffect(() => {
    if (!url) return;
    loadMeta().then(meta => {
      const counts = new Map<string, number>();
      Object.values(meta.pages).forEach(p => p.tags.forEach(t => counts.set(t.name, (counts.get(t.name) || 0) + 1)));
      const vocab = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
      const existing = meta.pages[normalizeUrl(url)]?.tags.map(t => t.name) || [];
      const rule = inferRuleTags({ title, url, domain: getDomain(url), folderPath });
      const sug = [...new Set([...existing, ...rule, ...suggestFromVocabulary(title, vocab)])];
      setSuggested(sug.slice(0, 8));
      setTags(prev => (prev.length ? prev : sug.slice(0, 3)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, folderPath]);

  const toggleTag = (t: string) => setTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
  const addDraft = () => {
    const t = normalizeTag(tagDraft);
    if (t) { setTags(prev => (prev.includes(t) ? prev : [...prev, t])); setSuggested(prev => (prev.includes(t) ? prev : [...prev, t])); }
    setTagDraft('');
  };

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          setTitle(tabs[0].title || '');
          setUrl(tabs[0].url || '');
        }
      });

      chrome.bookmarks.getTree((nodes) => {
        const all: { id: string; title: string; path: string[] }[] = [];
        const walk = (list: chrome.bookmarks.BookmarkTreeNode[], path: string[]) => {
          list.forEach(n => {
            if (!n.url) {
              const p = [...path, n.title || '文件夹'];
              all.push({ id: n.id, title: n.title || '文件夹', path: p });
              if (n.children) walk(n.children, p);
            }
          });
        };
        if (nodes && nodes[0]) walk(nodes[0].children || [], []);
        setFolders(all.filter(f => f.id !== '0'));
      });
    }

    storage.getSettings().then(s => {
      // '0' 是书签树根节点，不能直接放书签
      if (s.defaultFolderId && s.defaultFolderId !== '0') {
        setSelectedFolder(prev => ({ ...prev, id: s.defaultFolderId }));
      }
    });
  }, []);

  const handleSave = () => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.create({
        parentId: selectedFolder.id,
        title: title,
        url: url
      }, async () => {
        if (tags.length) {
          const key = normalizeUrl(url);
          const meta = await loadMeta();
          await saveMeta(markTagged(addTags(meta, [key], tags, 'manual'), [key], 'rule'));
        }
        setIsSaved(true);
        setTimeout(() => window.close(), 1200);
      });
    }
  };

  const inputCls = 'w-full h-10 px-3 rounded-xl bg-fill-1 border border-line focus:border-[color:var(--accent-line)] outline-none text-[13.5px] text-fg placeholder:text-faint transition-colors';

  return (
    <div style={{ width: 360, minHeight: 480 }} className="relative overflow-hidden bg-[color:var(--bg)] text-fg flex flex-col">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 w-64 h-64 rounded-full blur-3xl opacity-60" style={{ background: 'var(--accent-soft)' }} />
      <AnimatePresence mode="wait" initial={false}>
        {isSaved ? (
          <motion.div key="ok" variants={pop} initial="hidden" animate="show" exit="exit" className="flex-1 flex flex-col items-center justify-center gap-4 py-24">
            <span className="w-16 h-16 rounded-full bg-accent text-on-accent flex items-center justify-center">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <motion.path d="M5 12.5 10 17 19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1 }} />
              </svg>
            </span>
            <p className="text-[15px] text-fg">已收藏{tags.length ? `，带 ${tags.length} 个标签` : ''}</p>
          </motion.div>
        ) : (
          <motion.div key="form" variants={fade} initial="hidden" animate="show" exit="exit" className="relative flex-1 flex flex-col gap-5 p-5">
            <header className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-accent-soft text-accent-text flex items-center justify-center"><Bookmark size={18} /></span>
              <div className="min-w-0">
                <h1 className="text-[16px] font-semibold text-fg tt-display">收藏到 TTab</h1>
                <p className="text-[12px] text-muted truncate max-w-[260px]">{url ? getDomain(url) : '…'}</p>
              </div>
            </header>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-muted">名称</span>
              <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-muted">放到文件夹</span>
              <Select
                ariaLabel="放到文件夹"
                className="w-full"
                value={selectedFolder.id}
                searchAt={6}
                onChange={id => { const f = folders.find(x => x.id === id); if (f) { setSelectedFolder({ id: f.id, title: f.title }); setFolderPath(f.path); } }}
                options={folders.map(f => ({ value: f.id, label: f.title, hint: f.path.length > 1 ? f.path.slice(0, -1).join(' / ') : undefined }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] text-muted">标签 <span className="text-faint">· 点击选择或取消</span></span>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map(t => (
                  <motion.button
                    key={t} layout transition={spring.snappy}
                    onClick={() => toggleTag(t)}
                    aria-pressed={tags.includes(t)}
                    style={tagChipStyle(t, tags.includes(t) ? 'solid' : 'ghost')}
                    className="px-2.5 h-7 rounded-full border text-[12.5px]"
                  >{tags.includes(t) ? '✓ ' : ''}{t}</motion.button>
                ))}
                <input
                  value={tagDraft}
                  onChange={e => setTagDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }}
                  onBlur={addDraft}
                  placeholder="+ 新标签"
                  className="w-24 h-7 px-2.5 rounded-full bg-fill-1 border border-dashed border-line-strong focus:border-[color:var(--accent-line)] text-[12.5px] text-fg outline-none placeholder:text-faint"
                />
              </div>
            </div>

            <button onClick={handleSave} className="mt-auto h-11 rounded-xl bg-accent text-on-accent text-[14px] font-medium flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition">
              收藏 <ChevronRight size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PopupApp;
