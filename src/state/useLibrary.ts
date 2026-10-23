/**
 * 智能书签库的状态中心：书签 + 标签/集合数据 + 撤销 + 持久化 + 跨标签页同步
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookmarkRecord, FolderRecord, LibraryItem, MetaState } from '../core/types';
import { emptyMeta } from '../core/types';
import { loadAllBookmarks, subscribeBookmarkChanges } from '../core/bookmarkSource';
import { loadMeta, saveMeta, subscribeMeta } from '../core/metaStore';
import { applyRuleTags, buildItems } from '../core/library';
import { computeUsage, emptyUsage, hasHistoryPermission, loadUsage, saveUsage, USAGE_TTL, type UsageState } from '../core/usage';

const HISTORY_LIMIT = 30;

export interface Library {
  ready: boolean;
  records: BookmarkRecord[];
  folders: FolderRecord[];
  items: LibraryItem[];
  meta: MetaState;
  /** 修改智能数据；label 用于撤销提示 */
  update: (fn: (s: MetaState) => MetaState, label?: string) => void;
  undo: () => string | null;
  commitNow: (fn: (s: MetaState) => MetaState) => Promise<void>;
  canUndo: boolean;
  lastLabel: string | null;
  reloadBookmarks: () => Promise<void>;
  /** 是否已授权读取浏览历史 */
  historyEnabled: boolean;
  usage: UsageState;
  /** 重新从浏览历史计算使用统计 */
  refreshUsage: (force?: boolean) => Promise<void>;
}

export function useLibrary(): Library {
  const [records, setRecords] = useState<BookmarkRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [meta, setMeta] = useState<MetaState>(emptyMeta);
  const [ready, setReady] = useState(false);
  const [usage, setUsage] = useState<UsageState>(emptyUsage);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const recordsRef = useRef<BookmarkRecord[]>([]);
  const history = useRef<{ state: MetaState; label: string }[]>([]);
  const [historyLen, setHistoryLen] = useState(0);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSaved = useRef<string>('');

  const persist = useCallback((s: MetaState) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const json = JSON.stringify(s);
      if (json === lastSaved.current) return;
      lastSaved.current = json;
      void saveMeta(s);
    }, 300);
  }, []);

  const reloadBookmarks = useCallback(async () => {
    const { records: r, folders: f } = await loadAllBookmarks();
    recordsRef.current = r;
    setRecords(r);
    setFolders(f);
    const next = applyRuleTags(metaRef.current, r);
    if (next !== metaRef.current) {
      setMeta(next);
      persist(next);
    }
  }, [persist]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [m, b] = await Promise.all([loadMeta(), loadAllBookmarks()]);
      if (!alive) return;
      recordsRef.current = b.records;
      const next = applyRuleTags(m, b.records);
      lastSaved.current = JSON.stringify(m);
      setRecords(b.records);
      setFolders(b.folders);
      setMeta(next);
      if (next !== m) persist(next);
      setReady(true);
    })();
    const offB = subscribeBookmarkChanges(() => { void reloadBookmarks(); });
    // 另一个新标签页或 popup 改了数据
    const offM = subscribeMeta(s => {
      const json = JSON.stringify(s);
      if (json === lastSaved.current) return;
      lastSaved.current = json;
      setMeta(s);
    });
    return () => { alive = false; offB(); offM(); };
  }, [persist, reloadBookmarks]);

  const update = useCallback((fn: (s: MetaState) => MetaState, label = '修改') => {
    const prev = metaRef.current;
    const next = fn(prev);
    if (next === prev) return;
    history.current = [...history.current.slice(-HISTORY_LIMIT + 1), { state: prev, label }];
    setHistoryLen(history.current.length);
    metaRef.current = next;
    setMeta(next);
    persist(next);
  }, [persist]);

  const undo = useCallback(() => {
    const last = history.current.pop();
    setHistoryLen(history.current.length);
    if (!last) return null;
    metaRef.current = last.state;
    setMeta(last.state);
    persist(last.state);
    return last.label;
  }, [persist]);

  /** 不进撤销历史、立即落盘（用于记录打开次数这类马上要跳转页面的场景） */
  const commitNow = useCallback(async (fn: (s: MetaState) => MetaState) => {
    const next = fn(metaRef.current);
    metaRef.current = next;
    setMeta(next);
    clearTimeout(saveTimer.current);
    lastSaved.current = JSON.stringify(next);
    await saveMeta(next);
  }, []);

  // 设置面板导入数据后刷新（开发模式下没有 storage.onChanged）
  useEffect(() => {
    const onImported = async () => {
      const m = await loadMeta();
      lastSaved.current = JSON.stringify(m);
      metaRef.current = m;
      setMeta(m);
    };
    window.addEventListener('ttab_meta_imported', onImported);
    return () => window.removeEventListener('ttab_meta_imported', onImported);
  }, []);

  // ---------------------------------------------------------------- 浏览历史统计
  const refreshUsage = useCallback(async (force = false) => {
    const granted = await hasHistoryPermission();
    setHistoryEnabled(granted);
    if (!granted) { setUsage(emptyUsage()); return; }
    const cached = await loadUsage();
    if (!force && Date.now() - cached.computedAt < USAGE_TTL && Object.keys(cached.entries).length) {
      setUsage(cached);
      return;
    }
    if (!recordsRef.current.length) {
      const { records: r } = await loadAllBookmarks();
      recordsRef.current = r;
    }
    try {
      const fresh = await computeUsage(recordsRef.current);
      setUsage(fresh);
      await saveUsage(fresh);
    } catch (e) {
      console.warn('[TTab] 读取浏览历史失败', e);
      setUsage(cached);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    // 首屏先渲染，再在空闲时统计历史
    const t = setTimeout(() => { void refreshUsage(); }, 300);
    const onRefresh = () => { void refreshUsage(true); };
    window.addEventListener('ttab_usage_refresh', onRefresh);
    return () => { clearTimeout(t); window.removeEventListener('ttab_usage_refresh', onRefresh); };
  }, [ready, refreshUsage]);

  const items = useMemo(() => buildItems(records, meta, usage), [records, meta, usage]);

  return {
    ready, records, folders, items, meta, update, undo, commitNow,
    canUndo: historyLen > 0,
    lastLabel: history.current[history.current.length - 1]?.label ?? null,
    reloadBookmarks,
    historyEnabled, usage, refreshUsage,
  };
}
