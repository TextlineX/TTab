import React, { useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import type { LibraryItem } from '../../core/types';
import { faviconUrl, tagChipStyle, tagHue } from './tagColor';

interface Props {
  item: LibraryItem;
  selected: boolean;
  selecting: boolean;
  activeTags: string[];
  onOpen: (item: LibraryItem, e: React.MouseEvent) => void;
  onToggleSelect: (item: LibraryItem) => void;
  onEdit: (item: LibraryItem) => void;
  onTagClick: (tag: string) => void;
}

const ItemCard: React.FC<Props> = ({ item, selected, selecting, activeTags, onOpen, onToggleSelect, onEdit, onTagClick }) => {
  const [iconOk, setIconOk] = useState(true);
  const icon = faviconUrl(item.url, 64);
  const initial = (item.title.trim()[0] || item.domain[0] || '?').toUpperCase();
  const hue = tagHue(item.domain || item.title);

  const handleClick = (e: React.MouseEvent) => {
    if (selecting || e.shiftKey) {
      e.preventDefault();
      onToggleSelect(item);
    } else {
      onOpen(item, e);
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onAuxClick={e => { if (e.button === 1) onOpen(item, e); }}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(item, e as unknown as React.MouseEvent); if (e.key === ' ') { e.preventDefault(); onToggleSelect(item); } }}
      onContextMenu={e => { e.preventDefault(); onEdit(item); }}
      className={`tt-card group relative flex gap-3 p-3 pr-2 rounded-[14px] cursor-pointer select-none transition-colors ${selected ? 'tt-card-selected' : ''}`}
      title={item.summary || item.url}
    >
      <button
        aria-label={selected ? '取消选择' : '选择'}
        onClick={e => { e.stopPropagation(); onToggleSelect(item); }}
        className={`absolute -left-1.5 -top-1.5 z-10 w-5 h-5 rounded-full border flex items-center justify-center transition-opacity ${selected ? 'opacity-100 bg-[color:var(--ai)] border-[color:var(--ai)] text-[#0c1a26]' : `bg-[rgb(20_22_28)] border-white/25 text-transparent ${selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}`}
      >
        <Check size={12} strokeWidth={3} />
      </button>

      <div
        className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center overflow-hidden"
        style={{ background: `hsl(${hue} 35% 22% / 0.9)` }}
      >
        {icon && iconOk ? (
          <img src={icon} alt="" className="w-6 h-6 object-contain" onError={() => setIconOk(false)} />
        ) : (
          <span className="text-[17px] font-bold" style={{ color: `hsl(${hue} 70% 80%)` }}>{initial}</span>
        )}
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="truncate text-[14px] leading-tight text-[color:var(--text)]">{item.title}</span>
          {item.visits + item.opens > 2 && (
            <span className="shrink-0 text-[10px] text-[color:var(--muted)]" title={item.visits ? '最近 90 天的访问次数' : '通过 TTab 打开的次数'}>
              {item.visits || item.opens} 次
            </span>
          )}
        </div>
        <span className="truncate text-[11px] text-[color:var(--muted)]">{item.summary || item.domain}</span>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5 max-h-[22px] overflow-hidden">
            {item.tags.slice(0, 5).map(t => (
              <button
                key={t}
                onClick={e => { e.stopPropagation(); onTagClick(t); }}
                style={tagChipStyle(t, activeTags.includes(t) ? 'solid' : 'soft')}
                className="px-1.5 py-[1px] rounded-md border text-[10.5px] leading-[16px] hover:brightness-125"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        aria-label="编辑标签与详情"
        onClick={e => { e.stopPropagation(); onEdit(item); }}
        className="self-start p-1 rounded-md text-[color:var(--muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white/10 hover:text-[color:var(--text)]"
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
};

export default React.memo(ItemCard);
