import React from 'react';
import { motion } from 'framer-motion';

interface TileStyleItemProps {
  title: string;
  url?: string;
  iconUrl: string;
  themeColor: string;
}

const TileStyleItem: React.FC<TileStyleItemProps> = ({ title, url, iconUrl, themeColor }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="relative aspect-square w-full rounded-none flex flex-col items-center justify-center p-6 cursor-pointer transition-all duration-300 group overflow-hidden border border-white/5 hover:border-white/20"
      style={{
        backgroundColor: themeColor.replace('0.3', '0.6'), // 使背景颜色更重些，符合磁贴质感
      }}
      onClick={() => url && window.open(url, '_blank')}
    >
      {/* 磁贴的高亮反光效果 */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* 磁贴的主图标 */}
      <div className="w-16 h-16 flex items-center justify-center bg-white/10 rounded-lg mb-4 shadow-sm group-hover:shadow-md transition-all">
        <img src={iconUrl} alt={title} className="w-10 h-10 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-500" />
      </div>

      {/* 标题 - 磁贴通常在底部显示大标题 */}
      <div className="w-full text-center mt-auto">
        <span className="text-white text-base font-bold tracking-wide drop-shadow-md truncate max-w-full block px-2">
          {title}
        </span>
      </div>
    </motion.div>
  );
};

export default TileStyleItem;
