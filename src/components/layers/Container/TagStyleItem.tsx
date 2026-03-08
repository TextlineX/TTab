import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Folder } from 'lucide-react';
import { extractColorFromIcon } from '../../../utils/colorExtractor';
import { storage } from '../../../utils/storage';

interface TagStyleItemProps {
  id: string;
  title: string;
  url?: string;
  iconUrl: string;
  themeColor?: string;
  showColor?: boolean;
  onNavigate?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const TagStyleItem: React.FC<TagStyleItemProps> = ({ id, title, url, iconUrl, themeColor: initialColor, showColor = true, onNavigate, onContextMenu }) => {
  const [themeColor, setThemeColor] = useState<string>(initialColor || '#0078D4');
  const isFolder = !url;

  useEffect(() => {
    if (isFolder) {
      setThemeColor('#004578');
      return;
    }
    if (!url || initialColor) return;

    const loadColor = async () => {
      const cache = await storage.getColorCache();
      if (cache[url]) {
        setThemeColor(cache[url].replace('rgba', 'rgb').replace(', 0.3)', ')'));
        return;
      }
      try {
        const color = await extractColorFromIcon(iconUrl);
        setThemeColor(color);
        await storage.setColorCache(url, color.replace('rgb', 'rgba').replace(')', ', 0.3)'));
      } catch (err) {
        setThemeColor('#0078D4');
      }
    };
    loadColor();
  }, [url, iconUrl, initialColor, isFolder]);

  const backgroundColor = showColor ? themeColor : 'rgba(255, 255, 255, 0.05)';
  const textColor = 'text-white';

  return (
    <motion.div
      whileHover={{ scale: 1.05, outline: '2px solid white' }}
      whileTap={{ scale: 0.95 }}
      className={`inline-flex items-center px-3 py-1.5 rounded-none border-none transition-all cursor-pointer group shadow-none`}
      style={{ backgroundColor }}
      onClick={() => isFolder ? onNavigate?.(id) : window.open(url, '_blank')}
      onContextMenu={onContextMenu}
    >
      <div className="w-4 h-4 flex items-center justify-center mr-2 bg-white/10 p-0.5">
        {isFolder ? (
          <Folder size={12} className="text-white/80" />
        ) : (
          <img src={iconUrl} alt="" className="w-3 h-3 object-contain brightness-110" />
        )}
      </div>
      <span className={`text-[10px] font-bold tracking-tight uppercase ${textColor} whitespace-nowrap`}>
        {title}
      </span>
    </motion.div>
  );
};

export default TagStyleItem;
