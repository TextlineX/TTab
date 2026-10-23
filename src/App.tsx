import { useEffect } from 'react';
import BackgroundLayer from './components/layers/Background/BackgroundLayer';
import EffectLayer from './components/layers/Effect/EffectLayer';
import ContainerLayer from './components/layers/Container/ContainerLayer';
import BookmarkList from './components/layers/Container/BookmarkList';
import SmartHome from './components/smart/SmartHome';
import { useSettings } from './state/useSettings';

function App() {
  const { settings, update } = useSettings();

  useEffect(() => {
    if (!settings) return;
    // 强制操作 DOM 确保最高优先级
    const useCustom = settings.useCustomFont !== false;
    document.body.classList.toggle('font-custom', useCustom);
    document.body.classList.toggle('font-system', !useCustom);
  }, [settings]);

  if (!settings) return null;
  const view = settings.homeView || 'smart';

  return (
    <main className="relative min-h-screen w-full">
      <BackgroundLayer />
      <EffectLayer />

      {/* 视图切换：智能视图 / 原来的文件夹磁贴视图 */}
      <div className="fixed top-4 left-4 z-40 flex p-1 rounded-full bg-black/30 border border-white/10 backdrop-blur-xl text-[12px]" role="tablist" aria-label="首页视图">
        {([['smart', '智能'], ['folder', '文件夹']] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => update({ homeView: id })}
            className={`px-3 h-7 rounded-full transition-colors ${view === id ? 'bg-white/90 text-black' : 'text-white/60 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'smart' ? (
        <div className="relative z-0 min-h-screen w-full">
          <SmartHome />
        </div>
      ) : (
        <ContainerLayer>
          <section className="mt-8">
            <BookmarkList />
          </section>
        </ContainerLayer>
      )}
    </main>
  );
}

export default App;
