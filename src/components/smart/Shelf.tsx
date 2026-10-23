import React from 'react';
import { ExternalLink, Bookmark, Trash2, Pin, Sparkles, Layers } from 'lucide-react';
import type { Collection, LibraryItem } from '../../core/types';
import type { Combo, SmartView } from '../../core/tagGraph';
import type { Cluster } from '../../core/vectors/semantic';
import { faviconUrl, tagChipStyle } from './tagColor';
import { slotLabel, slotOf } from '../../core/usage';

export type ShelfKey = `view:${SmartView['id']}` | `col:${string}` | `grp:${string}` | null;

const VIEW_NAMES: Record<SmartView['id'], string> = {
  now: `${slotLabel(slotOf(new Date()))}常用`,
  frequent: '常用',
  recent: '最近添加',
  untagged: '未打标签',
  duplicates: '重复书签',
};

interface Props {
  views: SmartView[];
  collections: { col: Collection; members: LibraryItem[] }[];
  combos: { combo: Combo; members: LibraryItem[] }[];
  /** 按内容相似自动分出的组 */
  groups: { cluster: Cluster; members: LibraryItem[] }[];
  active: ShelfKey;
  activeTags: string[];
  onSelect: (k: ShelfKey) => void;
  onApplyCombo: (c: Combo) => void;
  onSaveCombo: (c: Combo) => void;
  onSaveGroup: (c: Cluster) => void;
  onOpenAll: (items: LibraryItem[], title: string) => void;
  onDeleteCollection: (id: string) => void;
  onTogglePin: (id: string) => void;
}

const Faces: React.FC<{ items: LibraryItem[] }> = ({ items }) => (
  <div className="flex -space-x-1.5">
    {items.slice(0, 4).map(it => {
      const src = faviconUrl(it.url, 32);
      return (
        <span key={it.key} className="w-5 h-5 rounded-full bg-[rgb(30_33_40)] ring-2 ring-[rgb(24_26_32)] flex items-center justify-center overflow-hidden text-[9px] text-[color:var(--muted)]">
          {src ? <img src={src} alt="" className="w-3.5 h-3.5" /> : it.title[0]}
        </span>
      );
    })}
  </div>
);

const Shelf: React.FC<Props> = ({ views, collections, combos, groups, active, activeTags, onSelect, onApplyCombo, onSaveCombo, onSaveGroup, onOpenAll, onDeleteCollection, onTogglePin }) => {
  const visibleViews = views.filter(v => v.keys.length > 0);
  const sameTags = (c: Combo) => c.tags.length === activeTags.length && c.tags.every(t => activeTags.includes(t));

  return (
    <div className="flex flex-col gap-3">
      {visibleViews.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleViews.map(v => {
            const key = `view:${v.id}` as ShelfKey;
            const on = active === key;
            return (
              <button
                key={v.id}
                onClick={() => onSelect(on ? null : key)}
                title={v.id === 'now' ? '根据你在这个时段的浏览习惯推荐' : undefined}
                className={`h-7 px-3 rounded-full text-[13px] border transition-colors ${on ? 'bg-[color:var(--text)] text-[#15171c] border-transparent' : 'border-white/12 text-[color:var(--muted)] hover:text-[color:var(--text)] hover:border-white/25'} ${v.id === 'duplicates' && !on ? '!text-[color:var(--warn)]' : ''}`}
              >
                {VIEW_NAMES[v.id]} <span className="opacity-60 ml-0.5">{v.keys.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {(collections.length > 0 || combos.length > 0 || groups.length > 0) && (
        <div className="tt-shelf-row flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
          {collections.map(({ col, members }) => {
            const key = `col:${col.id}` as ShelfKey;
            const on = active === key;
            return (
              <div
                key={col.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(on ? null : key)}
                onKeyDown={e => e.key === 'Enter' && onSelect(on ? null : key)}
                className={`tt-collection group shrink-0 w-[200px] p-3 rounded-[16px] flex flex-col gap-2 cursor-pointer ${on ? 'tt-collection-on' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[20px] leading-none">{col.emoji || (col.source === 'ai' ? '✨' : '📌')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] text-[color:var(--text)]">{col.name}</div>
                    <div className="truncate text-[11px] text-[color:var(--muted)]">
                      {col.description || (col.query ? col.query.tags.join(col.query.mode === 'and' ? ' + ' : ' / ') : `${members.length} 个网页`)}
                    </div>
                  </div>
                  {col.pinned && <Pin size={12} className="text-[color:var(--muted)] shrink-0" />}
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <Faces items={members} />
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconBtn label="全部打开" onClick={() => onOpenAll(members, col.name)}><ExternalLink size={13} /></IconBtn>
                    <IconBtn label={col.pinned ? '取消置顶' : '置顶'} onClick={() => onTogglePin(col.id)}><Pin size={13} /></IconBtn>
                    <IconBtn label="删除组合" onClick={() => onDeleteCollection(col.id)}><Trash2 size={13} /></IconBtn>
                  </div>
                </div>
              </div>
            );
          })}

          {groups.map(({ cluster, members }) => {
            const key = `grp:${cluster.id}` as ShelfKey;
            const on = active === key;
            return (
              <div
                key={cluster.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(on ? null : key)}
                onKeyDown={e => e.key === 'Enter' && onSelect(on ? null : key)}
                className={`tt-combo group shrink-0 w-[200px] p-3 rounded-[16px] flex flex-col gap-2 cursor-pointer ${on ? 'tt-collection-on' : ''}`}
                title="自动分组：内容相近的网页"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Layers size={13} className="shrink-0 text-[color:var(--muted)]" />
                  <span className="truncate text-[14px] text-[color:var(--text)]">{cluster.label}</span>
                </div>
                <div className="text-[11px] text-[color:var(--muted)]">{members.length} 个内容相近的网页</div>
                <div className="flex items-center justify-between mt-auto">
                  <Faces items={members} />
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconBtn label="全部打开" onClick={() => onOpenAll(members, cluster.label)}><ExternalLink size={13} /></IconBtn>
                    <IconBtn label="保存为我的组合" onClick={() => onSaveGroup(cluster)}><Bookmark size={13} /></IconBtn>
                  </div>
                </div>
              </div>
            );
          })}

          {combos.map(({ combo, members }) => {
            const on = sameTags(combo);
            return (
              <div
                key={combo.id}
                role="button"
                tabIndex={0}
                onClick={() => onApplyCombo(combo)}
                onKeyDown={e => e.key === 'Enter' && onApplyCombo(combo)}
                className={`tt-combo group shrink-0 w-[200px] p-3 rounded-[16px] flex flex-col gap-2 cursor-pointer ${on ? 'tt-collection-on' : ''}`}
                title="推荐组合：这些标签经常一起出现"
              >
                <div className="flex items-center gap-1 flex-wrap">
                  <Sparkles size={12} className="text-[color:var(--muted)] mr-0.5" />
                  {combo.tags.map(t => (
                    <span key={t} style={tagChipStyle(t, 'soft')} className="px-1.5 rounded-md border text-[12px] leading-[18px]">{t}</span>
                  ))}
                </div>
                <div className="text-[11px] text-[color:var(--muted)]">推荐组合，{members.length} 个网页</div>
                <div className="flex items-center justify-between mt-auto">
                  <Faces items={members} />
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconBtn label="全部打开" onClick={() => onOpenAll(members, combo.tags.join('+'))}><ExternalLink size={13} /></IconBtn>
                    <IconBtn label="保存为我的组合" onClick={() => onSaveCombo(combo)}><Bookmark size={13} /></IconBtn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const IconBtn: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button
    aria-label={label}
    title={label}
    onClick={e => { e.stopPropagation(); onClick(); }}
    className="p-1.5 rounded-md text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-white/10"
  >
    {children}
  </button>
);

export { VIEW_NAMES };
export default Shelf;
