import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, X, ChevronRight, ChevronLeft, CornerDownRight } from 'lucide-react';

interface FolderPickerProps {
  onClose: () => void;
  onSelect: (id: string, title: string) => void;
}

interface NavNode {
  id: string;
  title: string;
}

const FolderPicker: React.FC<FolderPickerProps> = ({ onClose, onSelect }) => {
  const [currentFolder, setCurrentFolder] = useState<NavNode>({ id: '0', title: 'Root' });
  const [subFolders, setSubFolders] = useState<NavNode[]>([]);
  const [navPath, setNavPath] = useState<NavNode[]>([{ id: '0', title: 'Root' }]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false); // 控制“是/否”确认界面的显示

  const loadSubFolders = (id: string) => {
    setLoading(true);
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.getChildren(id, (children) => {
        const folders = children
          .filter(n => !n.url)
          .map(n => ({ id: n.id, title: n.title || 'Unnamed Folder' }));
        setSubFolders(folders);
        setLoading(false);
      });
    } else {
      // Mock Data
      setTimeout(() => {
        setSubFolders([
          { id: id + '1', title: 'Sub Folder A' },
          { id: id + '2', title: 'Sub Folder B' }
        ]);
        setLoading(false);
      }, 300);
    }
  };

  useEffect(() => {
    loadSubFolders(currentFolder.id);
  }, [currentFolder]);

  const enterFolder = (f: NavNode) => {
    setNavPath([...navPath, f]);
    setCurrentFolder(f);
    setConfirming(false); // 进入新文件夹时重置确认状态
  };

  const goBack = () => {
    if (navPath.length <= 1) return;
    const newPath = navPath.slice(0, -1);
    const parent = newPath[newPath.length - 1];
    setNavPath(newPath);
    setCurrentFolder(parent);
    setConfirming(false);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      
      <motion.div 
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-md bg-[#0f0f0f] border border-white/10 rounded-[2rem] flex flex-col h-[550px] overflow-hidden shadow-2xl"
      >
        {/* Header: 弹窗内地址栏 */}
        <div className="p-6 border-b border-white/5 bg-white/5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white/40 font-black uppercase tracking-[0.2em] text-[10px]">Folder Explorer</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all text-white/20"><X size={18} /></button>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {navPath.map((p, idx) => (
              <React.Fragment key={p.id}>
                {idx > 0 && <ChevronRight size={12} className="text-white/10 shrink-0" />}
                <span className={`text-xs font-bold whitespace-nowrap ${idx === navPath.length - 1 ? 'text-blue-400' : 'text-white/40'}`}>
                  {p.title}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {navPath.length > 1 && (
            <button onClick={goBack} className="w-full flex items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-all text-left text-white/40 group">
              <div className="p-2 bg-white/5 rounded-xl group-hover:bg-white/10 transition-all"><ChevronLeft size={18} /></div>
              <span className="text-sm font-bold">Go Back</span>
            </button>
          )}

          <div className="flex flex-col gap-1 mt-2">
            {subFolders.map(f => (
              <button
                key={f.id}
                onClick={() => enterFolder(f)}
                className="w-full flex items-center gap-4 p-4 hover:bg-blue-500/10 rounded-2xl transition-all text-left group"
              >
                <div className="p-2 bg-white/5 rounded-xl text-blue-400/60 group-hover:text-blue-400 group-hover:bg-blue-500/20 transition-all">
                  <Folder size={20} />
                </div>
                <span className="text-sm text-white/80 font-bold group-hover:text-white">{f.title}</span>
                <ChevronRight size={16} className="ml-auto text-white/5 group-hover:text-white/20" />
              </button>
            ))}
            {!loading && subFolders.length === 0 && (
              <div className="py-10 flex flex-col items-center justify-center text-white/10 gap-2">
                <Folder size={48} strokeWidth={1} />
                <span className="text-xs font-bold uppercase tracking-widest">No Subfolders</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer: 确认操作区 (是/否 逻辑) */}
        <div className="p-6 bg-white/5 border-t border-white/5">
          <AnimatePresence mode="wait">
            {!confirming ? (
              <motion.button
                key="select-trigger"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                onClick={() => setConfirming(true)}
                disabled={currentFolder.id === 'root'}
                className="w-full py-4 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-2xl font-black uppercase tracking-widest text-xs transition-all border border-blue-500/20"
              >
                Set "{currentFolder.title}" as Root
              </motion.button>
            ) : (
              <motion.div 
                key="confirmation"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col gap-4"
              >
                <div className="flex items-center gap-3 text-emerald-400 px-2">
                  <CornerDownRight size={16} />
                  <span className="text-xs font-bold uppercase">Confirm this selection?</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setConfirming(false)}
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/40 rounded-2xl font-black uppercase tracking-widest text-xs transition-all"
                  >
                    No / Cancel
                  </button>
                  <button 
                    onClick={() => onSelect(currentFolder.id, currentFolder.title)}
                    className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-[1.02]"
                  >
                    Yes / Confirm
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default FolderPicker;
