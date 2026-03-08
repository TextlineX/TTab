import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
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
import { LayoutGrid, Hash, Search, Settings as SettingsIcon } from 'lucide-react';
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

  if (loading) return null;

  const toggleDisplayMode = async (mode: DisplayMode) => {
    setDisplayMode(mode);
    await storage.updateSettings({ displayMode: mode });
  };

  return (
    <div className="flex flex-col gap-12 w-full animate-in fade-in duration-300">
      
      <BackButton canGoBack={path.length > 1} onClick={navigateBack} />

      <div className="flex flex-col gap-6 w-full items-center">
        <div className="flex items-center gap-1 overflow-x-auto py-1 px-4 border-b border-white/5 no-scrollbar max-w-xl">
          {path.map((p, idx) => (
            <React.Fragment key={p.id}>
              {idx > 0 && <span className="text-white/10 px-1">›</span>}
              <button onClick={() => navigateTo(p.id)} className={`text-[10px] font-black uppercase tracking-[0.2em] py-1 px-2 transition-colors ${idx === path.length - 1 ? 'text-white border-b-2 border-white' : 'text-white/30 hover:text-white'}`}>
                {p.id === rootId ? t.root : p.title}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-6 w-full max-w-5xl px-4">
          <div className="relative group w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
            <input type="text" placeholder={t.search} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/5 border-none focus:bg-white/10 rounded-none py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-white/10 outline-none" />
          </div>

          <div className="flex items-center gap-0 bg-white/5 border border-white/5 p-0.5">
            <button onClick={() => toggleDisplayMode('tile')} className={`flex items-center gap-2 px-4 py-2 transition-all ${displayMode === 'tile' ? 'bg-white/20 text-white' : 'text-white/30 hover:text-white'}`}>
              <LayoutGrid size={14} />
              <span className="text-[10px] font-black tracking-widest uppercase">{t.start}</span>
            </button>
            <button onClick={() => toggleDisplayMode('tag')} className={`flex items-center gap-2 px-4 py-2 transition-all ${displayMode === 'tag' ? 'bg-white/20 text-white' : 'text-white/30 hover:text-white'}`}>
              <Hash size={14} />
              <span className="text-[10px] font-black tracking-widest uppercase">{t.cloud}</span>
            </button>
            <div className="w-[1px] h-4 bg-white/10 mx-2" />
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-white/30 hover:text-white">
              <SettingsIcon size={14} />
            </button>
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
                className="grid auto-rows-[60px] gap-1 grid-flow-dense w-full mx-auto"
              >
                {filteredItems.map((bm) => (
                  <SortableItem key={bm.id} id={bm.id} className={spanClasses[bm.size as keyof typeof spanClasses]}>
                    <TileItem id={bm.id} title={bm.title} url={bm.url} size={bm.size as any} onNavigate={navigateTo} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: bm.id, title: bm.title, isFolder: !bm.url }); }} />
                  </SortableItem>
                ))}
              </div>
            ) : (
              <div style={{ maxWidth: `${containerWidth}px` }} className="flex flex-wrap gap-4 justify-center items-center py-10 mx-auto">
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
