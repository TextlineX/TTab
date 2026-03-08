import React, { useState, useEffect, useMemo } from 'react';
import { Folder, Globe } from 'lucide-react';
import { extractColorFromIcon } from '../../../utils/colorExtractor';
import { storage } from '../../../utils/storage';

const WINDOWS_ACCENTS = [
  '#0078D7', '#107C10', '#D13438', '#FFB900', '#038387', 
  '#486860', '#8764B8', '#00B7C3', '#B4009E', '#E67113'
];

// 三段式色彩引擎：极亮变深，极深变浅，中间保持不变
function getProcessedColors(rawColor: string) {
  let r, g, b;
  if (rawColor.startsWith('rgb')) {
    const rgb = rawColor.match(/\d+/g);
    if (!rgb) return { bg: '#004578', text: 'white' };
    [r, g, b] = rgb.map(Number);
  } else {
    const hex = rawColor.replace('#', '');
    r = parseInt(hex.substr(0, 2), 16);
    g = parseInt(hex.substr(2, 2), 16);
    b = parseInt(hex.substr(4, 2), 16);
  }

  // 计算原始亮度
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  
  let finalR = r, finalG = g, finalB = b;

  if (yiq > 200) {
    // 1. 极亮区间 -> 压深 70%
    finalR = Math.floor(r * 0.3 + 10);
    finalG = Math.floor(g * 0.3 + 10);
    finalB = Math.floor(b * 0.3 + 10);
  } else if (yiq < 60) {
    // 2. 极暗区间 -> 提亮 70%
    finalR = Math.min(255, Math.floor(r + (255 - r) * 0.7));
    finalG = Math.min(255, Math.floor(g + (255 - g) * 0.7));
    finalB = Math.min(255, Math.floor(b + (255 - b) * 0.7));
  } else {
    // 3. 中间区间 -> 保持原色，但稍微提高一点饱和度让它更 Metro
    // 此处不做大幅修改，保留原始色相
  }

  const finalBg = `rgb(${finalR}, ${finalG}, ${finalB})`;
  const finalYiq = (finalR * 299 + finalG * 587 + finalB * 114) / 1000;
  
  return { 
    bg: finalBg, 
    text: finalYiq >= 150 ? '#1a1a1a' : 'white' 
  };
}

interface TileItemProps {
  id: string;
  title: string;
  url?: string;
  icon?: string;
  size?: 'small' | 'medium' | 'wide' | 'large';
  onNavigate?: (id: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const TileItem: React.FC<TileItemProps> = ({ id, title, url, icon, size = 'medium', onNavigate, onContextMenu }) => {
  const hash = useMemo(() => id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0), [id]);
  const [rawThemeColor, setRawThemeColor] = useState<string>(WINDOWS_ACCENTS[hash % WINDOWS_ACCENTS.length]);
  const [iconError, setIconError] = useState(false);
  
  const isFolder = !url;
  const iconUrl = icon || (url ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=128` : '');

  useEffect(() => {
    if (isFolder) return;
    const loadColor = async () => {
      const cache = await storage.getColorCache();
      if (url && cache[url]) {
        const color = cache[url].replace('rgba', 'rgb').replace(', 0.3)', ')');
        setRawThemeColor(color);
        return;
      }
      try {
        const color = await extractColorFromIcon(iconUrl);
        setRawThemeColor(color);
      } catch (err) {}
    };
    loadColor();
  }, [url, iconUrl, isFolder]);

  // 应用三段式颜色逻辑
  const { bg, text } = useMemo(() => getProcessedColors(rawThemeColor), [rawThemeColor]);

  const initial = useMemo(() => title.trim().charAt(0).toUpperCase(), [title]);

  return (
    <div
      onContextMenu={onContextMenu}
      onClick={() => isFolder ? onNavigate?.(id) : window.open(url, '_blank')}
      className={`relative w-full h-full group cursor-pointer transition-all duration-100 select-none active:scale-[0.98] hover:outline hover:outline-4 hover:outline-white/40 hover:z-20`}
      style={{ backgroundColor: bg }}
    >
      <div className={`absolute inset-0 flex flex-col items-center justify-center p-3`}>
        <div className="flex-1 flex items-center justify-center transition-transform duration-500 group-hover:scale-110 w-full h-full">
          {isFolder ? (
            <Folder 
              style={{ color: text }} 
              className="opacity-90" 
              size={size === 'small' ? 28 : size === 'large' ? 96 : 52} 
              strokeWidth={1.2} 
            />
          ) : (
            <>
              {(!iconError && url) ? (
                <img 
                  src={iconUrl} 
                  alt="" 
                  onError={() => setIconError(true)}
                  className={`${size === 'small' ? 'w-8 h-8' : size === 'large' ? 'w-24 h-24' : 'w-14 h-14'} object-contain brightness-110 drop-shadow-lg`} 
                />
              ) : (
                <div 
                  style={{ color: text }}
                  className={`font-black opacity-30 select-none flex items-center justify-center ${
                    size === 'large' ? 'text-8xl' : 
                    size === 'wide' ? 'text-5xl' : 
                    size === 'medium' ? 'text-5xl' : 
                    'text-3xl'
                  }`}
                >
                  {initial || <Globe size={32} />}
                </div>
              )}
            </>
          )}
        </div>

        <div className="w-full mt-auto text-left">
          <span 
            style={{ color: text }}
            className={`font-bold uppercase block truncate tracking-tight leading-none ${
              size === 'large' ? 'text-2xl opacity-80' : 
              size === 'wide' ? 'text-[14px]' : 
              size === 'medium' ? 'text-[13px]' : 
              'text-[10px]'
            }`}
          >
            {title}
          </span>
        </div>
      </div>
      <div className={`absolute inset-0 ${text === 'white' ? 'bg-white/5' : 'bg-black/5'} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`} />
    </div>
  );
};

export default TileItem;
