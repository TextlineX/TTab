import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Edit2, Trash2, ExternalLink, Move } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  title: string;
  isFolder: boolean;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onOpen?: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, title, onClose, onRename, onDelete, onOpen }) => {
  const [menuPos, setMenuPos] = useState({ left: x, top: y });

  useEffect(() => {
    // 确保菜单不超出屏幕边界
    const menuWidth = 180;
    const menuHeight = 200;
    let finalX = x;
    let finalY = y;

    if (x + menuWidth > window.innerWidth) finalX = x - menuWidth;
    if (y + menuHeight > window.innerHeight) finalY = y - menuHeight;

    setMenuPos({ left: finalX, top: finalY });
  }, [x, y]);

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ left: menuPos.left, top: menuPos.top }}
        className="absolute w-[180px] bg-[#1a1a1a]/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-1.5 overflow-hidden flex flex-col gap-0.5"
      >
        <div className="px-3 py-2 border-b border-white/5 mb-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 truncate">
            {title}
          </p>
        </div>

        {onOpen && (
          <button onClick={onOpen} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-all group">
            <ExternalLink size={16} className="text-white/20 group-hover:text-blue-400" />
            <span className="text-xs font-medium">Open</span>
          </button>
        )}

        <button onClick={onRename} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-all group">
          <Edit2 size={16} className="text-white/20 group-hover:text-purple-400" />
          <span className="text-xs font-medium">Rename</span>
        </button>

        <button onClick={() => {}} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-all group">
          <Move size={16} className="text-white/20 group-hover:text-amber-400" />
          <span className="text-xs font-medium">Move To...</span>
        </button>

        <div className="h-[1px] bg-white/5 my-1" />

        <button onClick={onDelete} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-400/80 hover:text-red-400 transition-all group">
          <Trash2 size={16} className="text-red-400/30 group-hover:text-red-400" />
          <span className="text-xs font-medium font-bold">Delete</span>
        </button>
      </motion.div>
    </div>
  );
};

export default ContextMenu;
