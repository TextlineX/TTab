import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { storage } from '../../../utils/storage';

const EffectLayer: React.FC = () => {
  const [showEffect, setShowEffect] = useState(true);

  const loadSettings = async () => {
    const settings = await storage.getSettings();
    // 默认开启，如果明确设置为 false 才关闭
    setShowEffect(settings.showEffect !== false);
  };

  useEffect(() => {
    loadSettings();
    window.addEventListener('settings_updated', loadSettings);
    return () => window.removeEventListener('settings_updated', loadSettings);
  }, []);

  return (
    <div className="fixed inset-0 -z-20 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {showEffect && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
          >
            <motion.div 
              className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[100px]"
              animate={{ x: [0, 100, 0], y: [0, 50, 0] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            />
            <motion.div 
              className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[100px]"
              animate={{ x: [0, -50, 0], y: [0, -100, 0] }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EffectLayer;
