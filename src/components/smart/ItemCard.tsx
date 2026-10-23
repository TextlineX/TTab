import React, { useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import type { LibraryItem } from '../../core/types';
import { faviconUrl, tagChipStyle, tagHue } from './tagColor';

export type CardVariant = 'card' | 'list' | 'icon';

interface Props {
  item: LibraryItem;
  variant?: CardVariant;
  selected: boolean;
  selecting: boolean;
  activeTags: string[];
  onOpen: (item: LibraryItem, e: React.MouseEvent) => void;
  onToggleSelect: (item: LibraryItem) => void;
  onMenu: (item: LibraryItem, x: number, y: number) => void;
  onTagClick: (tag: string) => void;
}

/** 网站图标：加载失败时显示首字母色块 */
export const Favicon: React.FC<{ url: string; title: string; domain: string; size?: number; radius?: number }> = ({ url, title, domain, size = 40, radius = 11 }) => {
  const [ok, setOk] = useState(true);
  const icon = faviconUrl(url, 64);
  const hue = tagHue(domain || title);
  return (
    <span
      className="shrink-0 flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: radius, background: `hsl(${hue} 45% 50% / 0.16)`, boxShadow: `inset 0 0 0 1px hsl(${hue} 45% 55% / 0.18)` }}
    >
      {icon && ok
        ? <img src={icon} alt="" style={{ width: size * 0.56, height: size * 0.56 }} className="object-contain" onError={() => setOk(false)} />
        : <span className="font-semibold" style={{ fontSize: size * 0.42, color: `hsl(${hue} 55% 55%)` }}>{(title.trim()[0] || domain[0] || '?').toUpperCase()}</span>}
    </span>
  );
};

const ItemCard: React.FC<Props> = ({ item, variant = 'card', selected, selecting, activeTags, onOpen, onToggleSelect, onMenu, onTagClick }) => {
  const usage = item.visits || item.opens;

  const handleClick = (e: React.MouseEvent) => {
    if (selecting || e.shiftKey) { e.preventDefault(); onToggleSelect(item); } else onOpen(item, e);
  };
  const common = {
    role: 'link' as const,
    tabIndex: 0,
    title: item.summary ? `${item.title}\n${item.summary}` : item.url,
    onClick: handleClick,
    onAuxClick: (e: React.MouseEvent) => { if (e.button === 1) onOpen(item, e); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') onOpen(item, e as unknown as React.MouseEvent);
      if (e.key === ' ') { e.preventDefault(); onToggleSelect(item); }
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = (e.target as HTMLElement).getBoundingClientRect(); onMenu(item, r.left + 20, r.top + 20); }
    },
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); onMenu(item, e.clientX, e.clientY); },
  };

  const selectBox = (
    <button
      aria-label={selected ? '取消选择' : '选择'}
      onClick={e => { e.stopPropagation(); onToggleSelect(item); }}
      className={`absolute z-10 w-[22px] h-[22px] rounded-full border flex items-center justify-center transition-all duration-150 ${variant === 'icon' ? 'right-1.5 top-1.5' : '-left-2 -top-2'} ${selected ? 'opacity-100 bg-accent border-accent text-on-accent scale-100' : `bg-raised border-line-strong text-transparent ${selecting ? 'opacity-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 focus-visible:opacity-100'}`}`}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );

  const moreBtn = (
    <button
      aria-label="更多操作"
      onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onMenu(item, r.left, r.bottom + 4); }}
      className="shrink-0 p-1.5 rounded-lg text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg hover:bg-fill-2 transition-opacity"
    >
      <MoreHorizontal size={16} />
    </button>
  );

  const tags = (max: number) => item.tags.length > 0 && (
    <div className="flex flex-wrap gap-1 max-h-[22px] overflow-hidden">
      {item.tags.slice(0, max).map(t => (
        <button
          key={t}
          onClick={e => { e.stopPropagation(); onTagClick(t); }}
          style={tagChipStyle(t, activeTags.includes(t) ? 'solid' : 'soft')}
          className="px-1.5 rounded-md border text-[11px] leading-[18px] hover:brightness-110 transition-[filter]"
        >{t}</button>
      ))}
    </div>
  );

  if (variant === 'icon') {
    return (
      <div {...common} className={`tt-card group relative flex flex-col items-center gap-2 px-2 pt-4 pb-3 rounded-2xl cursor-pointer select-none ${selected ? 'tt-card-selected' : ''}`}>
        {selectBox}
        <Favicon url={item.url} title={item.title} domain={item.domain} size={44} radius={13} />
        <span className="w-full text-center truncate text-[12.5px] text-fg">{item.title}</span>
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div {...common} className={`tt-card group relative flex items-center gap-3 pl-3 pr-2 h-14 rounded-xl cursor-pointer select-none ${selected ? 'tt-card-selected' : ''}`}>
        {selectBox}
        <Favicon url={item.url} title={item.title} domain={item.domain} size={30} radius={8} />
        <div className="min-w-0 flex-[2] flex flex-col">
          <span className="truncate text-[14px] text-fg">{item.title}</span>
          <span className="truncate text-[12px] text-faint">{item.summary || item.domain}</span>
        </div>
        <div className="hidden md:block min-w-0 flex-[2]">{tags(4)}</div>
        <span className="hidden lg:block w-[22%] truncate text-[12px] text-faint">{item.folderPath.join(' / ')}</span>
        <span className="w-14 text-right text-[12px] text-faint tabular-nums">{usage > 0 ? `${usage} 次` : ''}</span>
        {moreBtn}
      </div>
    );
  }

  return (
    <div {...common} className={`tt-card group relative flex gap-3 p-3 pr-2 rounded-2xl cursor-pointer select-none ${selected ? 'tt-card-selected' : ''}`}>
      {selectBox}
      <Favicon url={item.url} title={item.title} domain={item.domain} />
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="truncate text-[14px] font-medium leading-tight text-fg">{item.title}</span>
          {usage > 2 && <span className="shrink-0 text-[11px] text-faint tabular-nums" title={item.visits ? '最近 90 天的访问次数' : '通过 TTab 打开的次数'}>{usage} 次</span>}
        </div>
        <span className="truncate text-[12px] text-muted">{item.summary || item.domain}</span>
        {tags(5)}
      </div>
      {moreBtn}
    </div>
  );
};

export default React.memo(ItemCard);
