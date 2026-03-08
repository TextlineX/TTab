import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Home } from 'lucide-react';

interface BackButtonProps {
  canGoBack: boolean;
  onClick: () => void;
}

const BackButton: React.FC<BackButtonProps> = ({ canGoBack, onClick }) => {
  return (
    <motion.button
      initial={{ x: -100 }}
      animate={{ x: 0 }}
      whileHover={canGoBack ? { x: 5, backgroundColor: 'rgba(255,255,255,0.1)' } : {}}
      onClick={canGoBack ? onClick : undefined}
      className={`fixed left-0 top-1/2 -translate-y-1/2 z-[60] w-12 h-32 flex items-center justify-center border-r border-y border-white/10 rounded-r-3xl transition-all ${
        canGoBack 
        ? 'bg-white/5 cursor-pointer text-white shadow-[10px_0_30px_rgba(0,0,0,0.3)]' 
        : 'bg-transparent cursor-default text-white/10 border-white/5'
      }`}
    >
      {canGoBack ? (
        <ChevronLeft size={24} className="animate-in fade-in zoom-in duration-300" />
      ) : (
        <Home size={20} className="animate-in fade-in zoom-in duration-300" />
      )}
    </motion.button>
  );
};

export default BackButton;
