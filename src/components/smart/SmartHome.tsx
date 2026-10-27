import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Loader2, Undo2, X, CornerDownLeft, Menu as MenuIcon, ExternalLink, AppWindow, Tags, Link2, FolderInput, CheckSquare, Trash2, ArrowUpToLine, ArrowDown, ArrowUp, Pencil, FolderPlus } from 'lucide-react';

import { useLibrary } from '../../state/useLibrary';
import { useCloud } from '../../state/useCloud';
import { useSettings } from '../../state/useSettings';
import { useSemantic, useVectorStatus } from '../../state/useSemantic';
import type { FolderRecord, LibraryItem } from '../../core/types';
import { addTags, markTagged, matchQuery, recordOpen, setSummary, upsertCollection, deleteCollection, resolveCollection } from '../../core/library';
import { relatedTags, smartViews, suggestCombos, topTags, uniqueByKey } from '../../core/tagGraph';
import { requestHistoryPermission } from '../../core/usage';
import { isEmptyQuery, parseQuery, searchItems } from '../../core/search';
import { bookmarkOps, openUrls } from '../../core/bookmarkSource';
import { isAIReady } from '../../core/ai/client';
import { aiTagBatch, buildTagContext, pickForTagging, planCommand, QUICK_COMMANDS } from '../../core/ai/tasks';
import { applyActions, type RefMap, type ResolvedAction } from '../../core/ai/actions';
import { descendantIds, folderTree, nowPicks, overviewCategories, resolveNav, sortItems, type Category, type NavContext, type SortMode } from '../../core/nav';
import { isLoose } from '../../core/organize/organizer';
import { executeMoves, undoLog } from '../../core/organize/executor';
import { canMoveFolder, chromeFolderWriter, defaultNewFolderParent, moveFolder, moveToTop, shiftFolder } from '../../core/organize/folderOps';

import CommandBar from './CommandBar';
import ItemDrawer from './ItemDrawer';
import PlanPanel, { type PlanState } from './PlanPanel';
import SelectionBar from './SelectionBar';
import TagManager from './TagManager';
import OrganizePanel from './OrganizePanel';
import type { CardVariant } from './ItemCard';
import Sidebar, { type SidebarData } from '../shell/Sidebar';
import Overview from '../shell/Overview';
import FocusView from '../shell/FocusView';
import SettingsModal from '../settings/SettingsModal';
import WidgetBoard from '../../widgets/WidgetBoard';
import type { WidgetHost } from '../../widgets/types';
import Menu, { type MenuItem } from '../../ui/Menu';
import FolderPicker from '../../ui/FolderPicker';
import PromptDialog from '../../ui/PromptDialog';
import { spring } from '../../ui/motion';

const PAGE = 120;
const TAG_BATCH = 25;

function greeting(d: Date) {
  const h = d.getHours();
  const part = h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  const week = '日一二三四五六'[d.getDay()];
  return { part, date: `${d.getMonth() + 1} 月 ${d.getDate()} 日，星期${week}` };
}

function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { return (localStorage.getItem(key) as T) || initial; } catch { return initial; } });
  return [v, (next: T) => { setV(next); try { localStorage.setItem(key, next); } catch { /* ignore */ } }];
}

interface Toast { text: string; action?: { label: string; run: () => void } }

const SmartHome: React.FC<{ onClassic: () => void }> = ({ onClassic }) => {
  const lib = useLibrary();
  const cloud = useCloud(lib);
  const { settings } = useSettings();
  const ai = settings?.ai;
  const aiReady = isAIReady(ai);
  const sem = useSemantic(lib.items, settings?.embed, settings?.ai);
  const vstatus = useVectorStatus();

  const [nav, setNav] = useState('overview');
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [mode, setMode] = useState<'and' | 'or'>('and');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const planRefs = useRef<RefMap | null>(null);
  const planAbort = useRef<AbortController | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [tagging, setTagging] = useState<{ done: number; total: number } | null>(null);
  const tagAbort = useRef<AbortController | null>(null);
  const [modal, setModal] = useState<null | 'tags' | 'settings' | 'settings:ai' | 'organize'>(null);
  const [menu, setMenu] = useState<{ item: LibraryItem; x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<LibraryItem[] | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ folder: FolderRecord; x: number; y: number } | null>(null);
  const [movingFolder, setMovingFolder] = useState<FolderRecord | null>(null);
  const [prompt, setPrompt] = useState<null | { kind: 'rename' | 'newFolder'; folder: FolderRecord }>(null);
  const [limit, setLimit] = useState(PAGE);
  const [variant, setVariant] = usePref<CardVariant>('ttab_variant', 'card');
  const [sort, setSort] = usePref<SortMode>('ttab_sort', 'smart');
  const [collapsed, setCollapsed] = usePref<'0' | '1'>('ttab_sidebar_collapsed', '0');
  const [mobileNav, setMobileNav] = useState(false);
  const [now] = useState(() => new Date());
  const [historyTipHidden, setHistoryTipHidden] = useState(() => { try { return localStorage.getItem('ttab_hide_history_tip') === '1'; } catch { return false; } });

  const notify = useCallback((text: string, action?: Toast['action']) => setToast({ text, action }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 7000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // 从地址栏搜索跳转过来时（newtab?q=…）预填搜索词
  useEffect(() => {
    try { const q = new URLSearchParams(window.location.search).get('q'); if (q) setQuery(q); } catch { /* ignore */ }
  }, []);

  // ------------------------------------------------------------------ 派生数据
  const uniqItems = useMemo(() => uniqueByKey(lib.items), [lib.items]);
  const views = useMemo(() => smartViews(lib.items), [lib.items]);
  const vocabulary = useMemo(() => topTags(lib.items, 400), [lib.items]);

  const combos = useMemo(() => {
    const saved = new Set(lib.meta.collections.filter(c => c.query).map(c => [...c.query!.tags].sort().join('+')));
    return suggestCombos(uniqItems, 8).filter(c => !saved.has([...c.tags].sort().join('+')));
  }, [uniqItems, lib.meta.collections]);

  const groups = useMemo(() => {
    const jac = (a: string[], b: string[]) => { const sb = new Set(b); const n = a.filter(x => sb.has(x)).length; return n / (a.length + b.length - n || 1); };
    return sem.clusters.filter(c => c.keys.length >= 3 && !combos.some(cb => jac(cb.keys, c.keys) > 0.7)).slice(0, 8);
  }, [sem.clusters, combos]);

  const navCtx = useMemo<NavContext>(() => ({ items: lib.items, views, collections: lib.meta.collections, groups, combos, folders: lib.folders }), [lib.items, views, lib.meta.collections, groups, combos, lib.folders]);
  const looseItems = useMemo(() => uniqueByKey(lib.items.filter(isLoose)), [lib.items]);

  const sidebarData = useMemo<SidebarData>(() => ({
    total: uniqItems.length,
    looseCount: looseItems.length,
    views,
    collections: [...lib.meta.collections].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt).map(col => ({ col, count: resolveCollection(col, uniqItems).length })),
    groups: groups.map(cluster => ({ cluster, count: cluster.keys.length })),
    combos: combos.map(combo => ({ combo, count: combo.keys.length })),
    folders: folderTree(lib.folders, lib.items),
    tags: vocabulary,
  }), [uniqItems, looseItems.length, views, lib.meta.collections, groups, combos, lib.folders, lib.items, vocabulary]);

  const categories = useMemo(() => overviewCategories(navCtx), [navCtx]);
  const picks = useMemo(() => nowPicks(lib.items), [lib.items]);

  const parsed = useMemo(() => parseQuery(query.replace(/(?:^|\s)-?#[^\s#]*$/, '')), [query]);
  const searching = !isEmptyQuery(parsed);
  const activeTags = useMemo(() => [...new Set([...tags, ...parsed.include])], [tags, parsed.include]);

  const current: Category = useMemo(() => {
    if (searching) return { key: 'search', kind: 'all', title: `搜索"${query.trim()}"`, items: uniqItems };
    return resolveNav(nav, navCtx) || resolveNav('overview', navCtx)!;
  }, [searching, query, nav, navCtx, uniqItems]);

  const results = useMemo(() => {
    const base = current.items.filter(it => matchQuery(it, { tags, mode }));
    if (searching) {
      const found = searchItems(base, parsed, 1000);
      return sort === 'smart' ? found : sortItems(found, sort);
    }
    return sort === 'smart' ? base : sortItems(base, sort);
  }, [current, tags, mode, searching, parsed, sort]);

  const related = useMemo(() => relatedTags(activeTags, current.items, 30), [activeTags, current.items]);

  useEffect(() => setLimit(PAGE), [query, tags, mode, nav, sort]);

  // 意思相近（只在搜索时）
  const [semHits, setSemHits] = useState<LibraryItem[]>([]);
  const termText = parsed.terms.join(' ');
  useEffect(() => {
    if (!termText || !sem.index) { setSemHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const qv = await sem.embedQuery(termText);
      if (!alive || !qv || !sem.index) return;
      const shown = new Set(results.slice(0, 40).map(r => r.key));
      const byKey = new Map(uniqItems.map(i => [i.key, i]));
      setSemHits(sem.index.search(qv, 30)
        .filter(h => !shown.has(h.key))
        .map(h => byKey.get(h.key))
        .filter((i): i is LibraryItem => !!i && matchQuery(i, { tags, mode }))
        .slice(0, 8));
    }, sem.index.mode === 'api' ? 450 : 150);
    return () => { alive = false; clearTimeout(t); };
  }, [termText, sem, results, uniqItems, tags, mode]);

  const drawerItem = drawerKey ? lib.items.find(i => i.key === drawerKey) : undefined;

  // ------------------------------------------------------------------ 动作
  const go = useCallback((key: string) => {
    setNav(key); setQuery(''); setTags([]); setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleTag = useCallback((t: string) => {
    setTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
    setQuery(q => q.split(/\s+/).filter(tok => tok !== `#${t}`).join(' '));
  }, []);

  const openItem = useCallback(async (item: LibraryItem, e?: React.MouseEvent) => {
    const background = !!e && (e.ctrlKey || e.metaKey || e.button === 1);
    await lib.commitNow(s => recordOpen(s, [item.key]));
    if (background) {
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) void chrome.tabs.create({ url: item.url, active: false });
      else window.open(item.url, '_blank');
    } else window.location.href = item.url;
  }, [lib]);

  const openMany = useCallback(async (list: LibraryItem[], title?: string) => {
    if (!list.length) return;
    if (list.length > 12 && !confirm(`要一次打开 ${list.length} 个网页吗？`)) return;
    await lib.commitNow(s => recordOpen(s, list.map(i => i.key)));
    await openUrls(list.map(i => i.url), { groupTitle: title });
  }, [lib]);

  const toggleSelect = useCallback((item: LibraryItem) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(item.key)) n.delete(item.key); else n.add(item.key); return n; });
  }, []);

  const doUndo = useCallback(() => { const label = lib.undo(); if (label) notify(`已撤销：${label}`); }, [lib, notify]);
  const undoAction = { label: '撤销', run: doUndo };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
      if (e.key === 'Escape') setSelected(new Set());
      if (e.key === '[') setCollapsed(collapsed === '1' ? '0' : '1');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, collapsed, setCollapsed]);

  // 移动书签到文件夹（记录在整理记录里，可撤销）
  const moveTo = async (list: LibraryItem[], folderId: string) => {
    const folder = lib.folders.find(f => f.id === folderId);
    const { log } = await executeMoves(list.map(it => ({
      bookmarkId: it.id, key: it.key, title: it.title, url: it.url, fromFolderId: it.parentId, fromPath: it.folderPath,
      toFolderId: folderId, toPath: folder?.path || [], reason: '手动移动', confidence: 1,
    })), defaultNewFolderParent(lib.folders));
    setMoving(null);
    if (!log.moves.length) { notify(list.length === 1 ? '它已经在这个文件夹里了' : '选中的书签已经都在这个文件夹里了'); return; }
    if (log.moves.length) notify(`已移动 ${log.moves.length} 个书签到「${folder?.title}」`, { label: '撤销', run: () => { void undoLog(log.id).then(() => notify('已移回原位置')); } });
  };

  /** 文件夹操作：成功后给出撤销 */
  const withUndo = (r: { ok: boolean; reason?: string; undo?: { run: () => Promise<void> } }, done: string) => {
    if (!r.ok) { notify(r.reason || '没有改变'); return; }
    notify(done, r.undo && { label: '撤销', run: () => { void r.undo!.run().then(() => notify('已还原')); } });
  };
  const folderMenuItems = (f: FolderRecord): MenuItem[] => {
    const topLevel = !f.parentId && f.path.length === 1;
    return [
      { label: '打开', icon: <ExternalLink size={15} />, onSelect: () => go(`folder:${f.id}`) },
      { label: '新建子文件夹…', icon: <FolderPlus size={15} />, onSelect: () => setPrompt({ kind: 'newFolder', folder: f }) },
      { divider: true, label: '' },
      { label: '重命名…', icon: <Pencil size={15} />, disabled: topLevel, onSelect: () => setPrompt({ kind: 'rename', folder: f }) },
      { label: '移动到…', icon: <FolderInput size={15} />, disabled: topLevel, onSelect: () => setMovingFolder(f) },
      { label: '上移', icon: <ArrowUp size={15} />, disabled: topLevel, onSelect: () => { void shiftFolder(f.id, -1).then(r => withUndo(r, `已上移「${f.title}」`)); } },
      { label: '下移', icon: <ArrowDown size={15} />, disabled: topLevel, onSelect: () => { void shiftFolder(f.id, 1).then(r => withUndo(r, `已下移「${f.title}」`)); } },
    ];
  };

  const itemMenu = (item: LibraryItem): MenuItem[] => [
    { label: '打开', icon: <ExternalLink size={15} />, onSelect: () => { void openItem(item); } },
    { label: '在后台新标签页打开', icon: <AppWindow size={15} />, hint: 'Ctrl+点击', onSelect: () => { void openItem(item, { ctrlKey: true, button: 0 } as React.MouseEvent); } },
    { label: '编辑标签与详情', icon: <Tags size={15} />, onSelect: () => setDrawerKey(item.key) },
    { label: '复制链接', icon: <Link2 size={15} />, onSelect: () => { void navigator.clipboard?.writeText(item.url).then(() => notify('已复制链接')); } },
    { label: '移动到文件夹…', icon: <FolderInput size={15} />, onSelect: () => setMoving([item]) },
    { label: '在文件夹里置顶', icon: <ArrowUpToLine size={15} />, onSelect: () => { void moveToTop(item.id).then(r => (r.ok ? notify('已移到所在文件夹的最前面', r.undo && { label: '撤销', run: () => { void r.undo!.run().then(() => notify('已还原位置')); } }) : notify('它已经在最前面了'))); } },
    { label: selected.has(item.key) ? '取消选择' : '选择', icon: <CheckSquare size={15} />, hint: 'Shift+点击', onSelect: () => toggleSelect(item) },
    { divider: true, label: '' },
    { label: '从浏览器书签中删除', icon: <Trash2 size={15} />, danger: true, onSelect: () => { if (confirm(`从浏览器书签中删除「${item.title}」？`)) { void bookmarkOps.remove(item.id, false); notify('已删除书签'); } } },
  ];

  // ------------------------------------------------------------------ AI
  const askAI = useCallback(async (command: string) => {
    if (!isAIReady(ai)) { notify('还没有配置 AI。在设置里选择服务商并填写 API Key 后即可使用。'); setModal('settings:ai'); return; }
    planAbort.current?.abort();
    const ctrl = new AbortController();
    planAbort.current = ctrl;
    setPlan({ status: 'thinking', command });
    try {
      let semanticSim: Map<string, number> | undefined;
      if (sem.index && uniqItems.length > 350) {
        const qv = await sem.embedQuery(command);
        if (qv) semanticSim = new Map(sem.index.search(qv, 400, -1).map(h => [h.key, h.sim]));
      }
      const p = await planCommand(ai, command, { items: lib.items, folders: lib.folders, state: lib.meta, selectedKeys: [...selected], activeTags, semanticSim }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      planRefs.current = p.refs;
      setPlan({ status: 'ready', command, reply: p.reply, actions: p.actions });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setPlan({ status: 'error', command, error: (e as Error).message });
    }
  }, [ai, lib.items, lib.folders, lib.meta, selected, activeTags, notify, sem, uniqItems.length]);

  const applyPlan = useCallback(async (actions: ResolvedAction[]) => {
    if (plan?.status !== 'ready' || !planRefs.current) return;
    const res = applyActions(lib.meta, actions, planRefs.current);
    const changed = res.state !== lib.meta;
    if (changed) lib.update(() => res.state, `AI：${plan.command.slice(0, 20)}`);
    setPlan(null);
    if (res.filter) { setNav('all'); setTags(res.filter.tags); setMode(res.filter.mode); setQuery(res.filter.query || ''); } else setQuery('');
    if (res.createdCollectionIds.length === 1) go(`col:${res.createdCollectionIds[0]}`);
    let moved = 0;
    try {
      for (const m of res.moves) {
        const folderId = m.folderId || (m.newFolder ? await bookmarkOps.createFolder(m.newFolder) : undefined);
        if (folderId) { await bookmarkOps.move(m.bookmarkIds, folderId); moved += m.bookmarkIds.length; }
      }
    } catch (e) { notify(`移动书签失败：${(e as Error).message}`); }
    for (const o of res.open) await openUrls(o.urls, { groupTitle: o.groupTitle });
    setSelected(new Set());
    notify(`已执行 ${actions.length} 项${moved ? `，移动了 ${moved} 个书签（书签移动不能撤销）` : ''}`, changed ? undoAction : undefined);
  }, [plan, lib, notify, go]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useMemo(() => pickForTagging(lib.items, lib.meta), [lib.items, lib.meta]);
  const runTagging = useCallback(async () => {
    if (!isAIReady(ai)) { setModal('settings:ai'); return; }
    if (tagging) { tagAbort.current?.abort(); return; }
    const list = pending;
    if (!list.length) return;
    const ctrl = new AbortController();
    tagAbort.current = ctrl;
    setTagging({ done: 0, total: list.length });
    let first = true;
    let failed = '';
    for (let i = 0; i < list.length; i += TAG_BATCH) {
      if (ctrl.signal.aborted) break;
      const batch = list.slice(i, i + TAG_BATCH);
      try {
        const tagCtx = await buildTagContext(batch, lib.meta, ctrl.signal);
        const res = await aiTagBatch(ai, batch, lib.items, ctrl.signal, tagCtx);
        const apply = (s: typeof lib.meta) => {
          let n = markTagged(s, batch.map(b => b.key), 'ai');
          for (const r of res) {
            n = addTags(n, [r.key], r.tags, 'ai');
            if (r.summary && !n.pages[r.key]?.summary) n = setSummary(n, r.key, r.summary);
          }
          return n;
        };
        if (first) { lib.update(apply, 'AI 打标签'); first = false; } else await lib.commitNow(apply);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') failed = (e as Error).message;
        break;
      }
      setTagging({ done: Math.min(i + TAG_BATCH, list.length), total: list.length });
    }
    setTagging(null);
    tagAbort.current = null;
    notify(failed ? `AI 打标签中断：${failed}` : ctrl.signal.aborted ? '已停止 AI 打标签' : 'AI 打标签完成', !first ? undoAction : undefined);
  }, [ai, tagging, pending, lib, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ 分类操作
  const saveAsCollection = (cat: Category) => {
    const byQuery = (cat.kind === 'combo' || cat.kind === 'tag') && cat.tags?.length !== 0;
    const qTags = cat.kind === 'tag' ? [cat.title.replace(/^#/, '')] : cat.tags || [];
    let createdId = '';
    lib.update(s => {
      const before = new Set(s.collections.map(c => c.id));
      const next = upsertCollection(s, byQuery && qTags.length
        ? { name: cat.title.replace(/^#/, ''), keys: [], query: { tags: qTags, mode: 'and' }, source: 'auto' }
        : { name: cat.title, keys: cat.items.map(i => i.key), source: 'manual' });
      createdId = next.collections.find(c => !before.has(c.id))?.id || '';
      return next;
    }, '保存组合');
    notify(byQuery ? '已保存为组合，以后打了这些标签的网页会自动加入' : '已保存为组合', undoAction);
    if (createdId) setTimeout(() => go(`col:${createdId}`), 0);
  };

  const widgetHost = useMemo<WidgetHost>(() => ({
    items: lib.items,
    collections: lib.meta.collections,
    openUrl: (url, background) => {
      if (background && typeof chrome !== 'undefined' && chrome.tabs?.create) void chrome.tabs.create({ url, active: false });
      else if (background) window.open(url, '_blank');
      else window.location.href = url;
    },
    notify: text => notify(text),
  }), [lib.items, lib.meta.collections, notify]);

  // ------------------------------------------------------------------ 渲染
  if (!lib.ready) return null;
  const g = greeting(now);
  const isOverview = !searching && current.kind === 'overview';
  const colId = current.kind === 'collection' ? current.key.slice(4) : '';
  const showHistoryTip = typeof chrome !== 'undefined' && !!chrome.permissions?.request && !lib.historyEnabled && !historyTipHidden;

  const sidebar = (
    <Sidebar
      data={sidebarData}
      active={searching ? '' : nav}
      collapsed={collapsed === '1' && !mobileNav}
      onSelect={go}
      onToggleCollapsed={() => (mobileNav ? setMobileNav(false) : setCollapsed(collapsed === '1' ? '0' : '1'))}
      onOrganize={() => setModal('organize')}
      onTagManager={() => setModal('tags')}
      onSettings={() => setModal('settings')}
      onClassic={onClassic}
      onFolderMenu={(folder, x, y) => setFolderMenu({ folder, x, y })}
    />
  );

  const chip = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] border transition-colors';

  return (
    <div className="flex min-h-screen gap-4 p-3 sm:p-4">
      <aside className="hidden lg:block sticky top-4 h-[calc(100vh-2rem)] shrink-0 z-20">{sidebar}</aside>

      <AnimatePresence>
        {mobileNav && (
          <motion.div className="lg:hidden fixed inset-0 z-[90] flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[color:var(--scrim)]" onClick={() => setMobileNav(false)} />
            <motion.div className="relative h-full p-3" initial={{ x: -40 }} animate={{ x: 0 }} exit={{ x: -40 }} transition={spring.smooth}>{sidebar}</motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 min-w-0 max-w-[1320px] mx-auto pb-28">
        <div className="flex items-center gap-3 lg:hidden mb-3">
          <button onClick={() => setMobileNav(true)} aria-label="打开分类导航" className="tt-glass p-2.5 rounded-xl text-muted hover:text-fg"><MenuIcon size={18} /></button>
          <span className="tt-display text-[20px] text-fg">TTab</span>
        </div>

        <AnimatePresence initial={false}>
          {isOverview && (
            <motion.header key="greet" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="overflow-hidden">
              <div className="pt-6 pb-5 px-1">
                <h1 className="tt-display text-[38px] sm:text-[44px] leading-none text-fg">{g.part}</h1>
                <p className="mt-2.5 text-[13.5px] text-muted">{g.date}　{uniqItems.length} 个书签，{vocabulary.length} 个标签，{categories.length} 个分类</p>
              </div>
            </motion.header>
          )}
        </AnimatePresence>

        <div className={`sticky top-3 sm:top-4 z-30 ${isOverview ? '' : 'pt-1'}`}>
          <CommandBar value={query} onChange={setQuery} onSubmit={() => { const f = results[0] || semHits[0]; if (f) void openItem(f); }} onAsk={askAI} aiReady={aiReady} thinking={plan?.status === 'thinking'} vocabulary={vocabulary} />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 mb-7 min-h-8">
          {query.trim() ? (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-2 text-[12.5px] text-muted">
              <span className="flex items-center gap-1"><CornerDownLeft size={13} /> {results.length || semHits.length ? `打开「${(results[0] || semHits[0]).title.slice(0, 18)}」` : '没有匹配的书签'}</span>
              <span>Ctrl + Enter 交给 AI</span><span>Esc 清空</span>
            </p>
          ) : (
            <>
              {aiReady && (pending.length > 0 || tagging) && (
                <button onClick={runTagging} className={`${chip} bg-ai-soft border-[color:var(--ai)]/30 text-ai`}>
                  {tagging ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {tagging ? `AI 打标签 ${tagging.done}/${tagging.total}，点击停止` : `AI 为 ${pending.length} 个网页打标签`}
                </button>
              )}
              {aiReady && QUICK_COMMANDS.map(c => <button key={c.id} onClick={() => askAI(c.prompt)} className={`${chip} bg-fill-1 border-line text-muted hover:text-fg hover:border-line-strong`}>{c.label}</button>)}
              {!aiReady && (
                <button onClick={() => setModal('settings:ai')} className={`${chip} bg-fill-1 border-line text-muted hover:text-fg`}>
                  <Sparkles size={13} /> 配置 AI：自动打标签、生成场景组合、一句话整理书签
                </button>
              )}
              {vstatus.syncing && <span className={`${chip} border-transparent text-ai`}><Loader2 size={13} className="animate-spin" /> 生成语义向量 {vstatus.syncing.done}/{vstatus.syncing.total}</span>}
              {showHistoryTip && (
                <span className={`${chip} bg-fill-1 border-line text-muted !pr-1.5`}>
                  <button onClick={() => { requestHistoryPermission().then(ok => { if (ok) { window.dispatchEvent(new Event('ttab_usage_refresh')); notify('已开启：推荐会参考你的浏览习惯'); } }); }} className="hover:text-fg">根据浏览历史推荐常用网页</button>
                  <button onClick={() => { setHistoryTipHidden(true); try { localStorage.setItem('ttab_hide_history_tip', '1'); } catch { /* ignore */ } }} aria-label="不再提示" className="p-1 rounded-full hover:bg-fill-2"><X size={12} /></button>
                </span>
              )}
            </>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={searching ? 'search' : current.key}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {isOverview ? (
              <Overview
                picks={picks}
                categories={categories}
                loose={looseItems}
                widgets={<WidgetBoard host={widgetHost} />}
                onOpenItem={(it, e) => { void openItem(it, e); }}
                onMenu={(item, x, y) => setMenu({ item, x, y })}
                onOpenCategory={go}
                onOpenAll={(list, title) => { void openMany(list, title); }}
                onOrganize={() => setModal('organize')}
              />
            ) : (
              <FocusView
                cat={current}
                items={results}
                related={related}
                selectedTags={tags}
                tagMode={mode}
                onToggleTag={toggleTag}
                onTagMode={setMode}
                onClearTags={() => { setTags([]); setQuery(q => q.split(/\s+/).filter(t => !t.startsWith('#')).join(' ')); }}
                variant={variant}
                onVariant={setVariant}
                sort={sort}
                onSort={setSort}
                cards={{ selected, onOpen: (it, e) => { void openItem(it, e); }, onToggleSelect: toggleSelect, onMenu: (item, x, y) => setMenu({ item, x, y }) }}
                limit={limit}
                onMore={() => setLimit(l => l + PAGE)}
                onBack={() => go('overview')}
                onOpenAll={() => { void openMany(results, current.title); }}
                onSaveAsCollection={['group', 'combo', 'tag', 'folder', 'view'].includes(current.kind) && results.length ? () => saveAsCollection(current) : undefined}
                onTogglePin={colId ? () => lib.update(s => ({ ...s, collections: s.collections.map(c => (c.id === colId ? { ...c, pinned: !c.pinned } : c)) }), '置顶组合') : undefined}
                onDeleteCollection={colId ? () => { lib.update(s => deleteCollection(s, colId), '删除组合'); go('overview'); notify('已删除组合', undoAction); } : undefined}
                onOrganize={current.kind === 'loose' ? () => setModal('organize') : undefined}
                semantic={searching ? { label: sem.index?.mode === 'api' ? '按语义匹配' : '按内容用词匹配', items: semHits } : undefined}
                emptyHint={uniqItems.length === 0
                  ? <>书签还是空的。点击浏览器工具栏里的 TTab 按钮收藏当前网页，或者在设置里导入数据。</>
                  : <>没有找到符合条件的网页。试试去掉一个标签{aiReady ? '，或者按 Ctrl + Enter 让 AI 帮你找' : '，或换个关键词'}。</>}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 浮层 */}
      <AnimatePresence>
        {folderMenu && <Menu key="fmenu" x={folderMenu.x} y={folderMenu.y} title={folderMenu.folder.title} items={folderMenuItems(folderMenu.folder)} onClose={() => setFolderMenu(null)} />}
        {menu && <Menu key="menu" x={menu.x} y={menu.y} title={menu.item.title} items={itemMenu(menu.item)} onClose={() => setMenu(null)} />}
        {selected.size > 0 && (
          <SelectionBar
            key="sel"
            count={selected.size}
            aiReady={aiReady}
            onAddTag={t => { lib.update(s => addTags(s, [...selected], [t], 'manual'), `批量添加 #${t}`); notify(`已给 ${selected.size} 个网页加上 #${t}`, undoAction); }}
            onCreateCollection={name => { lib.update(s => upsertCollection(s, { name, keys: [...selected], source: 'manual' }), `新建组合「${name}」`); setSelected(new Set()); notify(`已创建组合「${name}」`, undoAction); }}
            onOpenAll={() => { void openMany(uniqItems.filter(i => selected.has(i.key))); }}
            onMove={() => setMoving(lib.items.filter(i => selected.has(i.key)))}
            onAskAI={() => { setQuery('把选中的网页'); (document.querySelector('[aria-label="搜索或指令"]') as HTMLInputElement | null)?.focus(); }}
            onSelectAll={() => setSelected(new Set(results.map(r => r.key)))}
            onClear={() => setSelected(new Set())}
          />
        )}
        {drawerItem && (
          <ItemDrawer
            key={drawerItem.key}
            item={drawerItem}
            items={lib.items}
            meta={lib.meta}
            index={sem.index}
            ai={ai}
            update={lib.update}
            onClose={() => setDrawerKey(null)}
            onOpen={i => { void openItem(i); }}
            onShowItem={i => setDrawerKey(i.key)}
            onRenameBookmark={(i, title) => { void bookmarkOps.rename(i.id, title); notify('已修改书签标题'); }}
            onDeleteBookmark={i => { void bookmarkOps.remove(i.id, false); setDrawerKey(null); notify('已从浏览器书签中删除'); }}
          />
        )}
        {plan && <PlanPanel key="plan" plan={plan} onApply={applyPlan} onCancel={() => { planAbort.current?.abort(); setPlan(null); }} onRetry={() => askAI(plan.command)} />}
        {modal === 'tags' && <TagManager key="tm" items={lib.items} update={lib.update} onPick={t => go(`tag:${t}`)} onClose={() => setModal(null)} />}
        {(modal === 'settings' || modal === 'settings:ai') && <SettingsModal key="settings" cloud={cloud} initial={modal === 'settings:ai' ? 'ai' : 'appearance'} onClassic={onClassic} onClose={() => setModal(null)} />}
        {modal === 'organize' && <OrganizePanel key="organize" items={lib.items} folders={lib.folders} index={sem.index} ai={ai} onClose={() => setModal(null)} notify={t => notify(t)} />}
        {movingFolder && (
          <FolderPicker
            key="movef"
            folders={lib.folders}
            title={`移动文件夹「${movingFolder.title}」`}
            subtitle="整个文件夹连同里面的书签一起移动，可以在提示里撤销"
            confirmLabel="移动到这里"
            value={movingFolder.parentId}
            disabledIds={descendantIds(lib.folders, movingFolder.id)}
            counts={new Map(folderTreeCounts(lib.folders, lib.items))}
            onPick={id => {
              const f = movingFolder; setMovingFolder(null);
              const c = canMoveFolder(lib.folders, f.id, id);
              if (!c.ok) { notify(c.reason); return; }
              void moveFolder(lib.folders, f.id, id).then(r => withUndo(r, `已把「${f.title}」移动到「${lib.folders.find(x => x.id === id)?.title}」`));
            }}
            onClose={() => setMovingFolder(null)}
          />
        )}
        {prompt && (
          <PromptDialog
            key="prompt"
            title={prompt.kind === 'rename' ? '重命名文件夹' : `在「${prompt.folder.title}」里新建文件夹`}
            label="名称"
            initial={prompt.kind === 'rename' ? prompt.folder.title : ''}
            confirmLabel={prompt.kind === 'rename' ? '重命名' : '新建'}
            onClose={() => setPrompt(null)}
            onSubmit={name => {
              const p = prompt; setPrompt(null);
              if (p.kind === 'rename') {
                const old = p.folder.title;
                void chromeFolderWriter.rename(p.folder.id, name).then(() => notify(`已重命名为「${name}」`, { label: '撤销', run: () => { void chromeFolderWriter.rename(p.folder.id, old).then(() => notify('已还原名称')); } }));
              } else {
                void chromeFolderWriter.create(name, p.folder.id).then(id => notify(`已新建「${name}」`, { label: '撤销', run: () => { void chrome.bookmarks.remove(id).then(() => notify('已撤销')); } }));
              }
            }}
          />
        )}
        {moving && (
          <FolderPicker
            key="move"
            folders={lib.folders}
            title={moving.length === 1 ? `移动「${moving[0].title}」` : `移动 ${moving.length} 个书签`}
            subtitle="会移动浏览器里的真实书签，可以在提示里撤销"
            confirmLabel="移动到这里"
            value={moving[0]?.parentId}
            counts={new Map(folderTreeCounts(lib.folders, lib.items))}
            onPick={id => { void moveTo(moving, id); }}
            onClose={() => setMoving(null)}
          />
        )}
        {toast && (
          <motion.div
            key="toast"
            initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={spring.smooth}
            className={`tt-raised fixed left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 pl-4 pr-2 py-2 rounded-2xl text-[13.5px] text-fg max-w-[calc(100vw-32px)] ${selected.size ? 'bottom-24' : 'bottom-6'}`}
            role="status"
          >
            <span>{toast.text}</span>
            {toast.action && (
              <button onClick={() => { toast.action!.run(); setToast(null); }} className="flex items-center gap-1 h-8 px-3 rounded-xl bg-fill-2 hover:bg-fill-3 text-[13px]"><Undo2 size={13} /> {toast.action.label}</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** 文件夹 → 书签数（直接） */
function folderTreeCounts(folders: { id: string }[], items: LibraryItem[]): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) if (it.parentId) m.set(it.parentId, (m.get(it.parentId) || 0) + 1);
  return folders.map(f => [f.id, m.get(f.id) || 0]);
}

export default SmartHome;
