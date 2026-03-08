import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Folder } from 'lucide-react';
import { extractColorFromIcon } from '../../../utils/colorExtractor';
import { storage } from '../../../utils/storage';

interface TagItemProps {
  id: string;
  title: string;
  url?: string;
  iconUrl: string;
  themeColor?: string;
  showColor?: boolean;
  pureTextMode?: boolean;
  weight?: number;
  maxFontSize?: number;
  allowRotation?: boolean;
  onNavigate?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

// 预设的高级随机色池，用于文件夹
const FOLDER_PALETTE = [
  'rgba(59, 130, 246, 0.3)', // blue
  'rgba(139, 92, 246, 0.3)', // purple
  'rgba(236, 72, 153, 0.3)', // pink
  'rgba(20, 184, 166, 0.3)', // teal
  'rgba(245, 158, 11, 0.3)',  // amber
];

const TagItem: React.FC<TagItemProps> = ({ 
  id, title, url, iconUrl, themeColor: initialColor, 
  showColor = true, pureTextMode = false, weight = 0.5,
  maxFontSize = 32, allowRotation = true,
  onNavigate, onContextMenu 
}) => {
  // 文件夹采用随机预设色，书签采用提取色
  const randomFolderColor = useMemo(() => FOLDER_PALETTE[Math.abs(id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % FOLDER_PALETTE.length], [id]);
  
  const [themeColor, setThemeColor] = useState<string>(initialColor || (url ? 'rgba(255, 255, 255, 0.05)' : randomFolderColor));
  const isFolder = !url;

  useEffect(() => {
    if (isFolder || initialColor) return;
    const loadColor = async () => {
      const cache = await storage.getColorCache();
      if (url && cache[url]) {
        setThemeColor(cache[url]);
        return;
      }
      try {
        const color = await extractColorFromIcon(iconUrl);
        const finalColor = color.replace('rgb', 'rgba').replace(')', ', 0.3)');
        setThemeColor(finalColor);
        if (url) await storage.setColorCache(url, finalColor);
      } catch (err) {}
    };
    loadColor();
  }, [url, iconUrl, initialColor, isFolder]);

  const fontSize = useMemo(() => 12 + Math.floor(weight * (maxFontSize - 12)), [weight, maxFontSize]);
  const [randomRotation] = useState(Math.random() * 6 - 3); 
  const rotation = allowRotation ? randomRotation : 0;

  const backgroundColor = pureTextMode ? 'transparent' : (showColor ? themeColor : 'rgba(255, 255, 255, 0.03)');
  const borderColor = pureTextMode ? 'transparent' : (showColor ? themeColor.replace('0.3', '0.4') : 'rgba(255, 255, 255, 0.1)');
  
  const textColor = pureTextMode 
    ? (showColor ? themeColor.replace('0.3', '1').replace('rgba', 'rgb').split(',').slice(0, 3).join(',') + ')' : 'white')
    : 'white';

  return (
    <motion.div
      whileHover={{ scale: 1.1, zIndex: 50, filter: 'brightness(1.2)' }}
      whileTap={{ scale: 0.95 }}
      style={{ 
        backgroundColor, 
        borderColor, 
        rotate: `${rotation}deg`,
        fontSize: `${fontSize}px`
      }}
      className={`inline-flex items-center transition-all cursor-pointer group flex-shrink-0 ${pureTextMode ? 'px-2' : 'px-5 py-2.5 rounded-full border backdrop-blur-md shadow-xl'}`}
      onClick={() => isFolder ? onNavigate?.(id) : window.open(url, '_blank')}
      onContextMenu={onContextMenu}
    >
      {!pureTextMode && (
        <div className="flex items-center justify-center mr-3 bg-white/10 rounded-full p-0.5 overflow-hidden flex-shrink-0" style={{ width: `${fontSize*0.8}px`, height: `${fontSize*0.8}px` }}>
          {isFolder ? <Folder className="text-blue-400/60" size={fontSize*0.5} /> : <img src={iconUrl} alt="" className="w-full h-full object-contain" />}
        </div>
      )}
      <span style={{ color: textColor }} className="font-black tracking-tighter whitespace-nowrap drop-shadow-sm">{title}</span>
    </motion.div>
  );
};

export default TagItem;
