import React, { useEffect, useState } from 'react';
import { CloudSun, Loader2 } from 'lucide-react';
import type { BuiltinWidget, WidgetProps, WidgetSettingsProps } from '../types';
import { useWidgetData } from '../store';
import { describeWeather } from './helpers';

/** 天气数据来自 Open-Meteo（免费、无需 Key） */
interface Cfg { name: string; lat: number | null; lon: number | null }
interface Cache { at: number; temp: number; code: number; max: number; min: number; key: string }

const TTL = 30 * 60e3;

const WeatherWidget: React.FC<WidgetProps<Cfg>> = ({ config, instance }) => {
  const [cache, setCache] = useWidgetData<Cache | null>(instance.id, null);
  const [error, setError] = useState('');
  const key = `${config.lat},${config.lon}`;
  useEffect(() => {
    if (config.lat === null || config.lon === null) return;
    if (cache && cache.key === key && Date.now() - cache.at < TTL) return;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${config.lat}&longitude=${config.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    fetch(url).then(r => r.json()).then(d => {
      setCache({ at: Date.now(), key, temp: d.current.temperature_2m, code: d.current.weather_code, max: d.daily.temperature_2m_max[0], min: d.daily.temperature_2m_min[0] });
      setError('');
    }).catch(() => setError('获取天气失败，请检查网络或在设置里重新选择城市'));
  }, [key, cache, config.lat, config.lon, setCache]);

  if (config.lat === null) return <div className="h-full flex items-center justify-center text-[12px] text-[color:var(--muted)] px-3 text-center">在小组件设置里选择城市</div>;
  if (error && !cache) return <div className="h-full flex items-center justify-center text-[12px] text-[color:var(--warn)] px-3 text-center">{error}</div>;
  if (!cache) return <div className="h-full flex items-center justify-center"><Loader2 size={16} className="animate-spin text-[color:var(--muted)]" /></div>;
  const w = describeWeather(cache.code);
  return (
    <div className={`h-full flex ${instance.size === 's' ? 'flex-col justify-center items-center gap-1' : 'items-center justify-center gap-4'} px-3`}>
      <span className="text-[34px] leading-none">{w.emoji}</span>
      <div className={`flex flex-col ${instance.size === 's' ? 'items-center' : ''}`}>
        <span className="tt-greet text-[30px] leading-none text-[color:var(--text)] tabular-nums">{Math.round(cache.temp)}°</span>
        <span className="text-[12px] text-[color:var(--muted)] mt-1">{config.name} {w.text} {Math.round(cache.min)}°~{Math.round(cache.max)}°</span>
      </div>
    </div>
  );
};

const WeatherSettings: React.FC<WidgetSettingsProps<Cfg>> = ({ config, setConfig }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=zh`);
      setResults((await r.json()).results || []);
    } catch { setResults([]); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2 text-[12px] text-[color:var(--muted)]">
      <span>当前城市：{config.name || '未设置'}</span>
      <form onSubmit={e => { e.preventDefault(); void search(); }} className="flex gap-1.5">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="输入城市名，如 上海" className="flex-1 h-9 px-3 rounded-[10px] bg-white/8 border border-white/15 outline-none text-[13px] text-[color:var(--text)]" />
        <button type="submit" className="h-9 px-3 rounded-[10px] bg-white/10 text-[color:var(--text)]">{busy ? '…' : '搜索'}</button>
      </form>
      {results.map(r => (
        <button key={`${r.latitude},${r.longitude}`} onClick={() => { setConfig({ name: r.name, lat: r.latitude, lon: r.longitude }); setResults([]); }} className="text-left px-3 py-2 rounded-[10px] hover:bg-white/8 text-[13px] text-[color:var(--text)]">
          {r.name} <span className="text-[color:var(--muted)]">{[r.admin1, r.country].filter(Boolean).join('，')}</span>
        </button>
      ))}
    </div>
  );
};

export const weatherWidget: BuiltinWidget<Cfg> = {
  type: 'weather', name: '天气', description: '当前天气和今日气温（数据来自 Open-Meteo，免费无需 Key）。',
  icon: CloudSun, sizes: ['s', 'm'], defaultSize: 's', defaultConfig: { name: '', lat: null, lon: null },
  Component: WeatherWidget, Settings: WeatherSettings,
  hostPermissions: ['https://api.open-meteo.com/*', 'https://geocoding-api.open-meteo.com/*'],
};
