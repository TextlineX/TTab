import { useState, useEffect, useCallback } from 'react';
import { storage } from '../utils/storage';

export interface PathNode {
  id: string;
  title: string;
}

export interface BookmarkNode extends chrome.bookmarks.BookmarkTreeNode {
  color?: string;
  size?: string;
  weight?: number;
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string>(''); 
  const [rootId, setRootId] = useState<string>('0');
  const [path, setPath] = useState<PathNode[]>([]);

  useEffect(() => {
    const init = async () => {
      const settings = await storage.getSettings();
      const rId = settings.defaultFolderId || '0';
      setRootId(rId);
      setCurrentFolderId(rId);
    };
    init();
  }, []);

  const loadFolder = useCallback(async (folderId: string) => {
    if (folderId === undefined || folderId === '') return;
    setLoading(true);
    
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      const colorCache = await storage.getColorCache();

      chrome.bookmarks.getSubTree(folderId, (nodes) => {
        if (nodes && nodes[0]) {
          const children = nodes[0].children as BookmarkNode[] || [];
          const enriched = children.map(node => ({
            ...node,
            color: node.url ? colorCache[node.url] : undefined
          }));
          setBookmarks(enriched);
        }
        setLoading(false);
      });

      const buildPath = (id: string, acc: PathNode[]) => {
        chrome.bookmarks.get(id, (nodes) => {
          if (nodes && nodes[0]) {
            const node = nodes[0];
            let title = node.title || 'Root';
            if (id === '1') title = 'Bar';
            if (id === '2') title = 'Other';
            
            const newAcc = [{ id: node.id, title }, ...acc];
            
            // 如果到达了用户设置的根目录，停止向上回溯，实现相对路径
            if (id === rootId || !node.parentId || node.parentId === '0' || node.parentId === 'root') {
              setPath(newAcc);
            } else {
              buildPath(node.parentId, newAcc);
            }
          }
        });
      };
      buildPath(folderId, []);
    } else {
      setBookmarks([{ id: '1', title: 'Mock' }] as any);
      setPath([{ id: rootId, title: 'ROOT' }]);
      setLoading(false);
    }
  }, [rootId]);

  useEffect(() => {
    loadFolder(currentFolderId);
  }, [currentFolderId, loadFolder]);

  const navigateTo = (id: string) => setCurrentFolderId(id);
  
  const navigateBack = () => {
    if (path.length <= 1) return;
    const parentNode = path[path.length - 2];
    setCurrentFolderId(parentNode.id);
  };

  return { bookmarks, setBookmarks, loading, currentFolderId, rootId, navigateTo, navigateBack, path };
}
