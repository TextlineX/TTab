import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, X, Image as ImageIcon, Sparkles, Type,
  ChevronRight, FolderEdit, Globe, Maximize, Languages, Hash
} from 'lucide-react';
import { storage } from '../../../utils/storage';
import { getTranslation } from '../../../utils/i18n';
import FolderPicker from './FolderPicker';

interface SettingsPanelProps {
  currentPath: { id: string, title: string };
  onClose: () => void;
  onRefresh: () => void;
}

const PRESET_WALLPAPERS = [
  { id: 'default', name: 'Original', url: '' },
  { id: 'nature', name: 'Peak', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070' },
  { id: 'abstract', name: 'Liquid', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070' },
  { id: 'space', name: 'Void', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=2094' }
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, onRefresh }) => {
  const [config, setConfig] = useState<any>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    storage.getSettings().then(setConfig);
  }, []);

  const update = async (patch: any) => {
    const updated = { ...config, ...patch };
    setConfig(updated);
    await storage.updateSettings(patch);
    window.dispatchEvent(new Event('settings_updated'));
    onRefresh();
  };

  if (!config) return null;
  const t = getTranslation(config.language);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-sm h-full bg-[#111111] border-l border-white/10 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Settings className="text-blue-400" size={20} />
            <h2 className="text-sm font-bold tracking-widest text-white uppercase">{t.settings}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-all"><X size={20} className="text-white/40" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-10 no-scrollbar pb-20">
          
          {/* Section: Language */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-blue-400/60 font-black uppercase text-[10px] tracking-widest">
              <Globe size={14} /> <span>{t.language}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['auto', 'zh', 'en'].map(l => (
                <button 
                  key={l} 
                  onClick={() => update({ language: l })}
                  className={`py-2 rounded-xl text-[10px] font-bold uppercase transition-all border ${config.language === l ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/5 text-white/40'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </section>

          {/* Section: Typography */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-orange-400/60 font-black uppercase text-[10px] tracking-widest">
              <Languages size={14} /> <span>Typography</span>
            </div>
            <button 
              onClick={() => update({ useCustomFont: !config.useCustomFont })}
              className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${config.useCustomFont ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-white/5 border-white/5 text-white/40'}`}
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-bold uppercase tracking-widest">Xiaolai SC</span>
                <span className="text-[8px] opacity-60">Personalized Typeface</span>
              </div>
              <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${config.useCustomFont ? 'bg-orange-500' : 'bg-white/10'}`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.useCustomFont ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>
          </section>

          {/* Section: Layout Depth */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-blue-400/60 font-black uppercase text-[10px] tracking-widest">
              <Maximize size={14} /> <span>{t.gridDynamics}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60">{t.maxColumns}</span>
                  <span className="text-xs font-bold text-blue-400">{config.gridColumns}</span>
                </div>
                <input type="range" min="4" max="16" value={config.gridColumns} onChange={e => update({ gridColumns: parseInt(e.target.value) })} className="w-full accent-blue-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-white/60">{t.containerWidth}</span>
                  <span className="text-xs font-bold text-blue-400">{config.containerWidth}px</span>
                </div>
                <input type="range" min="600" max="1600" step="40" value={config.containerWidth} onChange={e => update({ containerWidth: parseInt(e.target.value) })} className="w-full accent-blue-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
              </div>
            </div>
          </section>

          {/* Section: Cloud Style */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-purple-400/60 font-black uppercase text-[10px] tracking-widest">
              <Sparkles size={14} /> <span>{t.cloudAesthetics}</span>
            </div>
            <div className="flex flex-col gap-3">
              {/* Organic Tilt Toggle */}
              <button 
                onClick={() => update({ tagRotation: !config.tagRotation })}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${config.tagRotation ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/5 text-white/40'}`}
              >
                <span className="text-xs font-bold uppercase tracking-widest">{t.organicTilt}</span>
                <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${config.tagRotation ? 'bg-purple-500' : 'bg-white/10'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.tagRotation ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </button>

              {/* Tag Color Toggle */}
              <button 
                onClick={() => update({ tagColorMode: !config.tagColorMode })}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${config.tagColorMode !== false ? 'bg-pink-500/10 border-pink-500/30 text-pink-400' : 'bg-white/5 border-white/5 text-white/40'}`}
              >
                <span className="text-xs font-bold uppercase tracking-widest">{t.coloredTags}</span>
                <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${config.tagColorMode !== false ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.tagColorMode !== false ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </button>

              {/* Pure Text Mode Toggle */}
              <button 
                onClick={() => update({ pureTextMode: !config.pureTextMode })}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${config.pureTextMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/5 text-white/40'}`}
              >
                <div className="flex items-center gap-2">
                  <Hash size={14} className="opacity-40" />
                  <span className="text-xs font-bold uppercase tracking-widest">{t.pureTextMode}</span>
                </div>
                <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${config.pureTextMode ? 'bg-amber-500' : 'bg-white/10'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.pureTextMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </button>

              {/* Max Font Size Slider */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-4">
                <div className="flex justify-between items-center text-white/60">
                  <div className="flex items-center gap-3"><Type size={16} /><span className="text-xs font-bold uppercase tracking-widest">{t.maxFontSize}</span></div>
                  <span className="text-xs font-bold text-purple-400">{config.tagMaxSize}px</span>
                </div>
                <input type="range" min="16" max="64" step="4" value={config.tagMaxSize} onChange={e => update({ tagMaxSize: parseInt(e.target.value) })} className="w-full accent-purple-500 h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
              </div>
            </div>
          </section>

          {/* Section: Root Context */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-emerald-400/60 font-black uppercase text-[10px] tracking-widest">
              <FolderEdit size={14} /> <span>{t.workspaceRoot}</span>
            </div>
            <button 
              onClick={() => setIsPickerOpen(true)}
              className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all flex flex-col items-start gap-1 group text-left"
            >
              <span className="text-[10px] text-white/40 font-bold uppercase group-hover:text-emerald-400 transition-colors">{t.changeRoot}</span>
              <div className="flex items-center gap-2 text-xs text-white font-bold">
                <span className="opacity-60">ID: {config.defaultFolderId}</span>
                <ChevronRight size={12} className="opacity-20" />
              </div>
            </button>
          </section>

          {/* Visual Theme */}
          <section className="flex flex-col gap-4 pb-10">
            <div className="flex items-center gap-2 text-pink-400/60 font-black uppercase text-[10px] tracking-widest">
              <ImageIcon size={14} /> <span>{t.visualTheme}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_WALLPAPERS.map(wp => (
                <button key={wp.id} onClick={() => update({ wallpaper: wp.url })} className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${config.wallpaper === wp.url ? 'border-pink-500 scale-[0.98]' : 'border-white/5 opacity-60 hover:opacity-100'}`}>
                  {wp.url ? <img src={wp.url} className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-black" />}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-[8px] font-black text-white uppercase tracking-widest">{wp.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

        </div>
      </motion.div>

      <AnimatePresence>
        {isPickerOpen && (
          <FolderPicker onClose={() => setIsPickerOpen(false)} onSelect={(id) => { update({ defaultFolderId: id }); setIsPickerOpen(false); }} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SettingsPanel;
