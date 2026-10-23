import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Sparkles, Loader2 } from 'lucide-react';
import { currentTagPrefix } from '../../core/search';
import type { TagStat } from '../../core/tagGraph';
import { tagChipStyle } from './tagColor';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** 回车：打开第一个结果 */
  onSubmit: () => void;
  /** Ctrl/⌘ + 回车 或 AI 按钮：交给 AI */
  onAsk: (text: string) => void;
  aiReady: boolean;
  thinking: boolean;
  vocabulary: TagStat[];
}

const CommandBar: React.FC<Props> = ({ value, onChange, onSubmit, onAsk, aiReady, thinking, vocabulary }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0);

  // 按 / 聚焦
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const prefix = currentTagPrefix(value);
  const suggestions = useMemo(() => {
    if (prefix === null) return [];
    const p = prefix.toLowerCase();
    return vocabulary.filter(t => t.tag.toLowerCase().includes(p)).slice(0, 8);
  }, [prefix, vocabulary]);

  useEffect(() => setHi(0), [prefix]);

  const completeTag = (tag: string) => {
    const next = value.replace(/(-?#)[^\s#]*$/, `$1${tag} `);
    onChange(next);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length && focused) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) { e.preventDefault(); completeTag(suggestions[hi].tag); return; }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && value.trim()) onAsk(value.trim());
      else onSubmit();
    }
    if (e.key === 'Escape') {
      if (value) onChange(''); else inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-full">
      <div className={`tt-command flex items-center gap-3 pl-5 pr-2 h-[60px] rounded-[20px] transition-shadow ${focused ? 'tt-command-focus' : ''}`}>
        <Search size={20} className="shrink-0 text-[color:var(--muted)]" />
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={aiReady ? '搜索书签、输入 #标签 筛选，或者直接告诉 AI 你想做什么' : '搜索书签，输入 #标签 筛选，site:域名 限定网站'}
          className="flex-1 min-w-0 bg-transparent outline-none text-[17px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
          aria-label="搜索或指令"
          autoFocus
        />
        <button
          onClick={() => value.trim() && onAsk(value.trim())}
          disabled={thinking}
          title={aiReady ? '交给 AI（Ctrl + Enter）' : '在设置里配置 AI 后可用'}
          className={`shrink-0 h-11 px-4 rounded-[14px] flex items-center gap-2 text-[14px] transition-colors ${aiReady ? 'tt-ai-btn' : 'text-[color:var(--muted)] hover:bg-white/5'}`}
        >
          {thinking ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          <span>{thinking ? '思考中' : '问 AI'}</span>
        </button>
      </div>

      {focused && suggestions.length > 0 && (
        <div className="tt-pop absolute left-3 right-3 top-[66px] z-30 p-1.5 rounded-[14px] flex flex-col">
          {suggestions.map((s, i) => (
            <button
              key={s.tag}
              onMouseDown={e => { e.preventDefault(); completeTag(s.tag); }}
              onMouseEnter={() => setHi(i)}
              className={`flex items-center justify-between px-3 py-2 rounded-[10px] text-left ${i === hi ? 'bg-white/10' : ''}`}
            >
              <span style={tagChipStyle(s.tag, 'soft')} className="px-2 py-0.5 rounded-md border text-[13px]">#{s.tag}</span>
              <span className="text-[12px] text-[color:var(--muted)]">{s.count} 个网页</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommandBar;
