import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Folder, Layers, Sparkles, ChevronRight, Inbox } from 'lucide-react';
import type { Category } from '../../core/nav';
import type { LibraryItem } from '../../core/types';
import { Favicon } from '../smart/ItemCard';
import { rise, spring, stagger } from '../../ui/motion';

interface Props {
  picks: { title: string; items: LibraryItem[] };
  categories: Category[];
  loose: LibraryItem[];
  widgets: React.ReactNode;
  onOpenItem: (item: LibraryItem, e?: React.MouseEvent) => void;
  onMenu: (item: LibraryItem, x: number, y: number) => void;
  onOpenCategory: (key: string) => void;
  onOpenAll: (items: LibraryItem[], title: string) => void;
  onOrganize: () => void;
}

const KIND: Record<string, { label: string; icon: React.ReactNode }> = {
  collection: { label: '我的组合', icon: <Layers size={15} /> },
  group: { label: '自动分组', icon: <Layers size={15} /> },
  folder: { label: '文件夹', icon: <Folder size={15} /> },
  combo: { label: '推荐组合', icon: <Sparkles size={14} /> },
};

const PANEL_ROWS = 8;

/** 一个分类面板：标题 + 成员列表（最多 8 个，其余进入分类查看） */
const CategoryPanel: React.FC<{ cat: Category } & Pick<Props, 'onOpenItem' | 'onMenu' | 'onOpenCategory' | 'onOpenAll'>> = ({ cat, onOpenItem, onMenu, onOpenCategory, onOpenAll }) => {
  const kind = KIND[cat.kind] || KIND.folder;
  const shown = cat.items.slice(0, PANEL_ROWS);
  const more = cat.items.length - shown.length;
  return (
    <motion.section variants={rise} className="tt-glass group/panel rounded-[20px] p-2 pb-2.5">
      <header className="flex items-center gap-2 px-2.5 pt-1.5 pb-2">
        <span className="shrink-0 text-muted">{cat.emoji ? <span className="text-[16px] leading-none">{cat.emoji}</span> : kind.icon}</span>
        <button onClick={() => onOpenCategory(cat.key)} className="min-w-0 flex-1 text-left">
          <h3 className="truncate text-[15px] font-semibold text-fg hover:text-accent-text transition-colors">{cat.title}</h3>
          <p className="truncate text-[11.5px] text-faint">{kind.label}{cat.subtitle && cat.kind !== 'combo' && cat.kind !== 'group' ? `，${cat.subtitle}` : ''}，{cat.items.length} 个</p>
        </button>
        <button
          onClick={() => onOpenAll(cat.items, cat.title)}
          title="全部打开（放进同一个标签组）"
          aria-label={`全部打开${cat.title}`}
          className="shrink-0 p-1.5 rounded-lg text-faint opacity-0 group-hover/panel:opacity-100 focus-visible:opacity-100 hover:text-fg hover:bg-fill-2 transition-opacity"
        ><ExternalLink size={15} /></button>
      </header>
      <ul className="flex flex-col">
        {shown.map(it => (
          <li key={it.id}>
            <a
              href={it.url}
              onClick={e => { if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); onOpenItem(it, e); } }}
              onContextMenu={e => { e.preventDefault(); onMenu(it, e.clientX, e.clientY); }}
              title={it.summary || it.url}
              className="flex items-center gap-2.5 h-9 px-2.5 rounded-xl hover:bg-fill-2 transition-colors"
            >
              <Favicon url={it.url} title={it.title} domain={it.domain} size={20} radius={6} />
              <span className="flex-1 min-w-0 truncate text-[13.5px] text-fg">{it.title}</span>
              <span className="shrink-0 max-w-[40%] truncate text-[11.5px] text-faint">{it.domain}</span>
            </a>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button onClick={() => onOpenCategory(cat.key)} className="mt-1 w-full flex items-center justify-center gap-1 h-8 rounded-xl text-[12.5px] text-muted hover:text-fg hover:bg-fill-2 transition-colors">
          查看全部 {cat.items.length} 个 <ChevronRight size={13} />
        </button>
      )}
    </motion.section>
  );
};

/** 分类总览：此刻推荐 → 小组件 → 所有分类（瀑布流） */
const Overview: React.FC<Props> = ({ picks, categories, loose, widgets, onOpenItem, onMenu, onOpenCategory, onOpenAll, onOrganize }) => {
  // 只有第一次打开时做一次依次出现的动画，之后切换回来不再重复
  const first = useRef(true);
  const initial = first.current ? 'hidden' : false;
  first.current = false;

  // 推荐只显示整行：宽屏一行，窄屏两行，不出现半行
  const pickRef = useRef<HTMLUListElement>(null);
  const [pickCols, setPickCols] = useState(8);
  useEffect(() => {
    const el = pickRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setPickCols(Math.max(1, Math.floor((el.clientWidth + 10) / (118 + 10))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [picks.items.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-8">
      {picks.items.length > 0 && (
        <section aria-label={picks.title}>
          <h2 className="mb-3 text-[13px] text-muted">{picks.title}</h2>
          <motion.ul variants={stagger(0.03)} initial={initial} animate="show" ref={pickRef} className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
            {picks.items.slice(0, pickCols * (pickCols < 4 ? 2 : 1)).map(it => (
              <motion.li key={it.key} variants={rise}>
                <a
                  href={it.url}
                  onClick={e => { if (e.button === 0 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); onOpenItem(it, e); } }}
                  onContextMenu={e => { e.preventDefault(); onMenu(it, e.clientX, e.clientY); }}
                  title={it.title}
                  className="tt-card flex flex-col items-center gap-2 px-2 pt-4 pb-3 rounded-2xl"
                >
                  <Favicon url={it.url} title={it.title} domain={it.domain} size={42} radius={12} />
                  <span className="w-full text-center truncate text-[12.5px] text-fg">{it.title}</span>
                </a>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      )}

      {widgets}

      {loose.length >= 3 && (
        <motion.button
          whileHover={{ y: -1 }} transition={spring.snappy}
          onClick={onOrganize}
          className="tt-glass flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
        >
          <Inbox size={18} className="shrink-0 text-warn" />
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] text-fg">有 {loose.length} 个书签还散落在根目录</span>
            <span className="block text-[12px] text-muted">自动整理会把它们放进合适的文件夹，执行前可以逐个确认，也能撤销</span>
          </span>
          <span className="shrink-0 h-8 px-3 rounded-xl bg-warn text-on-warn text-[12.5px] font-medium flex items-center">整理</span>
        </motion.button>
      )}

      <section aria-label="分类">
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[13px] text-muted">分类</h2>
          <span className="text-[12px] text-faint">{categories.length} 个</span>
        </div>
        {categories.length ? (
          <motion.div variants={stagger(0.04, 0.05)} initial={initial} animate="show" className="tt-masonry">
            {categories.map(c => <CategoryPanel key={c.key} cat={c} onOpenItem={onOpenItem} onMenu={onMenu} onOpenCategory={onOpenCategory} onOpenAll={onOpenAll} />)}
          </motion.div>
        ) : (
          <p className="tt-glass rounded-2xl p-6 text-[13.5px] text-muted leading-relaxed">
            还没有分类。给书签打上标签、建几个组合，或者用"整理书签"把散落的书签放进文件夹，这里就会按分类展示。
          </p>
        )}
      </section>
    </div>
  );
};

export default Overview;
