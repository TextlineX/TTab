import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Type, Check, X } from 'lucide-react';

interface RenameModalProps {
  isOpen: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (newName: string) => void;
}

const RenameModal: React.FC<RenameModalProps> = ({ isOpen, initialName, onClose, onSave }) => {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* 遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />

      {/* 对话框主体 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-6"
      >
        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
          <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400">
            <Type size={18} />
          </div>
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Rename Item</h2>
        </div>

        <div className="relative group">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSave(name)}
            className="w-full bg-white/5 border border-white/10 focus:border-purple-500/50 rounded-2xl py-3 px-4 text-white placeholder:text-white/20 outline-none transition-all focus:shadow-[0_0_20px_rgba(168,85,247,0.15)]"
            placeholder="Enter new name..."
          />
        </div>

        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white/60 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <X size={14} /> Cancel
          </button>
          <button
            onClick={() => onSave(name)}
            className="flex-1 py-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Check size={14} /> Save
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default RenameModal;
