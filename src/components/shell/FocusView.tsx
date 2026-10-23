import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ExternalLink, Bookmark, Pin, Trash2, X, Plus, LayoutGrid, List, Grid3x3, FolderInput, SearchX } from 'lucide-react';
import type { Category, SortMode } from '../../core/nav';
import type { LibraryItem } from '../../core/types';
import type { RelatedTag } from '../../core/tagGraph';
import ItemCard, { type CardVariant } from '../smart/ItemCard';
import { tagChipStyle } from '../smart/tagColor';
import Segmented from '../../ui/Segmented';
import Select from '../../ui/Select';
import Button from '../../ui/Button';
import { cardPresence, spring } from '../../ui/motion';

export interface CardHandlers {
  selected: Set<string>;
  onOpen: (item: LibraryItem, e: React.MouseEvent) => void;
  onToggleSelect: (item: LibraryItem) => void;
  onMenu: (item: LibraryItem, x: number, y: number) => void;
}

interface Props {
  cat: Category;
  items: LibraryItem[];
  related: RelatedTag[];
  selectedTags: string[];
  tagMode: 'and' | 'or';
  onToggleTag: (t: string) => void;
  onTagMode: (m: 'and' | 'or') => void;
  onClearTags: () => void;
  variant: CardVariant;
  onVariant: (v: CardVariant) => void;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  cards: CardHandlers;
  limit: number;
  onMore: () => void;
  onBack: () => void;
  onOpenAll: () => void;
  onSaveAsCollection?: () => void;
  onTogglePin?: () => void;
  onDeleteCollection?: () => void;
  onOrganize?: () => void;
  /** 搜索时的"意思相近"结果 */
  semantic?: { label: string; items: LibraryItem[] };
  emptyHint: React.ReactNode;
}

const RELATED_PREVIEW = 10;

const Grid: React.FC<{ items: LibraryItem[]; variant: CardVariant; activeTags: string[]; cards: CardHandlers; onTagClick: (t: string) => void; animate: boolean }> = ({ items, variant, activeTags, cards, onTagClick, animate }) => (
  <motion.div
    layout={animate}
    className={variant === 'list' ? 'flex flex-col gap-1.5' : `grid gap-3 ${variant === 'icon' ? 'tt-grid-icons' : 'tt-grid'}`}
  >
    <AnimatePresence mode="popLayout" initial={false}>
      {items.map(it => (
        <motion.div key={`${it.id}`} layout={animate ? 'position' : false} variants={cardPresence} initial="hidden" animate="show" exit="exit" transition={spring.smooth}>
          <ItemCard
            item={it}
            variant={variant}
            selected={cards.selected.has(it.key)}
            selecting={cards.selected.size > 0}
            activeTags={activeTags}
            onOpen={cards.onOpen}
            onToggleSelect={cards.onToggleSelect}
            onMenu={cards.onMenu}
            onTagClick={onTagClick}
          />
        </motion.div>
      ))}
    </AnimatePresence>
  </motion.div>
);

/** 聚焦视图：一个分类 / 标签 / 搜索的全部网页 */
const FocusView: React.FC<Props> = p => {
  const [showAllTags, setShowAllTags] = useState(false);
  const { cat, items } = p;
  const relatedShown = showAllTags ? p.related : p.related.slice(0, RELATED_PREVIEW);
  const max = p.related[0]?.score || 1;
  // 网页很多时关闭布局动画，避免卡顿
  const animate = items.length <= 120;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <button onClick={p.onBack} className="mb-1.5 -ml-1 inline-flex items-center gap-0.5 text-[12.5px] text-muted hover:text-fg">
            <ChevronLeft size={15} /> 分类总览
          </button>
          <h1 className="tt-display flex items-center gap-2.5 text-[30px] leading-tight text-fg">
            {cat.emoji && <span className="text-[26px]">{cat.emoji}</span>}
            <span className="truncate">{cat.title}</span>
            <span className="text-[15px] font-normal text-faint tabular-nums" style={{ fontFamily: 'var(--font-ui)' }}>{items.length}</span>
          </h1>
          {cat.subtitle && <p className="mt-1 text-[13px] text-muted truncate">{cat.subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.onOrganize && <Button variant="warn" size="sm" icon={<FolderInput size={14} />} onClick={p.onOrganize}>整理这些书签</Button>}
          {items.length > 0 && <Button size="sm" icon={<ExternalLink size={14} />} onClick={p.onOpenAll}>全部打开</Button>}
          {p.onSaveAsCollection && <Button size="sm" icon={<Bookmark size={14} />} onClick={p.onSaveAsCollection}>保存为组合</Button>}
          {p.onTogglePin && <Button size="sm" variant="ghost" icon={<Pin size={14} />} onClick={p.onTogglePin}>{cat.pinned ? '取消置顶' : '置顶'}</Button>}
          {p.onDeleteCollection && <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={p.onDeleteCollection}>删除组合</Button>}
        </div>
      </header>

      {(p.selectedTags.length > 0 || p.related.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {p.selectedTags.map((t, i) => (
            <React.Fragment key={t}>
              {i > 0 && (
                <button onClick={() => p.onTagMode(p.tagMode === 'and' ? 'or' : 'and')} title="切换：同时包含 / 包含任一" className="px-1 text-[12px] text-muted hover:text-fg">
                  {p.tagMode === 'and' ? '且' : '或'}
                </button>
              )}
              <motion.button layout="position" transition={spring.snappy} onClick={() => p.onToggleTag(t)} style={tagChipStyle(t, 'solid')} className="group flex items-center gap-1 pl-2.5 pr-1.5 h-7 rounded-full border text-[13px]">
                {t}<X size={13} className="opacity-60 group-hover:opacity-100" />
              </motion.button>
            </React.Fragment>
          ))}
          {p.selectedTags.length > 0 && p.related.length > 0 && <span className="mx-1 h-4 w-px bg-line" aria-hidden />}
          {relatedShown.map(r => (
            <motion.button
              layout="position" transition={spring.snappy}
              key={r.tag}
              onClick={() => p.onToggleTag(r.tag)}
              style={tagChipStyle(r.tag, 'ghost', r.score / max)}
              className="flex items-center gap-1 px-2.5 h-7 rounded-full border text-[13px] hover:bg-fill-1"
              title={`${r.count} 个网页${p.selectedTags.length && !r.narrows ? '（当前结果全都有）' : ''}`}
            >
              {p.selectedTags.length > 0 && <Plus size={11} className="opacity-60" />}{r.tag}<span className="text-[10.5px] opacity-55 tabular-nums">{r.count}</span>
            </motion.button>
          ))}
          {p.related.length > RELATED_PREVIEW && (
            <button onClick={() => setShowAllTags(s => !s)} className="h-7 px-2.5 rounded-full text-[12.5px] text-muted hover:text-fg hover:bg-fill-2">
              {showAllTags ? '收起' : `还有 ${p.related.length - RELATED_PREVIEW} 个标签`}
            </button>
          )}
          {p.selectedTags.length > 0 && <button onClick={p.onClearTags} className="ml-1 text-[12.5px] text-muted hover:text-fg">清除筛选</button>}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 -mb-1">
        <Select<SortMode>
          size="sm" ariaLabel="排序" value={p.sort} onChange={p.onSort} minWidth={170}
          options={[
            { value: 'smart', label: '智能排序', hint: '此刻常用优先' },
            { value: 'visits', label: '访问最多' },
            { value: 'recent', label: '最近收藏' },
            { value: 'name', label: '按名称' },
          ]}
        />
        <Segmented<CardVariant>
          size="sm" ariaLabel="显示方式" value={p.variant} onChange={p.onVariant}
          options={[
            { value: 'card', label: '', icon: <LayoutGrid size={14} />, title: '卡片' },
            { value: 'list', label: '', icon: <List size={14} />, title: '列表' },
            { value: 'icon', label: '', icon: <Grid3x3 size={14} />, title: '图标' },
          ]}
        />
      </div>

      {items.length > 0 ? (
        <>
          <Grid items={items.slice(0, p.limit)} variant={p.variant} activeTags={p.selectedTags} cards={p.cards} onTagClick={p.onToggleTag} animate={animate} />
          {items.length > p.limit && (
            <Button variant="ghost" className="self-center" onClick={p.onMore}>再显示 {Math.min(120, items.length - p.limit)} 个（共 {items.length} 个）</Button>
          )}
        </>
      ) : !p.semantic?.items.length && (
        <div className="tt-glass rounded-2xl py-14 px-6 flex flex-col items-center gap-3 text-center">
          <SearchX size={28} className="text-faint" />
          <p className="text-[14px] text-muted leading-relaxed max-w-md">{p.emptyHint}</p>
        </div>
      )}

      {p.semantic && p.semantic.items.length > 0 && (
        <section className="flex flex-col gap-3 mt-2">
          <h3 className="flex items-baseline gap-2 text-[13px] text-muted">意思相近的网页<span className="text-[12px] text-faint">{p.semantic.label}</span></h3>
          <Grid items={p.semantic.items} variant={p.variant} activeTags={p.selectedTags} cards={p.cards} onTagClick={p.onToggleTag} animate={animate} />
        </section>
      )}
    </div>
  );
};

export default FocusView;
