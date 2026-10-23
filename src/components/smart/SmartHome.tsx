import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Loader2, Settings as SettingsIcon, Undo2, X, CornerDownLeft } from 'lucide-react';

import { useLibrary } from '../../state/useLibrary';
import { useSettings } from '../../state/useSettings';
import { useSemantic, useVectorStatus } from '../../state/useSemantic';
import type { Cluster } from '../../core/vectors/semantic';
import type { LibraryItem } from '../../core/types';
import { addTags, markTagged, matchQuery, recordOpen, resolveCollection, setSummary, upsertCollection, deleteCollection } from '../../core/library';
import { relatedTags, smartViews, suggestCombos, topTags, uniqueByKey, usageOf, type Combo } from '../../core/tagGraph';
import { requestHistoryPermission } from '../../core/usage';
import { isEmptyQuery, parseQuery, searchItems } from '../../core/search';
import { bookmarkOps, openUrls } from '../../core/bookmarkSource';
import { isAIReady } from '../../core/ai/client';
import { aiTagBatch, buildTagContext, pickForTagging, planCommand, QUICK_COMMANDS } from '../../core/ai/tasks';
import { applyActions, type RefMap, type ResolvedAction } from '../../core/ai/actions';

import CommandBar from './CommandBar';
import TagBar from './TagBar';
import Shelf, { type ShelfKey, VIEW_NAMES } from './Shelf';
import ItemCard from './ItemCard';
import ItemDrawer from './ItemDrawer';
import PlanPanel, { type PlanState } from './PlanPanel';
import SelectionBar from './SelectionBar';
import TagManager from './TagManager';
import SettingsPanel from '../layers/Container/SettingsPanel';
import OrganizePanel from './OrganizePanel';
import WidgetBoard from '../../widgets/WidgetBoard';
import type { WidgetHost } from '../../widgets/types';
import { isLoose } from '../../core/organize/organizer';

const PAGE = 60;
const TAG_BATCH = 25;

function greeting(d: Date) {
  const h = d.getHours();
  const part = h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  const week = '日一二三四五六'[d.getDay()];
  return { part, date: `${d.getMonth() + 1} 月 ${d.getDate()} 日，星期${week}` };
}

const SmartHome: React.FC = () => {
  const lib = useLibrary();
  const { settings } = useSettings();
  const ai = settings?.ai;
  const aiReady = isAIReady(ai);
  const sem = useSemantic(lib.items, settings?.embed, settings?.ai);
  const vstatus = useVectorStatus();

  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [mode, setMode] = useState<'and' | 'or'>('and');
  const [shelf, setShelf] = useState<ShelfKey>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const planRefs = useRef<RefMap | null>(null);
  const planAbort = useRef<AbortController | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: boolean } | null>(null);
  const [tagging, setTagging] = useState<{ done: number; total: number } | null>(null);
  const tagAbort = useRef<AbortController | null>(null);
  const [tagManager, setTagManager] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [now] = useState(() => new Date());
  const [historyTipHidden, setHistoryTipHidden] = useState(() => {
    try { return localStorage.getItem('ttab_hide_history_tip') === '1'; } catch { return false; }
  });
  const canAskHistory = typeof chrome !== 'undefined' && !!chrome.permissions?.request;
  const showHistoryTip = canAskHistory && !lib.historyEnabled && !historyTipHidden && lib.ready;
  const hideHistoryTip = () => {
    setHistoryTipHidden(true);
    try { localStorage.setItem('ttab_hide_history_tip', '1'); } catch { /* ignore */ }
  };
  const enableHistory = () => {
    // 权限申请必须在点击里同步发起
    requestHistoryPermission().then(ok => {
      if (ok) { window.dispatchEvent(new Event('ttab_usage_refresh')); notify('已开启：推荐会参考你的浏览习惯'); }
    });
  };

  // 从地址栏搜索跳转过来时（newtab?q=…）预填搜索词
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('q');
      if (q) setQuery(q);
    } catch { /* ignore */ }
  }, []);

  // ------------------------------------------------------------------ 派生数据
  const uniqItems = useMemo(() => uniqueByKey(lib.items), [lib.items]);
  const views = useMemo(() => smartViews(lib.items), [lib.items]);
  const vocabulary = useMemo(() => topTags(lib.items, 400), [lib.items]);

  const collections = useMemo(() => [...lib.meta.collections]
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)
    .map(col => ({ col, members: resolveCollection(col, uniqItems) })), [lib.meta.collections, uniqItems]);

  const combos = useMemo(() => {
    const saved = new Set(lib.meta.collections.filter(c => c.query).map(c => [...c.query!.tags].sort().join('+')));
    return suggestCombos(uniqItems, 8)
      .filter(c => !saved.has([...c.tags].sort().join('+')))
      .map(combo => ({ combo, members: uniqItems.filter(it => combo.keys.includes(it.key)) }));
  }, [uniqItems, lib.meta.collections]);

  const groups = useMemo(() => {
    const byKey = new Map(uniqItems.map(i => [i.key, i]));
    const jac = (a: string[], b: string[]) => { const sb = new Set(b); const n = a.filter(x => sb.has(x)).length; return n / (a.length + b.length - n || 1); };
    // 和推荐组合几乎一样的分组就不重复展示
    return sem.clusters
      .filter(c => !combos.some(cb => jac(cb.combo.keys, c.keys) > 0.7))
      .map(cluster => ({ cluster, members: cluster.keys.map(k => byKey.get(k)).filter(Boolean) as LibraryItem[] }))
      .filter(g => g.members.length >= 3)
      .slice(0, 6);
  }, [sem.clusters, combos, uniqItems]);

  const shelfItems = useMemo(() => {
    if (!shelf) return uniqItems;
    if (shelf.startsWith('grp:')) return groups.find(g => `grp:${g.cluster.id}` === shelf)?.members || uniqItems;
    if (shelf.startsWith('view:')) {
      const v = views.find(x => `view:${x.id}` === shelf);
      if (!v) return uniqItems;
      const keys = new Set(v.keys);
      if (v.id === 'duplicates') return lib.items.filter(it => keys.has(it.key));
      const order = new Map(v.keys.map((k, i) => [k, i]));
      return uniqItems.filter(it => keys.has(it.key)).sort((a, b) => order.get(a.key)! - order.get(b.key)!);
    }
    const c = collections.find(x => `col:${x.col.id}` === shelf);
    return c ? c.members : uniqItems;
  }, [shelf, uniqItems, views, collections, lib.items]);

  // 正在输入的 #标签（还没敲空格）先不参与筛选，避免结果闪成 0
  const parsed = useMemo(() => parseQuery(query.replace(/(?:^|\s)-?#[^\s#]*$/, '')), [query]);
  const activeTags = useMemo(() => [...new Set([...tags, ...parsed.include])], [tags, parsed.include]);

  const results = useMemo(() => {
    const filtered = shelfItems.filter(it => matchQuery(it, { tags, mode }));
    if (!isEmptyQuery(parsed)) return searchItems(filtered, parsed, 500);
    if (shelf) return filtered; // 视图/组合自带排序
    // 默认排序：此刻最可能用到的在前，其次总使用频率，最后按收藏时间
    return [...filtered].sort((a, b) => b.nowScore - a.nowScore || usageOf(b) - usageOf(a) || (b.dateAdded || 0) - (a.dateAdded || 0));
  }, [shelfItems, tags, mode, parsed, shelf]);

  const related = useMemo(() => relatedTags(activeTags, shelfItems, activeTags.length ? 14 : 18), [activeTags, shelfItems]);

  // 意思相近：关键词搜索之外，再按语义找一批（不重复）
  const [semHits, setSemHits] = useState<LibraryItem[]>([]);
  const termText = parsed.terms.join(' ');
  useEffect(() => {
    if (!termText || !sem.index) { setSemHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const qv = await sem.embedQuery(termText);
      if (!alive || !qv || !sem.index) return;
      const shown = new Set(results.slice(0, 40).map(r => r.key));
      const pool = new Set(shelfItems.map(i => i.key));
      const byKey = new Map(uniqItems.map(i => [i.key, i]));
      const hits = sem.index.search(qv, 30)
        .filter(h => !shown.has(h.key) && pool.has(h.key))
        .map(h => byKey.get(h.key))
        .filter((i): i is LibraryItem => !!i && matchQuery(i, { tags, mode }))
        .slice(0, 8);
      setSemHits(hits);
    }, sem.index.mode === 'api' ? 450 : 150);
    return () => { alive = false; clearTimeout(t); };
  }, [termText, sem, results, shelfItems, uniqItems, tags, mode]);

  useEffect(() => setLimit(PAGE), [query, tags, mode, shelf]);

  const drawerItem = drawerKey ? lib.items.find(i => i.key === drawerKey) : undefined;

  // 小组件可用的宿主能力
  const widgetHost = useMemo<WidgetHost>(() => ({
    items: lib.items,
    collections: lib.meta.collections,
    openUrl: (url, background) => {
      if (background && typeof chrome !== 'undefined' && chrome.tabs?.create) void chrome.tabs.create({ url, active: false });
      else if (background) window.open(url, '_blank');
      else window.location.href = url;
    },
    notify: text => setToast({ text }),
  }), [lib.items, lib.meta.collections]);

  // ------------------------------------------------------------------ 动作
  const notify = useCallback((text: string, undo = false) => setToast({ text, undo }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleTag = useCallback((t: string) => {
    setTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
    // 如果是输入框里的 #标签，同步移除
    setQuery(q => q.split(/\s+/).filter(tok => tok !== `#${t}`).join(' '));
  }, []);

  const openItem = useCallback(async (item: LibraryItem, e?: React.MouseEvent) => {
    const background = !!e && (e.ctrlKey || e.metaKey || e.button === 1);
    await lib.commitNow(s => recordOpen(s, [item.key]));
    if (background) {
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) chrome.tabs.create({ url: item.url, active: false });
      else window.open(item.url, '_blank');
    } else {
      window.location.href = item.url;
    }
  }, [lib]);

  const openMany = useCallback(async (list: LibraryItem[], title?: string) => {
    if (!list.length) return;
    if (list.length > 12 && !confirm(`要一次打开 ${list.length} 个网页吗？`)) return;
    await lib.commitNow(s => recordOpen(s, list.map(i => i.key)));
    await openUrls(list.map(i => i.url), { groupTitle: title });
  }, [lib]);

  const toggleSelect = useCallback((item: LibraryItem) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(item.key)) n.delete(item.key); else n.add(item.key);
      return n;
    });
  }, []);

  const doUndo = useCallback(() => {
    const label = lib.undo();
    if (label) notify(`已撤销：${label}`);
  }, [lib, notify]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
      if (e.key === 'Escape') setSelected(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo]);

  // ------------------------------------------------------------------ AI 指令
  const askAI = useCallback(async (command: string) => {
    if (!isAIReady(ai)) {
      notify('还没有配置 AI。在设置里选择服务商并填写 API Key 后即可使用。');
      setSettingsOpen(true);
      return;
    }
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
      const p = await planCommand(ai, command, {
        items: lib.items, folders: lib.folders, state: lib.meta,
        selectedKeys: [...selected], activeTags, semanticSim,
      }, ctrl.signal);
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
    if (res.filter) {
      setShelf(null);
      setTags(res.filter.tags);
      setMode(res.filter.mode);
      setQuery(res.filter.query || '');
    } else {
      setQuery('');
    }
    if (res.createdCollectionIds.length === 1) setShelf(`col:${res.createdCollectionIds[0]}`);
    let moved = 0;
    try {
      for (const m of res.moves) {
        const folderId = m.folderId || (m.newFolder ? await bookmarkOps.createFolder(m.newFolder) : undefined);
        if (folderId) { await bookmarkOps.move(m.bookmarkIds, folderId); moved += m.bookmarkIds.length; }
      }
    } catch (e) {
      notify(`移动书签失败：${(e as Error).message}`);
    }
    for (const o of res.open) await openUrls(o.urls, { groupTitle: o.groupTitle });
    setSelected(new Set());
    notify(`已执行 ${actions.length} 项${moved ? `，移动了 ${moved} 个书签（书签移动不能撤销）` : ''}`, changed);
  }, [plan, lib, notify]);

  // ------------------------------------------------------------------ AI 批量打标签
  const pending = useMemo(() => pickForTagging(lib.items, lib.meta), [lib.items, lib.meta]);
  const looseCount = useMemo(() => lib.items.filter(isLoose).length, [lib.items]);

  const runTagging = useCallback(async () => {
    if (!isAIReady(ai)) { setSettingsOpen(true); return; }
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
        // 整次运行只占一条撤销记录
        if (first) { lib.update(apply, 'AI 打标签'); first = false; } else await lib.commitNow(apply);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') failed = (e as Error).message;
        break;
      }
      setTagging({ done: Math.min(i + TAG_BATCH, list.length), total: list.length });
    }
    setTagging(null);
    tagAbort.current = null;
    notify(failed ? `AI 打标签中断：${failed}` : ctrl.signal.aborted ? '已停止 AI 打标签' : 'AI 打标签完成', !first);
  }, [ai, tagging, pending, lib, notify]);

  // ------------------------------------------------------------------ 组合
  const saveCombo = (c: Combo) => {
    lib.update(s => upsertCollection(s, { name: c.tags.join(' + '), keys: [], query: { tags: c.tags, mode: 'and' }, source: 'auto' }), '保存组合');
    notify('已保存到我的组合，以后打了这些标签的网页会自动加入', true);
  };
  const saveGroup = (c: Cluster) => {
    lib.update(s => upsertCollection(s, { name: c.label, keys: c.keys, source: 'auto' }), '保存分组');
    notify(`已把「${c.label}」保存到我的组合`, true);
  };
  const applyCombo = (c: Combo) => {
    const same = c.tags.length === tags.length && c.tags.every(t => tags.includes(t));
    setShelf(null);
    setMode('and');
    setTags(same ? [] : c.tags);
  };

  // ------------------------------------------------------------------ 渲染
  const g = greeting(now);
  const selectedItems = uniqItems.filter(i => selected.has(i.key));
  const shelfName = shelf?.startsWith('view:')
    ? VIEW_NAMES[shelf.slice(5) as keyof typeof VIEW_NAMES]
    : shelf?.startsWith('grp:')
      ? groups.find(g => `grp:${g.cluster.id}` === shelf)?.cluster.label
      : collections.find(c => `col:${c.col.id}` === shelf)?.col.name;

  if (!lib.ready) return null;

  return (
    <div className="tt-smart w-full max-w-[1120px] mx-auto px-4 sm:px-6 pt-20 pb-32 flex flex-col gap-7">
      {/* 问候 + 设置 */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="tt-greet text-[40px] sm:text-[46px] leading-none text-[color:var(--text)]">{g.part}</h1>
          <p className="mt-2 text-[14px] text-[color:var(--muted)]">{g.date}，你有 {uniqItems.length} 个书签{vocabulary.length ? `，${vocabulary.length} 个标签` : ''}</p>
        </div>
        <button onClick={() => setSettingsOpen(true)} aria-label="设置" className="p-2.5 rounded-full text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-white/8">
          <SettingsIcon size={20} />
        </button>
      </header>

      {/* 指令栏 */}
      <div className="flex flex-col gap-3">
        <CommandBar
          value={query}
          onChange={setQuery}
          onSubmit={() => { const first = results[0] || semHits[0]; if (first) void openItem(first); }}
          onAsk={askAI}
          aiReady={aiReady}
          thinking={plan?.status === 'thinking'}
          vocabulary={vocabulary}
        />
        <div className="flex flex-wrap items-center gap-1.5 pl-1 min-h-[30px]">
          {query.trim() ? (
            <p className="flex items-center gap-4 pl-3 text-[12px] text-[color:var(--muted)]">
              <span className="flex items-center gap-1"><CornerDownLeft size={12} /> {results.length || semHits.length ? `打开「${(results[0] || semHits[0]).title.slice(0, 16)}」` : '没有匹配的书签'}</span>
              <span>Ctrl + Enter 交给 AI</span>
              <span>Esc 清空</span>
            </p>
          ) : aiReady ? (
            <>
              {(pending.length > 0 || tagging) && (
                <button onClick={runTagging} className="tt-quick tt-quick-ai">
                  {tagging ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {tagging ? `AI 打标签 ${tagging.done}/${tagging.total}，点击停止` : `AI 为 ${pending.length} 个网页打标签`}
                </button>
              )}
              {QUICK_COMMANDS.map(c => (
                <button key={c.id} onClick={() => askAI(c.prompt)} className="tt-quick">{c.label}</button>
              ))}
            </>
          ) : (
            <button onClick={() => setSettingsOpen(true)} className="tt-quick">
              <Sparkles size={13} /> 配置 AI 后，可以自动打标签、生成场景组合、用一句话整理书签
            </button>
          )}
          {!query.trim() && looseCount >= 3 && (
            <button onClick={() => setOrganizeOpen(true)} className="tt-quick">整理 {looseCount} 个散落的书签</button>
          )}
          {!query.trim() && vstatus.syncing && (
            <span className="tt-quick tt-quick-ai"><Loader2 size={13} className="animate-spin" /> 正在生成语义向量 {vstatus.syncing.done}/{vstatus.syncing.total}</span>
          )}
          {!query.trim() && showHistoryTip && (
            <span className="tt-quick !pr-1.5">
              <button onClick={enableHistory} className="hover:text-[color:var(--text)]">根据浏览历史推荐常用网页</button>
              <button onClick={hideHistoryTip} aria-label="不再提示" className="p-0.5 rounded-full hover:bg-white/10"><X size={12} /></button>
            </span>
          )}
        </div>
      </div>

      {/* 小组件 */}
      <WidgetBoard host={widgetHost} />

      {/* 组合 */}
      {(views.some(v => v.keys.length) || collections.length > 0 || combos.length > 0 || groups.length > 0) && (
        <section aria-label="组合" className="flex flex-col gap-3">
          <h2 className="text-[14px] text-[color:var(--muted)]">组合</h2>
          <Shelf
            views={views}
            collections={collections}
            combos={combos}
            groups={groups}
            active={shelf}
            activeTags={tags}
            onSelect={setShelf}
            onApplyCombo={applyCombo}
            onSaveCombo={saveCombo}
            onSaveGroup={saveGroup}
            onOpenAll={openMany}
            onDeleteCollection={id => { lib.update(s => deleteCollection(s, id), '删除组合'); if (shelf === `col:${id}`) setShelf(null); notify('已删除组合', true); }}
            onTogglePin={id => lib.update(s => ({ ...s, collections: s.collections.map(c => (c.id === id ? { ...c, pinned: !c.pinned } : c)) }), '置顶组合')}
          />
        </section>
      )}

      {/* 标签 + 网页 */}
      <section aria-label="网页" className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[14px] text-[color:var(--muted)]">{shelfName ? `${shelfName}里的网页` : activeTags.length || query ? '筛选结果' : '全部网页'}</h2>
          <span className="text-[13px] text-[color:var(--muted)] opacity-70">{results.length}</span>
          {shelf && <button onClick={() => setShelf(null)} className="ml-1 text-[12px] text-[color:var(--muted)] hover:text-[color:var(--text)] flex items-center gap-0.5"><X size={12} />退出</button>}
          {shelf === 'view:duplicates' && results.length > 0 && (
            <span className="ml-auto text-[12px] text-[color:var(--warn)]">同一网址被收藏了多次，可以打开详情删除多余的书签</span>
          )}
        </div>

        <TagBar
          selected={tags}
          mode={mode}
          related={related}
          onToggle={toggleTag}
          onModeChange={setMode}
          onClear={() => { setTags([]); setQuery(q => q.split(/\s+/).filter(t => !t.startsWith('#')).join(' ')); }}
          onManageTags={() => setTagManager(true)}
        />

        {results.length > 0 ? (
          <>
            <div className="tt-grid grid gap-2.5 mt-1">
              {results.slice(0, limit).map(it => (
                <ItemCard
                  key={shelf === 'view:duplicates' ? it.id : it.key}
                  item={it}
                  selected={selected.has(it.key)}
                  selecting={selected.size > 0}
                  activeTags={activeTags}
                  onOpen={openItem}
                  onToggleSelect={toggleSelect}
                  onEdit={i => setDrawerKey(i.key)}
                  onTagClick={toggleTag}
                />
              ))}
            </div>
            {results.length > limit && (
              <button onClick={() => setLimit(l => l + PAGE * 2)} className="self-center mt-2 h-9 px-5 rounded-full text-[13px] text-[color:var(--muted)] border border-white/12 hover:text-[color:var(--text)]">
                再显示 {Math.min(PAGE * 2, results.length - limit)} 个
              </button>
            )}
          </>
        ) : semHits.length ? null : (
          <div className="py-16 text-center text-[14px] text-[color:var(--muted)] leading-relaxed">
            {uniqItems.length === 0
              ? <>书签还是空的。点击浏览器工具栏里的 TTab 按钮收藏当前网页，<br />或者在设置里导入从别的浏览器导出的数据。</>
              : <>没有找到符合条件的网页。试试去掉一个标签，{aiReady ? '或者按 Ctrl + Enter 让 AI 帮你找。' : '或换个关键词。'}</>}
          </div>
        )}
        {semHits.length > 0 && (
          <div className="flex flex-col gap-2.5 mt-4">
            <h3 className="text-[13px] text-[color:var(--muted)]">
              意思相近的网页
              <span className="ml-2 opacity-60">{sem.index?.mode === 'api' ? '按语义匹配' : '按内容用词匹配'}</span>
            </h3>
            <div className="tt-grid grid gap-2.5">
              {semHits.map(it => (
                <ItemCard
                  key={'sem-' + it.key}
                  item={it}
                  selected={selected.has(it.key)}
                  selecting={selected.size > 0}
                  activeTags={activeTags}
                  onOpen={openItem}
                  onToggleSelect={toggleSelect}
                  onEdit={i => setDrawerKey(i.key)}
                  onTagClick={toggleTag}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 浮层 */}
      <AnimatePresence>
        {selected.size > 0 && (
          <SelectionBar
            key="sel"
            count={selected.size}
            aiReady={aiReady}
            onAddTag={t => { lib.update(s => addTags(s, [...selected], [t], 'manual'), `批量添加 #${t}`); notify(`已给 ${selected.size} 个网页加上 #${t}`, true); }}
            onCreateCollection={name => { lib.update(s => upsertCollection(s, { name, keys: [...selected], source: 'manual' }), `新建组合「${name}」`); setSelected(new Set()); notify(`已创建组合「${name}」`, true); }}
            onOpenAll={() => openMany(selectedItems)}
            onAskAI={() => {
              setQuery('把选中的网页');
              (document.querySelector('[aria-label="搜索或指令"]') as HTMLInputElement | null)?.focus();
            }}
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
            onOpen={i => openItem(i)}
            onShowItem={i => setDrawerKey(i.key)}
            onRenameBookmark={(i, title) => { void bookmarkOps.rename(i.id, title); notify('已修改书签标题'); }}
            onDeleteBookmark={i => { void bookmarkOps.remove(i.id, false); setDrawerKey(null); notify('已从浏览器书签中删除'); }}
          />
        )}
        {plan && (
          <PlanPanel
            key="plan"
            plan={plan}
            onApply={applyPlan}
            onCancel={() => { planAbort.current?.abort(); setPlan(null); }}
            onRetry={() => askAI(plan.command)}
          />
        )}
        {tagManager && (
          <TagManager key="tm" items={lib.items} update={lib.update} onPick={t => { setShelf(null); setTags([t]); }} onClose={() => setTagManager(false)} />
        )}
        {organizeOpen && (
          <OrganizePanel key="organize" items={lib.items} folders={lib.folders} index={sem.index} ai={ai} onClose={() => setOrganizeOpen(false)} notify={t => notify(t)} />
        )}
        {settingsOpen && (
          <SettingsPanel key="settings" currentPath={{ id: settings?.defaultFolderId || '0', title: '' }} onClose={() => setSettingsOpen(false)} onRefresh={() => {}} />
        )}
        {toast && (
          <motion.div
            key="toast"
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className={`tt-pop fixed left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 pl-4 pr-2 py-2 rounded-[14px] text-[13px] text-[color:var(--text)] max-w-[calc(100vw-32px)] ${selected.size ? 'bottom-24' : 'bottom-6'}`}
            role="status"
          >
            <span>{toast.text}</span>
            {toast.undo && lib.canUndo && (
              <button onClick={() => { doUndo(); }} className="flex items-center gap-1 h-8 px-3 rounded-[10px] bg-white/10 hover:bg-white/15"><Undo2 size={13} /> 撤销</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SmartHome;
