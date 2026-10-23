import React, { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import type { BuiltinWidget, WidgetProps, WidgetSettingsProps } from '../types';
import { uniqueByKey, usageOf } from '../../core/tagGraph';
import { resolveCollection } from '../../core/library';
import { faviconUrl, tagHue } from '../../components/smart/tagColor';

interface Cfg { source: string; count: number }

const Tile: React.FC<{ title: string; url: string; domain: string; onOpen: (bg: boolean) => void }> = ({ title, url, domain, onOpen }) => {
  const [ok, setOk] = useState(true);
  const icon = faviconUrl(url, 64);
  const hue = tagHue(domain || title);
  return (
    <button
      onClick={e => onOpen(e.ctrlKey || e.metaKey)}
      onAuxClick={e => { if (e.button === 1) onOpen(true); }}
      title={title}
      className="flex flex-col items-center gap-1.5 p-1.5 rounded-[10px] hover:bg-white/8 min-w-0"
    >
      <span className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: `hsl(${hue} 35% 22% / 0.9)` }}>
        {icon && ok ? <img src={icon} alt="" className="w-5 h-5" onError={() => setOk(false)} /> : <span className="text-[14px] font-bold" style={{ color: `hsl(${hue} 70% 80%)` }}>{(title[0] || '?').toUpperCase()}</span>}
      </span>
      <span className="w-full truncate text-[11px] text-[color:var(--muted)]">{title}</span>
    </button>
  );
};

const TopSitesWidget: React.FC<WidgetProps<Cfg>> = ({ config, host, instance }) => {
  const list = useMemo(() => {
    const uniq = uniqueByKey(host.items);
    if (config.source.startsWith('col:')) {
      const col = host.collections.find(c => `col:${c.id}` === config.source);
      return col ? resolveCollection(col, uniq) : [];
    }
    const ranked = config.source === 'now'
      ? [...uniq].sort((a, b) => b.nowScore - a.nowScore || usageOf(b) - usageOf(a))
      : [...uniq].sort((a, b) => usageOf(b) - usageOf(a) || (b.dateAdded || 0) - (a.dateAdded || 0));
    return ranked;
  }, [host.items, host.collections, config.source]);
  const cols = instance.size === 's' ? 2 : 4;
  const rows = instance.size === 'l' ? 4 : 2;
  const shown = list.slice(0, Math.min(config.count || 99, cols * rows));
  return (
    <div className="h-full p-2.5 grid content-start gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {shown.map(it => <Tile key={it.key} title={it.title} url={it.url} domain={it.domain} onOpen={bg => host.openUrl(it.url, bg)} />)}
      {!shown.length && <p className="col-span-full p-2 text-[12px] text-[color:var(--muted)]">这个组合里还没有网页</p>}
    </div>
  );
};

const TopSitesSettings: React.FC<WidgetSettingsProps<Cfg>> = ({ config, setConfig, host }) => (
  <label className="flex flex-col gap-1.5 text-[12px] text-[color:var(--muted)]">
    显示哪些网页
    <select value={config.source} onChange={e => setConfig({ source: e.target.value })} className="h-9 px-2 rounded-[10px] bg-white/8 border border-white/15 text-[13px] text-[color:var(--text)] outline-none">
      <option value="frequent" className="bg-[#1b1d23]">最常用</option>
      <option value="now" className="bg-[#1b1d23]">此刻常用（按时段）</option>
      {host.collections.map(c => <option key={c.id} value={`col:${c.id}`} className="bg-[#1b1d23]">组合：{c.name}</option>)}
    </select>
  </label>
);

export const topSitesWidget: BuiltinWidget<Cfg> = {
  type: 'topsites', name: '常用网站', description: '最常用的网站，或者某个组合里的网站，一键打开。',
  icon: Star, sizes: ['s', 'm', 'l', 'w'], defaultSize: 'm', defaultConfig: { source: 'frequent', count: 0 },
  Component: TopSitesWidget, Settings: TopSitesSettings,
};
