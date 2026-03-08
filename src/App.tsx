import BackgroundLayer from './components/layers/Background/BackgroundLayer';
import EffectLayer from './components/layers/Effect/EffectLayer';
import ContainerLayer from './components/layers/Container/ContainerLayer';
import BookmarkList from './components/layers/Container/BookmarkList';

function App() {
  return (
    <main className="relative min-h-screen w-full">
      {/* 1. 背景层 (最底层) */}
      <BackgroundLayer />
      
      {/* 2. 背景特效层 */}
      <EffectLayer />
      
      {/* 3. 容器层 (顶层) */}
      <ContainerLayer>
        {/* 书签列表区域 */}
        <section className="mt-8">
          <BookmarkList />
        </section>
      </ContainerLayer>
    </main>
  );
}

export default App;
