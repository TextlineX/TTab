import React, { useEffect, useState } from 'react';
import { storage } from '../../../utils/storage';

const BackgroundLayer: React.FC = () => {
  const [wallpaper, setWallpaper] = useState('');

  const loadSettings = async () => {
    const settings = await storage.getSettings();
    setWallpaper(settings.wallpaper || '');
  };

  useEffect(() => {
    loadSettings();
    window.addEventListener('settings_updated', loadSettings);
    return () => window.removeEventListener('settings_updated', loadSettings);
  }, []);

  return (
    <div className="fixed inset-0 -z-50 bg-[#0a0a0a] overflow-hidden">
      {wallpaper ? (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
          style={{ 
            backgroundImage: `url(${wallpaper})`, 
            opacity: 1 // 提高透明度到 1，确保清晰可见
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-black to-black transition-all duration-1000" />
      )}
      {/* 遮罩层，防止背景干扰内容 */}
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
};

export default BackgroundLayer;
