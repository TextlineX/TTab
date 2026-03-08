import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Folder } from 'lucide-react';
import { extractColorFromIcon } from '../../../utils/colorExtractor';
import { storage } from '../../../utils/storage';

interface BookmarkItemProps {
  id: string;
  title: string;
  url?: string;
  icon?: string;
  size?: 'small' | 'wide' | 'large' | 'tall';
  onNavigate?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const BookmarkItem: React.FC<BookmarkItemProps> = ({ id, title, url, icon, size = 'small', onNavigate, onContextMenu }) => {
  const [themeColor, setThemeColor] = useState<string>('#0078D4');
  const isFolder = !url;
  
  const iconUrl = icon || (url ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=128` : '');

  useEffect(() => {
    if (isFolder) {
      setThemeColor('#004578');
      return;
    }

    const loadColor = async () => {
      const cache = await storage.getColorCache();
      if (url && cache[url]) {
        setThemeColor(cache[url].replace('rgba', 'rgb').replace(', 0.3)', ')'));
        return;
      }
      try {
        const color = await extractColorFromIcon(iconUrl);
        setThemeColor(color);
        if (url) await storage.setColorCache(url, color.replace('rgb', 'rgba').replace(')', ', 0.3)'));
      } catch (err) {
        setThemeColor('#0078D4');
      }
    };
    loadColor();
  }, [url, iconUrl, isFolder]);

  // 严格的网格跨度定义，去掉所有干扰对齐的 aspect 属性
  const spanClasses = {
    small: 'col-span-1 row-span-1',
    wide: 'col-span-2 row-span-1',
    tall: 'col-span-1 row-span-2',
    large: 'col-span-2 row-span-2',
  };

  return (
    <motion.div
      whileHover={{ scale: 0.98, outline: '3px solid rgba(255,255,255,0.6)', zIndex: 10 }}
      whileTap={{ scale: 0.95 }}
      className={`relative group transition-all duration-200 cursor-pointer overflow-hidden flex flex-col w-full h-full ${spanClasses[size]}`}
      style={{ backgroundColor: themeColor }}
      onClick={() => isFolder ? onNavigate?.(id) : window.open(url, '_blank')}
      onContextMenu={onContextMenu}
    >
      {/* 动态内容布局 */}
      <div className={`flex-1 flex p-3 ${size === 'wide' ? 'flex-row items-center gap-4' : 'flex-col items-center justify-center'}`}>
        
        {/* 图标区域 - 自适应缩放 */}
        <div className={`flex items-center justify-center transition-transform duration-500 group-hover:scale-110 shrink-0`}>
          {isFolder ? (
            <Folder className="text-white/90" size={size === 'small' ? 24 : 40} strokeWidth={1} />
          ) : (
            <img 
              src={iconUrl} 
              alt="" 
              className={`${size === 'small' ? 'w-8 h-8' : size === 'large' ? 'w-16 h-16' : 'w-10 h-10'} object-contain brightness-110`} 
            />
          )}
        </div>
        
        {/* 文字区域 - 仅在非 small 尺寸下增强显示 */}
        {size !== 'small' && (
          <div className={`${size === 'wide' ? 'flex-1 text-left' : 'text-center mt-2'}`}>
            <span className={`text-white font-bold leading-tight uppercase block truncate ${size === 'large' ? 'text-lg' : 'text-xs'}`}>
              {title}
            </span>
          </div>
        )}
      </div>

      {/* 标题（统一左下角标签） - 即使是 Small 模式也要在底部显示精简标题 */}
      {size === 'small' && (
        <div className="absolute bottom-1.5 left-2 right-2">
          <span className="text-white text-[9px] font-bold uppercase truncate block opacity-80">
            {title}
          </span>
        </div>
      )}

      {/* 文件夹小角标 */}
      {isFolder && <div className="absolute top-2 right-2 w-1 h-1 bg-white/40" />}
    </motion.div>
  );
};

export default BookmarkItem;
