import React from 'react';
import { X, Plus } from 'lucide-react';
import type { RelatedTag } from '../../core/tagGraph';
import { tagChipStyle } from './tagColor';

interface Props {
  selected: string[];
  mode: 'and' | 'or';
  related: RelatedTag[];
  onToggle: (tag: string) => void;
  onModeChange: (m: 'and' | 'or') => void;
  onClear: () => void;
  onManageTags: () => void;
}

/**
 * 标签关系条：
 * 左侧是已选标签（实色），右侧是与之相关的标签，颜色越实表示关联越强。
 * 没选标签时，右侧展示最常用的标签作为入口。
 */
const TagBar: React.FC<Props> = ({ selected, mode, related, onToggle, onModeChange, onClear, onManageTags }) => {
  const max = related[0]?.score || 1;
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
      {selected.map((t, i) => (
        <React.Fragment key={t}>
          {i > 0 && (
            <button
              onClick={() => onModeChange(mode === 'and' ? 'or' : 'and')}
              className="text-[12px] px-1 text-[color:var(--muted)] hover:text-[color:var(--text)]"
              title="切换：同时包含 / 包含任一"
            >
              {mode === 'and' ? '且' : '或'}
            </button>
          )}
          <button
            onClick={() => onToggle(t)}
            style={tagChipStyle(t, 'solid')}
            className="group flex items-center gap-1 pl-2.5 pr-1.5 h-7 rounded-full border text-[13px]"
          >
            {t}
            <X size={13} className="opacity-60 group-hover:opacity-100" />
          </button>
        </React.Fragment>
      ))}

      {selected.length > 0 && related.length > 0 && <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />}

      {related.map(r => (
        <button
          key={r.tag}
          onClick={() => onToggle(r.tag)}
          style={tagChipStyle(r.tag, 'ghost', r.score / max)}
          className="flex items-center gap-1 px-2.5 h-7 rounded-full border text-[13px] hover:!bg-white/5"
          title={selected.length ? `在当前结果中有 ${r.count} 个${r.narrows ? '' : '（全部都有）'}` : `${r.count} 个网页`}
        >
          {selected.length > 0 && <Plus size={11} className="opacity-60" />}
          {r.tag}
          <span className="text-[10px] opacity-55">{r.count}</span>
        </button>
      ))}

      <div className="ml-auto flex items-center gap-3 text-[12px] text-[color:var(--muted)]">
        {selected.length > 0 && <button onClick={onClear} className="hover:text-[color:var(--text)]">清除筛选</button>}
        <button onClick={onManageTags} className="hover:text-[color:var(--text)]">管理标签</button>
      </div>
    </div>
  );
};

export default TagBar;
