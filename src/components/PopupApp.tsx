import React, { useState, useEffect } from 'react';
import { Bookmark, Check, ChevronRight } from 'lucide-react';
import { storage } from '../utils/storage';

const PopupApp: React.FC = () => {
  const [title, setTitle] = useState('Loading...');
  const [url, setUrl] = useState('');
  const [folders, setFolders] = useState<{id: string, title: string}[]>([]);
  const [selectedFolder, setSelectedFolder] = useState({ id: '1', title: 'Bookmarks Bar' });
  const [isSaved, setIsSaved] = useState(false);

  const applyFont = async () => {
    const settings = await storage.getSettings();
    if (settings.useCustomFont !== false) {
      document.body.classList.add('font-custom');
      document.body.classList.remove('font-system');
    } else {
      document.body.classList.add('font-system');
      document.body.classList.remove('font-custom');
    }
  };

  useEffect(() => {
    applyFont();

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          setTitle(tabs[0].title || '');
          setUrl(tabs[0].url || '');
        }
      });

      chrome.bookmarks.getTree((nodes) => {
        const all: {id: string, title: string}[] = [];
        const walk = (list: chrome.bookmarks.BookmarkTreeNode[]) => {
          list.forEach(n => {
            if (!n.url) {
              all.push({ id: n.id, title: n.title || 'Folder' });
              if (n.children) walk(n.children);
            }
          });
        };
        if (nodes && nodes[0]) walk(nodes[0].children || []);
        setFolders(all.filter(f => f.id !== '0').slice(0, 10));
      });
    }

    storage.getSettings().then(s => {
      if (s.defaultFolderId) {
        setSelectedFolder(prev => ({ ...prev, id: s.defaultFolderId }));
      }
    });
  }, []);

  const handleSave = () => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      chrome.bookmarks.create({
        parentId: selectedFolder.id,
        title: title,
        url: url
      }, () => {
        setIsSaved(true);
        setTimeout(() => window.close(), 1200);
      });
    }
  };

  return (
    <div 
      style={{ width: '350px', height: '450px' }} 
      className={`bg-[#0a0a0a] text-white flex flex-col overflow-hidden border border-white/10`}
    >
      {isSaved ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-emerald-500 flex items-center justify-center">
            <Check size={40} className="text-white" strokeWidth={3} />
          </div>
          <p className="text-white font-black uppercase tracking-widest text-sm text-center px-4">Saved Successfully</p>
        </div>
      ) : (
        <>
          <div className="p-4 bg-[#0078D4] flex items-center gap-3 shrink-0">
            <Bookmark className="text-white" size={20} />
            <h1 className="text-white font-black uppercase tracking-tighter text-sm">Quick Add</h1>
          </div>

          <div className="p-5 flex flex-col gap-6 flex-1">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Name</label>
                <input 
                  value={title} 
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 p-3 text-xs text-white outline-none focus:border-[#0078D4] transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Target Folder</label>
                <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto pr-1 no-scrollbar">
                  {folders.map(f => (
                    <button 
                      key={f.id}
                      onClick={() => setSelectedFolder(f)}
                      className={`px-3 py-2.5 text-[10px] font-bold border transition-all truncate text-left ${selectedFolder.id === f.id ? 'bg-[#0078D4] border-[#0078D4] text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
                    >
                      {f.id === '1' ? 'Bar' : f.id === '2' ? 'Other' : f.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-auto">
              <button onClick={handleSave} className="w-full py-4 bg-[#0078D4] hover:bg-[#0086e6] text-white font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2">
                Add To TTab <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PopupApp;
