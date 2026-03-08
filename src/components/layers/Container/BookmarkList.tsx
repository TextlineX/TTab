import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';

import { useBookmarks } from '../../../hooks/useBookmarks';
import TileItem from './TileItem';
import TagItem from './TagItem';
import ContextMenu from './ContextMenu';
import SettingsPanel from './SettingsPanel'; 
import RenameModal from './RenameModal'; 
import BackButton from './BackButton';
import { SortableItem } from './SortableItem';
import { LayoutGrid, Hash, Search, Settings as SettingsIcon, ChevronRight } from 'lucide-react';
import { storage } from '../../../utils/storage';
import { getTranslation } from '../../../utils/i18n';

type DisplayMode = 'tag' | 'tile';

const BookmarkList: React.FC = () => {
  const { bookmarks, setBookmarks, loading, navigateTo, navigateBack, path, rootId } = useBookmarks();
  const [displayMode, setDisplayMode] = useState<DisplayMode>('tile');
  const [tagColorMode, setTagColorMode] = useState(true);
  const [pureTextMode, setPureTextMode] = useState(false);
  const [tagRotation, setTagRotation] = useState(true);
  const [tagMaxSize, setTagMaxSize] = useState(32);
  const [gridColumns, setGridColumns] = useState(10);
  const [containerWidth, setContainerWidth] = useState(960);
  const [lang, setLanguage] = useState('auto');
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string; title: string; isFolder: boolean } | null>(null);
  const [renameData, setRenameData] = useState<{ isOpen: boolean; id: string; title: string }>({ isOpen: false, id: '', title: '' });

  const refresh = React.useCallback(() => {
    storage.getSettings().then(s => {
      setDisplayMode(s.displayMode || 'tile');
      setTagColorMode(s.tagColorMode !== false);
      setPureTextMode(s.pureTextMode === true);
      setTagRotation(s.tagRotation !== false);
      setTagMaxSize(s.tagMaxSize || 32);
      setGridColumns(s.gridColumns || 10);
      setContainerWidth(s.containerWidth || 960);
      setLanguage(s.language || 'auto');
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const t = getTranslation(lang);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const enrichedItems = useMemo(() => {
    return bookmarks.map((b, idx) => {
      let size: 'small' | 'medium' | 'wide' | 'large' = 'medium';
      if (!b.url) { 
        size = idx % 4 === 0 ? 'wide' : (idx % 7 === 0 ? 'large' : 'medium');
      } else { 
        if (idx % 13 === 0) size = 'large';
        else if (idx % 5 === 0) size = 'wide';
        else if (idx % 3 === 0) size = 'medium';
        else size = 'small';
      }
      const weight = !b.url ? 0.7 + (idx % 3) * 0.1 : Math.random();
      return { ...b, size, weight };
    });
  }, [bookmarks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = bookmarks.findIndex((b) => b.id === active.id);
      const newIndex = bookmarks.findIndex((b) => b.id === over.id);
      const newOrder = arrayMove(bookmarks, oldIndex, newIndex);
      setBookmarks(newOrder);
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        chrome.bookmarks.move(active.id as string, { parentId: path[path.length-1]?.id, index: newIndex });
      }
    }
  };

  const handleRenameSave = (newName: string) => {
    if (!newName.trim()) return;
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.update(renameData.id, { title: newName }, (updatedNode) => {
        setBookmarks((prev) => prev.map((b) => b.id === renameData.id ? { ...b, title: updatedNode.title } : b));
      });
    } else {
      setBookmarks((prev) => prev.map((b) => b.id === renameData.id ? { ...b, title: newName } : b));
    }
    setRenameData({ isOpen: false, id: '', title: '' });
  };

  const filteredItems = enrichedItems.filter((b) => b.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const spanClasses = {
    small: 'col-span-1 row-span-1',
    medium: 'col-span-2 row-span-2',
    wide: 'col-span-4 row-span-2',
    large: 'col-span-4 row-span-4',
  };

  const toggleDisplayMode = async (mode: DisplayMode) => {
    setDisplayMode(mode);
    await storage.updateSettings({ displayMode: mode });
  };

  if (loading) return null;

  return (
    <div className="flex flex-col gap-12 w-full animate-in fade-in duration-700">
      
      <BackButton canGoBack={path.length > 1} onClick={navigateBack} />

      {/* 现代化的控制面板入口 */}
      <div className="flex flex-col gap-8 w-full items-center">
        
        {/* 1. 圆润的面包屑导航 */}
        <div className="flex items-center gap-1.5 p-1.5 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl max-w-2xl overflow-hidden px-4">
          {path.map((p, idx) => (
            <React.Fragment key={p.id}>
              {idx > 0 && <ChevronRight size={14} className="text-white/20 shrink-0" />}
              <motion.button 
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigateTo(p.id)} 
                className={`text-[11px] font-bold uppercase tracking-wider py-2 px-4 rounded-full transition-all whitespace-nowrap ${
                  idx === path.length - 1 
                  ? 'text-white bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                  : 'text-white/40 hover:text-white'
                }`}
              >
                {p.id === rootId ? t.root : p.title}
              </motion.button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-6 w-full max-w-5xl px-4">
          
          {/* 2. 圆润的搜索框 */}
          <div className="relative group w-full max-w-md">
            <div className="absolute inset-0 bg-blue-500/5 rounded-full blur-xl group-focus-within:bg-blue-500/10 transition-all opacity-0 group-focus-within:opacity-100" />
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-400 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder={t.search} 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="relative w-full bg-white/5 backdrop-blur-xl border border-white/10 focus:border-blue-500/30 rounded-full py-3.5 pl-14 pr-6 text-sm text-white placeholder:text-white/20 outline-none transition-all shadow-inner" 
            />
          </div>

          {/* 3. 现代化的切换开关 */}
          <div className="flex items-center gap-1.5 bg-white/5 backdrop-blur-xl border border-white/10 p-1.5 rounded-full shadow-xl">
            <button 
              onClick={() => toggleDisplayMode('tile')} 
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 ${
                displayMode === 'tile' 
                ? 'bg-white text-black shadow-lg' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <LayoutGrid size={16} strokeWidth={displayMode === 'tile' ? 2.5 : 2} />
              <span className="text-[11px] font-black tracking-widest uppercase">{t.start}</span>
            </button>
            <button 
              onClick={() => toggleDisplayMode('tag')} 
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 ${
                displayMode === 'tag' 
                ? 'bg-white text-black shadow-lg' 
                : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <Hash size={16} strokeWidth={displayMode === 'tag' ? 2.5 : 2} />
              <span className="text-[11px] font-black tracking-widest uppercase">{t.cloud}</span>
            </button>
            
            <div className="w-[1px] h-6 bg-white/10 mx-2" />
            
            <motion.button 
              whileHover={{ rotate: 45 }}
              onClick={() => setIsSettingsOpen(true)} 
              className="p-2.5 text-white/30 hover:text-blue-400 transition-colors"
            >
              <SettingsIcon size={18} />
            </motion.button>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToWindowEdges]} onDragEnd={handleDragEnd}>
        <div className="w-full flex justify-center px-4">
          <SortableContext items={filteredItems.map(b => b.id)} strategy={rectSortingStrategy}>
            {displayMode === 'tile' ? (
              <div 
                style={{ 
                  gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                  maxWidth: `${containerWidth}px` 
                }}
                className="grid auto-rows-[60px] gap-1.5 grid-flow-dense w-full mx-auto"
              >
                {filteredItems.map((bm) => (
                  <SortableItem key={bm.id} id={bm.id} className={spanClasses[bm.size as keyof typeof spanClasses]}>
                    <TileItem id={bm.id} title={bm.title} url={bm.url} size={bm.size as any} onNavigate={navigateTo} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: bm.id, title: bm.title, isFolder: !bm.url }); }} />
                  </SortableItem>
                ))}
              </div>
            ) : (
              <div style={{ maxWidth: `${containerWidth}px` }} className="flex flex-wrap gap-6 justify-center items-center py-10 mx-auto">
                {filteredItems.map((bm) => (
                  <SortableItem key={bm.id} id={bm.id}>
                    <TagItem 
                      id={bm.id} title={bm.title} url={bm.url} 
                      iconUrl={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(bm.url || '')}&size=128`} 
                      themeColor={bm.color} showColor={tagColorMode} pureTextMode={pureTextMode} weight={bm.weight}
                      maxFontSize={tagMaxSize} allowRotation={tagRotation}
                      onNavigate={navigateTo} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: bm.id, title: bm.title, isFolder: !bm.url }); }}
                    />
                  </SortableItem>
                ))}
              </div>
            )}
          </SortableContext>
        </div>
      </DndContext>

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} onRename={() => { setRenameData({ isOpen: true, id: contextMenu.id, title: contextMenu.title }); setContextMenu(null); }} onDelete={() => { if(confirm('Delete?')) chrome.bookmarks.removeTree(contextMenu.id, () => setBookmarks(prev => prev.filter(b => b.id !== contextMenu.id))); setContextMenu(null); }} onOpen={() => contextMenu.isFolder ? navigateTo(contextMenu.id) : null} />
        )}
        {renameData.isOpen && <RenameModal isOpen={renameData.isOpen} initialName={renameData.title} onClose={() => setRenameData({ isOpen: false, id: '', title: '' })} onSave={handleRenameSave} />}
        {isSettingsOpen && <SettingsPanel currentPath={path[path.length - 1] || { id: '0', title: 'ROOT' }} onClose={() => setIsSettingsOpen(false)} onRefresh={refresh} />}
      </AnimatePresence>
    </div>
  );
};

export default BookmarkList;
