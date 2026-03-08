import { useEffect } from 'react';
import BackgroundLayer from './components/layers/Background/BackgroundLayer';
import EffectLayer from './components/layers/Effect/EffectLayer';
import ContainerLayer from './components/layers/Container/ContainerLayer';
import BookmarkList from './components/layers/Container/BookmarkList';
import { storage } from './utils/storage';

function App() {
  const applyFont = async () => {
    const settings = await storage.getSettings();
    const useDefault = settings.useCustomFont !== false;
    
    // 强制操作 DOM 确保最高优先级
    if (useDefault) {
      document.body.classList.add('font-custom');
      document.body.classList.remove('font-system');
    } else {
      document.body.classList.add('font-system');
      document.body.classList.remove('font-custom');
    }
  };

  useEffect(() => {
    applyFont();
    window.addEventListener('settings_updated', applyFont);
    return () => window.removeEventListener('settings_updated', applyFont);
  }, []);

  return (
    <main className="relative min-h-screen w-full">
      <BackgroundLayer />
      <EffectLayer />
      <ContainerLayer>
        <section className="mt-8">
          <BookmarkList />
        </section>
      </ContainerLayer>
    </main>
  );
}

export default App;
