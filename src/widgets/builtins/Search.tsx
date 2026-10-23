import React, { useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import type { BuiltinWidget, WidgetProps, WidgetSettingsProps } from '../types';
import { ENGINES, searchUrl } from './helpers';

interface Cfg { engine: string; customUrl: string }

const SearchWidget: React.FC<WidgetProps<Cfg>> = ({ config, setConfig, host }) => {
  const [q, setQ] = useState('');
  const go = (background = false) => { if (q.trim()) host.openUrl(searchUrl(config, q.trim()), background); };
  const engines = ENGINES.filter(e => e.id !== 'custom' || config.customUrl);
  return (
    <div className="h-full flex flex-col justify-center gap-2.5 px-4">
      <form
        onSubmit={e => { e.preventDefault(); go(); }}
        className="flex items-center gap-2 h-11 px-3 rounded-[12px] bg-white/8 border border-white/10 focus-within:border-white/30"
      >
        <SearchIcon size={16} className="text-[color:var(--muted)]" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(true); } }}
          placeholder={`用${ENGINES.find(e => e.id === config.engine)?.name || '必应'}搜索网页`}
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]"
          aria-label="搜索网页"
        />
      </form>
      <div className="flex gap-1 flex-wrap">
        {engines.map(e => (
          <button
            key={e.id}
            onClick={() => setConfig({ engine: e.id })}
            className={`h-6 px-2 rounded-full text-[11px] ${config.engine === e.id ? 'bg-white/15 text-[color:var(--text)]' : 'text-[color:var(--muted)] hover:text-[color:var(--text)]'}`}
          >{e.name}</button>
        ))}
      </div>
    </div>
  );
};

const SearchSettings: React.FC<WidgetSettingsProps<Cfg>> = ({ config, setConfig }) => (
  <label className="flex flex-col gap-1.5 text-[12px] text-[color:var(--muted)]">
    自定义搜索地址（用 %s 代表搜索词）
    <input
      value={config.customUrl}
      onChange={e => setConfig({ customUrl: e.target.value.trim(), engine: e.target.value.trim() ? 'custom' : 'bing' })}
      placeholder="https://example.com/search?q=%s"
      className="h-9 px-3 rounded-[10px] bg-white/8 border border-white/15 outline-none text-[13px] text-[color:var(--text)]"
    />
  </label>
);

export const searchWidget: BuiltinWidget<Cfg> = {
  type: 'search', name: '网页搜索', description: '用必应、百度、Google 等搜索网页。Ctrl + Enter 在后台打开。',
  icon: SearchIcon, sizes: ['m', 'w'], defaultSize: 'm',
  defaultConfig: { engine: 'bing', customUrl: '' },
  Component: SearchWidget, Settings: SearchSettings,
};
