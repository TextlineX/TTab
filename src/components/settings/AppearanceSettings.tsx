import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Upload, Monitor, Moon, Sun, Pipette, Link2 } from 'lucide-react';
import { ACCENTS, type ThemeSettings } from '../../theme/tokens';
import { normalizeTheme } from '../../theme/useTheme';
import Segmented from '../../ui/Segmented';
import Slider from '../../ui/Slider';
import { spring } from '../../ui/motion';
import { Group, Row, inputCls } from './parts';

interface Props {
  value?: Partial<ThemeSettings>;
  legacyWallpaper?: string;
  onChange: (t: ThemeSettings) => void;
}

const PRESET_WALLPAPERS = [
  { id: 'peak', name: '山峰', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070' },
  { id: 'liquid', name: '流体', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070' },
  { id: 'void', name: '星空', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=2094' },
  { id: 'lake', name: '湖泊', url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=2070' },
];

const BG_TYPES: { id: ThemeSettings['background']['type']; name: string; desc: string }[] = [
  { id: 'aurora', name: '极光', desc: '由强调色生成，缓慢流动' },
  { id: 'solid', name: '纯色', desc: '安静，最省电' },
  { id: 'image', name: '图片', desc: '预设、上传或网址' },
  { id: 'bing', name: '必应每日', desc: '每天自动换一张' },
];

const BgPreview: React.FC<{ type: string; image?: string }> = ({ type, image }) => {
  if (type === 'aurora') return <span className="absolute inset-0" style={{ background: 'radial-gradient(60% 80% at 20% 10%, var(--aurora-1), transparent 70%), radial-gradient(60% 80% at 90% 20%, var(--aurora-2), transparent 70%), radial-gradient(70% 70% at 50% 110%, var(--aurora-3), transparent 70%), var(--bg)' }} />;
  if (type === 'solid') return <span className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% -20%, var(--accent-soft), transparent 70%), var(--bg)' }} />;
  if (type === 'image') return image ? <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <span className="absolute inset-0 bg-fill-3" />;
  return <span className="absolute inset-0 flex items-center justify-center text-[22px] font-semibold text-white" style={{ background: 'linear-gradient(135deg,#0f6cbd,#3fb6a8)' }}>b</span>;
};

const AppearanceSettings: React.FC<Props> = ({ value, legacyWallpaper, onChange }) => {
  const t = normalizeTheme(value, legacyWallpaper);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const set = (patch: Partial<ThemeSettings>) => onChange({ ...t, ...patch });
  const setBg = (patch: Partial<ThemeSettings['background']>) => onChange({ ...t, background: { ...t.background, ...patch } });
  const hasImage = t.background.type === 'image' || t.background.type === 'bing';

  const chooseBing = () => {
    // 必应每日图片需要访问 www.bing.com（在点击里同步申请）
    const req = typeof chrome !== 'undefined' && chrome.permissions?.request ? chrome.permissions.request({ origins: ['https://www.bing.com/*'] }) : Promise.resolve(true);
    void req.then(ok => { if (ok) setBg({ type: 'bing' }); else setError('没有获得访问 www.bing.com 的权限'); });
  };

  const upload = (file: File) => {
    if (file.size > 8 * 1024 * 1024) { setError('图片太大了，请选择 8MB 以内的图片'); return; }
    const reader = new FileReader();
    reader.onload = () => { setBg({ type: 'image', image: String(reader.result) }); setError(''); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-7">
      <Group title="明暗">
        <Row label="外观模式" desc="跟随系统时，会随着系统的深色 / 浅色设置自动切换">
          <Segmented
            ariaLabel="外观模式" value={t.mode} onChange={mode => set({ mode })}
            options={[
              { value: 'auto', label: '跟随系统', icon: <Monitor size={14} /> },
              { value: 'dark', label: '深色', icon: <Moon size={14} /> },
              { value: 'light', label: '浅色', icon: <Sun size={14} /> },
            ]}
          />
        </Row>
      </Group>

      <Group title="强调色" desc="按钮、选中状态、背景光晕都使用这个颜色；文字颜色会自动调整，保证看得清">
        <div className="px-4 py-4 flex flex-wrap items-center gap-3">
          {ACCENTS.map(a => {
            const on = t.accent.toLowerCase() === a.hex.toLowerCase();
            return (
              <button key={a.id} onClick={() => set({ accent: a.hex })} aria-label={a.name} aria-pressed={on} className="flex flex-col items-center gap-1.5 w-14">
                <span className="relative w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105" style={{ background: a.hex, boxShadow: on ? `0 0 0 3px var(--surface-solid), 0 0 0 5px ${a.hex}` : 'inset 0 0 0 1px rgb(0 0 0 / 0.15)' }}>
                  {on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.snappy}><Check size={18} strokeWidth={3} className="text-white drop-shadow" /></motion.span>}
                </span>
                <span className={`text-[12px] ${on ? 'text-fg' : 'text-muted'}`}>{a.name}</span>
              </button>
            );
          })}
          <button
            onClick={() => hasImage && set({ accent: 'wallpaper' })}
            disabled={!hasImage}
            title={hasImage ? '从当前壁纸里取最鲜明的颜色' : '先选择图片或必应每日背景'}
            aria-pressed={t.accent === 'wallpaper'}
            className="flex flex-col items-center gap-1.5 w-14 disabled:opacity-40"
          >
            <span className="w-10 h-10 rounded-full flex items-center justify-center border border-line-strong bg-fill-2 transition-transform hover:scale-105" style={t.accent === 'wallpaper' ? { boxShadow: '0 0 0 3px var(--surface-solid), 0 0 0 5px var(--accent)' } : undefined}>
              <Pipette size={17} className="text-fg" />
            </span>
            <span className={`text-[12px] ${t.accent === 'wallpaper' ? 'text-fg' : 'text-muted'}`}>壁纸取色</span>
          </button>
          <label className="flex flex-col items-center gap-1.5 w-14 cursor-pointer">
            <span className="relative w-10 h-10 rounded-full overflow-hidden border border-line-strong" style={{ background: 'conic-gradient(#f66,#fd6,#6f6,#6ff,#66f,#f6f,#f66)' }}>
              <input type="color" value={t.accent.startsWith('#') ? t.accent : '#3fb6a8'} onChange={e => set({ accent: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="自定义颜色" />
            </span>
            <span className="text-[12px] text-muted">自定义</span>
          </label>
        </div>
      </Group>

      <Group title="背景">
        <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BG_TYPES.map(b => {
            const on = t.background.type === b.id;
            return (
              <button
                key={b.id}
                onClick={() => (b.id === 'bing' ? chooseBing() : b.id === 'image' ? setBg({ type: 'image', image: t.background.image || PRESET_WALLPAPERS[0].url }) : setBg({ type: b.id }))}
                aria-pressed={on}
                className={`group text-left rounded-2xl p-1.5 border transition-colors ${on ? 'border-[color:var(--accent-line)] bg-accent-soft' : 'border-line hover:border-line-strong'}`}
              >
                <span className="relative block h-20 rounded-xl overflow-hidden"><BgPreview type={b.id} image={t.background.image} /></span>
                <span className="block px-1.5 pt-2 text-[13px] text-fg">{b.name}</span>
                <span className="block px-1.5 pb-1 text-[11.5px] text-faint">{b.desc}</span>
              </button>
            );
          })}
        </div>
        {t.background.type === 'image' && (
          <div className="px-4 py-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PRESET_WALLPAPERS.map(w => (
                <button key={w.id} onClick={() => setBg({ image: w.url })} aria-label={w.name} className={`relative h-16 rounded-xl overflow-hidden border-2 transition-colors ${t.background.image === w.url ? 'border-accent' : 'border-transparent hover:border-line-strong'}`}>
                  <img src={w.url.replace('w=2070', 'w=400').replace('w=2094', 'w=400')} alt="" className="absolute inset-0 w-full h-full object-cover" />
                </button>
              ))}
              <label className="h-16 rounded-xl border-2 border-dashed border-line-strong hover:border-[color:var(--accent-line)] flex flex-col items-center justify-center gap-1 text-[12px] text-muted cursor-pointer">
                <Upload size={16} />上传图片
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              </label>
            </div>
            <form onSubmit={e => { e.preventDefault(); if (/^https?:\/\//.test(url)) { setBg({ image: url.trim() }); setUrl(''); } }} className="flex gap-2">
              <div className="relative flex-1">
                <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="或者粘贴图片网址 https://…" className={`${inputCls} pl-9`} />
              </div>
              <button type="submit" disabled={!/^https?:\/\//.test(url)} className="h-10 px-4 rounded-xl bg-fill-2 hover:bg-fill-3 text-[13.5px] text-fg disabled:opacity-40">使用</button>
            </form>
          </div>
        )}
        {hasImage && (
          <>
            <Row label="模糊" desc="壁纸太花时加一点模糊，内容更清楚" stack>
              <Slider ariaLabel="模糊" value={t.background.blur} min={0} max={30} onChange={blur => setBg({ blur })} format={v => `${v}px`} />
            </Row>
            <Row label="遮罩" desc="深色模式下压暗、浅色模式下提亮" stack>
              <Slider ariaLabel="遮罩" value={Math.round(t.background.dim * 100)} min={0} max={85} onChange={v => setBg({ dim: v / 100 })} format={v => `${v}%`} />
            </Row>
          </>
        )}
        {error && <p className="px-4 py-3 text-[12.5px] text-warn">{error}</p>}
      </Group>

      <Group title="排版">
        <Row label="字体" desc="晓来手写体很有个性，但大段文字用系统字体更易读">
          <Segmented ariaLabel="字体" value={t.font} onChange={font => set({ font })} options={[
            { value: 'title', label: '标题手写' },
            { value: 'all', label: '全部手写' },
            { value: 'none', label: '系统字体' },
          ]} />
        </Row>
        <Row label="卡片密度" desc="紧凑模式一屏显示更多网页">
          <Segmented ariaLabel="卡片密度" value={t.density} onChange={density => set({ density })} options={[
            { value: 'comfortable', label: '舒适' },
            { value: 'compact', label: '紧凑' },
          ]} />
        </Row>
      </Group>
    </div>
  );
};

export default AppearanceSettings;
