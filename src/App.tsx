import { useMemo } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import BackgroundLayer from './components/layers/Background/BackgroundLayer';
import ContainerLayer from './components/layers/Container/ContainerLayer';
import BookmarkList from './components/layers/Container/BookmarkList';
import SmartHome from './components/smart/SmartHome';
import { useSettings } from './state/useSettings';
import { useTheme } from './theme/useTheme';
import { spring } from './ui/motion';

function App() {
  const { settings, update } = useSettings();
  // 主题在设置读取前就以默认值生效，避免首帧闪烁
  const view = settings?.homeView || 'smart';
  // 经典磁贴视图是按深色设计的，固定用深色；强调色和背景照常生效
  const appearance = useMemo(
    () => (view === 'folder' ? { ...(settings?.appearance || {}), mode: 'dark' as const } : settings?.appearance),
    [view, settings?.appearance],
  );
  const applied = useTheme(appearance, settings?.wallpaper);

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-screen w-full">
        <BackgroundLayer applied={applied} />
        {!settings ? null : view === 'smart' ? (
          <div className="relative z-0 min-h-screen w-full">
            <SmartHome onClassic={() => void update({ homeView: 'folder' })} />
          </div>
        ) : (
          <>
            <motion.button
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}
              onClick={() => void update({ homeView: 'smart' })}
              className="tt-glass fixed top-4 left-4 z-40 flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] text-fg hover:bg-fill-2 transition-colors"
            >
              <Sparkles size={14} className="text-accent-text" /> 回到智能视图
            </motion.button>
            <ContainerLayer>
              <section className="mt-8">
                <BookmarkList />
              </section>
            </ContainerLayer>
          </>
        )}
      </main>
    </MotionConfig>
  );
}

export default App;
