import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, FolderInput, FolderPlus, Sparkles, Loader2, AlertTriangle, Undo2, History, ChevronRight } from 'lucide-react';
import type { FolderRecord, LibraryItem } from '../../core/types';
import type { VectorIndex } from '../../core/vectors/semantic';
import { defaultOrganizeOptions, groupMoves, planOrganize, type OrganizeOptions, type OrganizePlan } from '../../core/organize/organizer';
import { aiPlanOrganize } from '../../core/organize/aiPlan';
import { executeMoves, loadLogs, undoLog, type OrganizeLog } from '../../core/organize/executor';
import { isAIReady, type AIConfig } from '../../core/ai/client';
import { faviconUrl } from './tagColor';

interface Props {
  items: LibraryItem[];
  folders: FolderRecord[];
  index: VectorIndex | null;
  ai?: AIConfig;
  onClose: () => void;
  notify: (text: string) => void;
}

/** 自动整理：生成方案 → 逐项确认 → 执行 → 可撤销 */
const OrganizePanel: React.FC<Props> = ({ items, folders, index, ai, onClose, notify }) => {
  const [tab, setTab] = useState<'plan' | 'history'>('plan');
  const [opts, setOpts] = useState<OrganizeOptions>(defaultOrganizeOptions);
  const [useAI, setUseAI] = useState(false);
  const [plan, setPlan] = useState<OrganizePlan | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'' | 'planning' | 'running'>('');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<OrganizeLog[]>([]);
  const aiReady = isAIReady(ai);

  const roots = folders.filter(f => f.path.length === 1);

  const generate = useCallback(async () => {
    setError('');
    setBusy('planning');
    try {
      const p = useAI && isAIReady(ai) ? await aiPlanOrganize(ai, items, folders, opts) : planOrganize(items, folders, index, opts);
      setPlan(p);
      setChecked(new Set(p.moves.map(m => m.bookmarkId)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }, [useAI, ai, items, folders, index, opts]);

  // 本地方案即时生成；AI 方案需要手动点
  useEffect(() => { if (!useAI) void generate(); }, [opts, useAI]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'history') void loadLogs().then(l => setLogs([...l].reverse())); }, [tab]);

  const groups = useMemo(() => (plan ? groupMoves(plan) : []), [plan]);
  const chosen = plan ? plan.moves.filter(m => checked.has(m.bookmarkId)) : [];
  const newFolderCount = new Set(chosen.filter(m => m.toNewFolder).map(m => m.toNewFolder)).size;

  const toggle = (ids: string[], on: boolean) => setChecked(prev => {
    const n = new Set(prev);
    ids.forEach(id => (on ? n.add(id) : n.delete(id)));
    return n;
  });

  const run = async () => {
    if (!chosen.length) return;
    setBusy('running');
    const { log, failed } = await executeMoves(chosen, opts.newFolderParentId);
    setBusy('');
    notify(`已整理 ${log.moves.length} 个书签${log.createdFolders.length ? `，新建 ${log.createdFolders.length} 个文件夹` : ''}${failed ? `，${failed} 个失败` : ''}。可在"整理记录"里撤销`);
    setPlan(null);
    setTab('history');
  };

  const undo = async (id: string) => {
    const r = await undoLog(id);
    notify(`已撤销：移回 ${r.restored} 个书签${r.skipped ? `，${r.skipped} 个之后被手动移动过，保持不动` : ''}`);
    setLogs([...(await loadLogs())].reverse());
  };

  const seg = (on: boolean) => `h-8 px-3 rounded-[10px] text-[12px] border transition-colors ${on ? 'bg-white/12 border-white/25 text-[color:var(--text)]' : 'border-white/10 text-[color:var(--muted)] hover:text-[color:var(--text)]'}`;

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center pt-[6vh] px-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/55" />
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        className="tt-plan relative w-full max-w-[720px] max-h-[86vh] rounded-[20px] flex flex-col overflow-hidden"
        role="dialog" aria-label="整理书签"
      >
        <header className="flex items-start gap-3 p-5 pb-3">
          <FolderInput size={20} className="mt-0.5 text-[color:var(--warn)]" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] text-[color:var(--text)]">整理书签</h2>
            <p className="text-[12px] text-[color:var(--muted)] mt-0.5 leading-relaxed">把书签放进合适的文件夹。会修改浏览器里的真实书签：执行前可以逐个取消，执行后可以整次撤销。</p>
          </div>
          <div className="flex gap-1">
            <button className={seg(tab === 'plan')} onClick={() => setTab('plan')}>整理方案</button>
            <button className={seg(tab === 'history')} onClick={() => setTab('history')}><History size={12} className="inline -mt-0.5 mr-1" />整理记录</button>
          </div>
          <button onClick={onClose} aria-label="关闭" className="p-1.5 rounded-lg hover:bg-white/10 text-[color:var(--muted)]"><X size={16} /></button>
        </header>

        {tab === 'plan' ? (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-3 text-[12px] text-[color:var(--muted)]">
              <span className="flex items-center gap-1.5">范围
                <button className={seg(opts.scope === 'loose')} onClick={() => setOpts({ ...opts, scope: 'loose' })}>只整理散落的</button>
                <button className={seg(opts.scope === 'all')} onClick={() => setOpts({ ...opts, scope: 'all' })}>也检查放错的</button>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="accent-sky-300" checked={opts.allowNewFolders} onChange={e => setOpts({ ...opts, allowNewFolders: e.target.checked })} />
                允许新建文件夹，放在
                <select
                  value={opts.newFolderParentId}
                  onChange={e => setOpts({ ...opts, newFolderParentId: e.target.value })}
                  className="h-7 px-2 rounded-lg bg-white/8 border border-white/15 text-[color:var(--text)] outline-none"
                >
                  {roots.map(f => <option key={f.id} value={f.id} className="bg-[#1b1d23]">{f.title}</option>)}
                </select>
              </label>
              <span className="flex items-center gap-1.5">方式
                <button className={seg(!useAI)} onClick={() => setUseAI(false)}>本地分析</button>
                <button className={seg(useAI)} onClick={() => setUseAI(true)} disabled={!aiReady} title={aiReady ? '' : '在设置里配置 AI 后可用'}>
                  <Sparkles size={11} className="inline -mt-0.5 mr-1" />AI 规划
                </button>
              </span>
              {useAI && (
                <button onClick={generate} disabled={busy === 'planning'} className="h-8 px-3 rounded-[10px] text-[12px] bg-[color:var(--ai)] text-[#0c1a26] disabled:opacity-60">
                  {busy === 'planning' ? <Loader2 size={12} className="inline animate-spin" /> : '让 AI 生成方案'}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-2 border-t border-white/8">
              {error && <p className="m-3 text-[13px] text-[color:var(--warn)]">{error}</p>}
              {busy === 'planning' && <p className="m-6 text-center text-[13px] text-[color:var(--muted)]"><Loader2 size={14} className="inline animate-spin mr-2" />正在分析……</p>}
              {plan && !busy && groups.length === 0 && (
                <p className="m-8 text-center text-[13px] text-[color:var(--muted)] leading-relaxed">
                  {plan.candidates === 0 ? '没有散落的书签，已经很整齐了。' : `检查了 ${plan.candidates} 个书签，没有找到把握足够的去处。可以试试"AI 规划"，或先给书签打上标签。`}
                </p>
              )}
              {groups.map(g => {
                const ids = g.moves.map(m => m.bookmarkId);
                const all = ids.every(id => checked.has(id));
                return (
                  <section key={g.target} className="mt-3">
                    <label className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
                      <input type="checkbox" className="accent-sky-300" checked={all} onChange={e => toggle(ids, e.target.checked)} />
                      {g.isNew ? <FolderPlus size={14} className="text-[color:var(--warn)]" /> : <FolderInput size={14} className="text-[color:var(--muted)]" />}
                      <span className="text-[13px] text-[color:var(--text)]">{g.target}</span>
                      {g.isNew && <span className="text-[11px] px-1.5 rounded bg-[color:var(--warn)]/15 text-[color:var(--warn)]">新建</span>}
                      <span className="text-[12px] text-[color:var(--muted)]">{g.moves.length} 个</span>
                    </label>
                    <ul className="flex flex-col">
                      {g.moves.map(m => (
                        <li key={m.bookmarkId}>
                          <label className="flex items-center gap-2.5 pl-8 pr-2 py-1.5 rounded-[10px] hover:bg-white/5 cursor-pointer">
                            <input type="checkbox" className="accent-sky-300" checked={checked.has(m.bookmarkId)} onChange={e => toggle([m.bookmarkId], e.target.checked)} />
                            {faviconUrl(m.url, 32) ? <img src={faviconUrl(m.url, 32)} alt="" className="w-4 h-4" /> : <span className="w-4 h-4 rounded bg-white/10 text-[9px] leading-4 text-center text-[color:var(--muted)]">{m.title[0]}</span>}
                            <span className="truncate text-[13px] text-[color:var(--text)] flex-1">{m.title}</span>
                            <span className="shrink-0 text-[11px] text-[color:var(--muted)] flex items-center gap-1">
                              {m.fromPath.slice(-1)[0] || '根目录'} <ChevronRight size={10} /> {m.reason}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            <footer className="flex items-center gap-3 p-4 border-t border-white/8">
              <p className="flex-1 text-[12px] text-[color:var(--muted)] leading-relaxed">
                {plan ? <>将移动 <b className="text-[color:var(--text)]">{chosen.length}</b> 个书签{newFolderCount ? `，新建 ${newFolderCount} 个文件夹` : ''}{plan.unresolved ? `；${plan.unresolved} 个没找到合适位置，保持不动` : ''}</> : ' '}
              </p>
              <button onClick={onClose} className="h-9 px-4 rounded-[10px] text-[14px] text-[color:var(--muted)] hover:bg-white/8">取消</button>
              <button
                onClick={run}
                disabled={!chosen.length || !!busy}
                className="h-9 px-4 rounded-[10px] text-[14px] bg-[color:var(--warn)] text-[#2a1c02] disabled:opacity-40 flex items-center gap-1.5"
              >
                {busy === 'running' ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />} 移动 {chosen.length} 个书签
              </button>
            </footer>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 border-t border-white/8">
            {!logs.length && <p className="m-8 text-center text-[13px] text-[color:var(--muted)]">还没有整理记录。</p>}
            {logs.map(l => (
              <div key={l.id} className="flex items-start gap-3 px-3 py-3 rounded-[12px] hover:bg-white/5">
                <span className={`mt-0.5 text-[11px] px-1.5 rounded ${l.kind === 'auto' ? 'bg-sky-400/15 text-sky-200' : 'bg-white/10 text-[color:var(--muted)]'}`}>{l.kind === 'auto' ? '自动' : '手动'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[color:var(--text)]">
                    {new Date(l.at).toLocaleString()}：移动了 {l.moves.length} 个书签{l.createdFolders.length ? `，新建 ${l.createdFolders.length} 个文件夹` : ''}
                    {l.undone && <span className="ml-2 text-[color:var(--muted)]">（已撤销）</span>}
                  </p>
                  <p className="text-[12px] text-[color:var(--muted)] truncate">{l.moves.slice(0, 4).map(m => `${m.title} → ${m.toTitle}`).join('；')}{l.moves.length > 4 ? '……' : ''}</p>
                </div>
                {!l.undone && (
                  <button onClick={() => undo(l.id)} className="shrink-0 h-8 px-3 rounded-[10px] text-[12px] bg-white/10 hover:bg-white/15 text-[color:var(--text)] flex items-center gap-1"><Undo2 size={12} /> 撤销</button>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default OrganizePanel;
