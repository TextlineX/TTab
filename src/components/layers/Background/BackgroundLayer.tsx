import React, { useEffect, useState } from 'react';
import type { AppliedTheme } from '../../../theme/useTheme';

/**
 * 背景：
 * - 极光：由强调色生成的三团柔和光晕，缓慢漂移（减少动态效果时静止）
 * - 纯色：主题底色 + 顶部一点强调色光
 * - 图片 / 必应每日：可调模糊和遮罩，遮罩颜色跟随明暗
 */
const BackgroundLayer: React.FC<{ applied: AppliedTheme }> = ({ applied }) => {
  const { theme, scheme, imageUrl } = applied;
  const bg = theme.background;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  // 图片加载完再淡入，避免闪烁
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => setLoadedUrl(imageUrl);
    img.src = imageUrl;
  }, [imageUrl]);

  const showImage = (bg.type === 'image' || bg.type === 'bing') && imageUrl;
  const scrim = scheme === 'dark' ? `rgb(6 8 12 / ${bg.dim})` : `rgb(250 250 252 / ${bg.dim})`;

  return (
    <div className="fixed inset-0 -z-50 overflow-hidden bg-[color:var(--bg)] transition-colors duration-500" aria-hidden>
      {showImage ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
            style={{
              backgroundImage: loadedUrl ? `url("${loadedUrl}")` : undefined,
              opacity: loadedUrl === imageUrl ? 1 : 0,
              filter: bg.blur ? `blur(${bg.blur}px)` : undefined,
              transform: bg.blur ? 'scale(1.08)' : undefined,
            }}
          />
          <div className="absolute inset-0 transition-colors duration-500" style={{ background: scrim }} />
        </>
      ) : bg.type === 'solid' ? (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 60% at 50% -10%, var(--accent-soft), transparent 60%)' }} />
      ) : (
        <div className={`tt-aurora absolute inset-0 ${scheme === 'light' ? 'tt-aurora-light' : ''}`}>
          <span className="tt-aurora-blob tt-aurora-a" />
          <span className="tt-aurora-blob tt-aurora-b" />
          <span className="tt-aurora-blob tt-aurora-c" />
        </div>
      )}
      {/* 细微的颗粒感，让大面积渐变不显得廉价 */}
      <div className="tt-grain absolute inset-0" />
    </div>
  );
};

export default BackgroundLayer;
