import React from 'react';
import { Hourglass } from 'lucide-react';
import type { BuiltinWidget, WidgetProps, WidgetSettingsProps } from '../types';
import { daysUntil } from './helpers';

interface Cfg { title: string; date: string }

const CountdownWidget: React.FC<WidgetProps<Cfg>> = ({ config }) => {
  const d = daysUntil(config.date);
  return (
    <div className="h-full flex flex-col items-center justify-center gap-1 px-3 text-center">
      {d === null ? (
        <span className="text-[12px] text-[color:var(--muted)]">在设置里填写日期</span>
      ) : (
        <>
          <span className="text-[12px] text-[color:var(--muted)] truncate max-w-full">{config.title || '倒计时'}{d < 0 ? '已经过去' : d === 0 ? '' : '还有'}</span>
          <span className="tt-greet text-[40px] leading-none text-[color:var(--text)] tabular-nums">{d === 0 ? '就是今天' : Math.abs(d)}</span>
          {d !== 0 && <span className="text-[12px] text-[color:var(--muted)]">天</span>}
        </>
      )}
    </div>
  );
};

const CountdownSettings: React.FC<WidgetSettingsProps<Cfg>> = ({ config, setConfig }) => (
  <div className="flex flex-col gap-3 text-[12px] text-[color:var(--muted)]">
    <label className="flex flex-col gap-1.5">事件名称
      <input value={config.title} onChange={e => setConfig({ title: e.target.value })} placeholder="例如：项目上线" className="h-9 px-3 rounded-[10px] bg-white/8 border border-white/15 outline-none text-[13px] text-[color:var(--text)]" />
    </label>
    <label className="flex flex-col gap-1.5">日期
      <input type="date" value={config.date} onChange={e => setConfig({ date: e.target.value })} className="h-9 px-3 rounded-[10px] bg-white/8 border border-white/15 outline-none text-[13px] text-[color:var(--text)] [color-scheme:dark]" />
    </label>
  </div>
);

export const countdownWidget: BuiltinWidget<Cfg> = {
  type: 'countdown', name: '倒计时', description: '距离某一天还有多少天。',
  icon: Hourglass, sizes: ['s', 'm'], defaultSize: 's', defaultConfig: { title: '', date: '' },
  Component: CountdownWidget, Settings: CountdownSettings,
};
