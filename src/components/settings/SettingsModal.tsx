import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Palette, Sparkles, Waypoints, Compass, Database, LayoutGrid, Info, ArrowRight, Cloud } from 'lucide-react';
import { useSettings } from '../../state/useSettings';
import { fade, pop, spring } from '../../ui/motion';
import AppearanceSettings from './AppearanceSettings';
import AISettings from '../smart/AISettings';
import EmbedSettings from '../smart/EmbedSettings';
import SmartSettings from '../smart/SmartSettings';
import DataSettings from '../smart/DataSettings';
import CloudSettings from './CloudSettings';
import type { CloudApi } from '../../state/useCloud';
import { Group, Row } from './parts';
import Button from '../../ui/Button';

type Section = 'appearance' | 'ai' | 'embed' | 'smart' | 'cloud' | 'data' | 'classic' | 'about';

const SECTIONS: { id: Section; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: '外观', desc: '明暗、强调色、背景和字体', icon: <Palette size={17} /> },
  { id: 'ai', label: 'AI 助手', desc: '自动打标签、整理书签、自然语言查找', icon: <Sparkles size={17} /> },
  { id: 'embed', label: '语义向量', desc: '让相关推荐和搜索理解「意思」', icon: <Waypoints size={17} /> },
  { id: 'smart', label: '智能推荐', desc: '浏览历史、网页简介、自动归类', icon: <Compass size={17} /> },
  { id: 'cloud', label: '云端与同步', desc: '账号、跨浏览器同步、社区标签比对', icon: <Cloud size={17} /> },
  { id: 'data', label: '数据', desc: '备份与在浏览器之间迁移', icon: <Database size={17} /> },
  { id: 'classic', label: '经典视图', desc: '原来的文件夹磁贴首页', icon: <LayoutGrid size={17} /> },
  { id: 'about', label: '快捷键与关于', desc: '', icon: <Info size={17} /> },
];

const SHORTCUTS: [string[], string][] = [
  [['/'], '聚焦搜索框'],
  [['Ctrl', 'Enter'], '把输入的话交给 AI 处理'],
  [['['], '展开 / 收起侧边栏'],
  [['Esc'], '关闭弹窗、取消选择、返回上一级'],
  [['Ctrl', 'Z'], '撤销上一步'],
  [['Shift', '点击'], '多选网页'],
  [['右键'], '网页的更多操作'],
];

interface Props {
  onClose: () => void;
  onClassic?: () => void;
  initial?: Section;
  cloud?: CloudApi;
}

/** 设置：左侧分区导航 + 右侧内容，每一行都是「左边说明，右边控件」 */
const SettingsModal: React.FC<Props> = ({ onClose, onClassic, initial = 'appearance', cloud }) => {
  const { settings, update } = useSettings();
  const [section, setSection] = useState<Section>(initial);
  const current = SECTIONS.find(s => s.id === section)!;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <motion.div variants={fade} initial="hidden" animate="show" exit="exit" onClick={onClose} className="absolute inset-0 bg-[color:var(--scrim)] backdrop-blur-[3px]" />
      <motion.div
        variants={pop} initial="hidden" animate="show" exit="exit"
        className="tt-raised relative w-full max-w-[940px] h-[min(760px,92vh)] rounded-[24px] flex flex-col sm:flex-row overflow-hidden"
        role="dialog" aria-modal="true" aria-label="设置"
      >
        {/* 分区导航：宽屏在左侧，窄屏变成顶部横向滚动 */}
        <nav aria-label="设置分区" className="shrink-0 sm:w-[230px] border-b sm:border-b-0 sm:border-r border-line bg-fill-1 flex sm:flex-col gap-1 p-2 sm:p-3 overflow-x-auto sm:overflow-x-visible">
          <h2 className="hidden sm:block px-3 pt-2 pb-4 text-[20px] font-semibold text-fg tt-display">设置</h2>
          {SECTIONS.map(s => {
            const on = s.id === section;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                aria-current={on ? 'page' : undefined}
                className={`relative shrink-0 flex items-center gap-3 h-10 px-3 rounded-xl text-[14px] text-left whitespace-nowrap transition-colors ${on ? 'text-fg' : 'text-muted hover:text-fg hover:bg-fill-2'}`}
              >
                {on && <motion.span layoutId="settings-active" transition={spring.snappy} className="absolute inset-0 -z-0 rounded-xl bg-accent-soft border border-[color:var(--accent-line)]" />}
                <span className={`relative ${on ? 'text-accent-text' : ''}`}>{s.icon}</span>
                <span className="relative">{s.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-start gap-3 px-6 sm:px-8 pt-6 pb-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-[19px] font-semibold text-fg">{current.label}</h3>
              {current.desc && <p className="mt-1 text-[13px] text-muted">{current.desc}</p>}
            </div>
            <button onClick={onClose} aria-label="关闭设置" className="shrink-0 -mr-2 p-2 rounded-xl text-muted hover:text-fg hover:bg-fill-2 transition-colors"><X size={19} /></button>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8">
            {!settings ? null : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={section}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {section === 'appearance' && <AppearanceSettings value={settings.appearance} legacyWallpaper={settings.wallpaper} onChange={appearance => void update({ appearance })} />}
                  {section === 'ai' && <AISettings value={settings.ai} onSave={ai => update({ ai })} />}
                  {section === 'embed' && <EmbedSettings value={settings.embed} chat={settings.ai} onSave={embed => update({ embed })} />}
                  {section === 'smart' && <SmartSettings />}
                  {section === 'cloud' && <CloudSettings cloud={cloud} />}
                  {section === 'data' && <DataSettings />}
                  {section === 'classic' && (
                    <Group desc="经典视图按浏览器收藏夹的文件夹显示磁贴，适合习惯用文件夹的人。随时可以从左上角回到智能视图。">
                      <Row label="切换到经典视图" desc="标签、组合和 AI 功能在经典视图里不显示，但数据都会保留">
                        <Button size="sm" onClick={() => { onClassic?.(); onClose(); }} icon={<ArrowRight size={14} />}>切换</Button>
                      </Row>
                    </Group>
                  )}
                  {section === 'about' && (
                    <div className="flex flex-col gap-7">
                      <Group title="快捷键">
                        {SHORTCUTS.map(([keys, label]) => (
                          <Row key={label} label={label}>
                            <span className="flex items-center gap-1">
                              {keys.map(k => <kbd key={k} className="inline-flex items-center h-6 min-w-6 px-1.5 rounded-md border border-line-strong bg-fill-2 text-[12px] text-fg font-sans">{k}</kbd>)}
                            </span>
                          </Row>
                        ))}
                      </Group>
                      <Group title="关于">
                        <Row label="TTab" desc="智能书签新标签页：多标签、自动分组、AI 整理、可开发的小组件。所有数据保存在本机。">
                          <span className="text-[12.5px] text-faint">v{typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : 'dev'}</span>
                        </Row>
                      </Group>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default SettingsModal;
