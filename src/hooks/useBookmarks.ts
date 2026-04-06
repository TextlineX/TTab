import { useState, useEffect, useCallback } from 'react';
import { storage } from '../utils/storage';
import { pinyinMatch } from '../utils/pinyinUtils';

export interface PathNode {
  id: string;
  title: string;
}

export interface BookmarkNode extends chrome.bookmarks.BookmarkTreeNode {
  color?: string;
  size?: string;
  weight?: number;
  parentTitle?: string;
}

export function useBookmarks(searchQuery: string = '') {
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [searchResults, setSearchResults] = useState<BookmarkNode[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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

  // 全局搜索逻辑（支持拼音）
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const search = async () => {
      setIsSearching(true);
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        // 获取全量书签树并扁平化，以支持拼音匹配
        chrome.bookmarks.getTree(async (tree) => {
          const allItems: chrome.bookmarks.BookmarkTreeNode[] = [];
          const flatten = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
            nodes.forEach(node => {
              if (node.url) allItems.push(node);
              if (node.children) flatten(node.children);
            });
          };
          flatten(tree);

          const colorCache = await storage.getColorCache();
          
          // 使用 pinyinMatch 进行过滤
          const matched = allItems.filter(node => 
            pinyinMatch(node.title, searchQuery) || (node.url && node.url.toLowerCase().includes(searchQuery.toLowerCase()))
          );

          // 取前 50 条并补充父文件夹信息
          const limitedResults = matched.slice(0, 50);
          const enriched = await Promise.all(limitedResults.map(async (node) => {
            let parentTitle = '';
            if (node.parentId) {
              const parent = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((res) => 
                chrome.bookmarks.get(node.parentId!, res)
              );
              parentTitle = parent[0]?.title || '';
            }
            return {
              ...node,
              color: node.url ? colorCache[node.url] : undefined,
              parentTitle
            };
          }));

          setSearchResults(enriched as BookmarkNode[]);
          setIsSearching(false);
        });
      }
    };

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  return { 
    bookmarks, 
    setBookmarks, 
    searchResults, 
    isSearching, 
    loading, 
    currentFolderId, 
    rootId, 
    navigateTo, 
    navigateBack, 
    path 
  };
}
