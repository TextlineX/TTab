import React, { useEffect, useState } from 'react';
import { Clock as ClockIcon } from 'lucide-react';
import type { BuiltinWidget, WidgetProps, WidgetSettingsProps } from '../types';

interface Cfg { seconds: boolean; timeZone: string; label: string }

const fmt = (d: Date, cfg: Cfg) => {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false, ...(cfg.seconds ? { second: '2-digit' } : {}) };
  if (cfg.timeZone) opts.timeZone = cfg.timeZone;
  try { return d.toLocaleTimeString('zh-CN', opts); } catch { return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
};
const fmtDate = (d: Date, cfg: Cfg) => {
  try { return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', ...(cfg.timeZone ? { timeZone: cfg.timeZone } : {}) }); } catch { return d.toLocaleDateString('zh-CN'); }
};

const ClockWidget: React.FC<WidgetProps<Cfg>> = ({ config, instance }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), config.seconds ? 1000 : 10_000);
    return () => clearInterval(t);
  }, [config.seconds]);
  const big = instance.size !== 's';
  return (
    <div className="h-full flex flex-col items-center justify-center gap-1">
      <span className={`tt-greet tabular-nums text-[color:var(--text)] ${big ? 'text-[44px]' : 'text-[32px]'} leading-none`}>{fmt(now, config)}</span>
      <span className="text-[12px] text-[color:var(--muted)]">{config.label || fmtDate(now, config)}</span>
    </div>
  );
};

const ClockSettings: React.FC<WidgetSettingsProps<Cfg>> = ({ config, setConfig }) => (
  <div className="flex flex-col gap-3 text-[12px] text-[color:var(--muted)]">
    <label className="flex items-center gap-2"><input type="checkbox" className="accent-sky-300" checked={config.seconds} onChange={e => setConfig({ seconds: e.target.checked })} />显示秒</label>
    <label className="flex flex-col gap-1.5">时区（留空用本机时区，例如 Asia/Shanghai、America/Los_Angeles）
      <input value={config.timeZone} onChange={e => setConfig({ timeZone: e.target.value.trim() })} className="h-9 px-3 rounded-[10px] bg-white/8 border border-white/15 outline-none text-[13px] text-[color:var(--text)]" />
    </label>
    <label className="flex flex-col gap-1.5">名称（例如"北京"，留空显示日期）
      <input value={config.label} onChange={e => setConfig({ label: e.target.value })} className="h-9 px-3 rounded-[10px] bg-white/8 border border-white/15 outline-none text-[13px] text-[color:var(--text)]" />
    </label>
  </div>
);

export const clockWidget: BuiltinWidget<Cfg> = {
  type: 'clock', name: '时钟', description: '时钟，可设置时区，适合看其他城市的时间。',
  icon: ClockIcon, sizes: ['s', 'm'], defaultSize: 's', defaultConfig: { seconds: false, timeZone: '', label: '' },
  Component: ClockWidget, Settings: ClockSettings,
};
