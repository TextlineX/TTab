import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Folder, Check, X } from 'lucide-react';

interface FolderPickerProps {
  onClose: () => void;
  onSelect: (id: string, title: string) => void;
}

const FolderPicker: React.FC<FolderPickerProps> = ({ onClose, onSelect }) => {
  const [folders, setFolders] = useState<{id: string, title: string}[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.search({ query: '' }, (results) => {
        // 只筛选文件夹
        const onlyFolders = results.filter(node => !node.url).map(node => ({
          id: node.id,
          title: node.title || 'Root'
        }));
        setFolders(onlyFolders);
      });
    }
  }, []);

  const filtered = folders.filter(f => f.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-3xl flex flex-col h-[500px] overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-white font-bold uppercase tracking-widest text-xs">Pick Root Folder</h2>
          <button onClick={onClose}><X size={18} className="text-white/40" /></button>
        </div>
        
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
            <input 
              autoFocus
              type="text" 
              placeholder="Search folders..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm text-white outline-none focus:border-blue-500/30 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
          {filtered.map(folder => (
            <button
              key={folder.id}
              onClick={() => onSelect(folder.id, folder.title)}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-2xl transition-all text-left group"
            >
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 group-hover:bg-blue-500/20">
                <Folder size={16} />
              </div>
              <span className="text-sm text-white/80 font-medium">{folder.title}</span>
              <Check size={14} className="ml-auto text-blue-400 opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default FolderPicker;
