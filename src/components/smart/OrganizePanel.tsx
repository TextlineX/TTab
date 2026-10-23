import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderInput, FolderPlus, Sparkles, Loader2, Undo2, History, ChevronRight } from 'lucide-react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import Segmented from '../../ui/Segmented';
import Select from '../../ui/Select';
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

  const footer = tab === 'plan' ? (
    <>
      <p className="mr-auto text-[12.5px] text-muted leading-relaxed">
        {plan ? <>将移动 <b className="text-fg">{chosen.length}</b> 个书签{newFolderCount ? `，新建 ${newFolderCount} 个文件夹` : ''}{plan.unresolved ? `；${plan.unresolved} 个没找到合适位置，保持不动` : ''}</> : ' '}
      </p>
      <Button variant="ghost" onClick={onClose}>取消</Button>
      <Button variant="warn" onClick={() => void run()} disabled={!chosen.length || !!busy}
        icon={busy === 'running' ? <Loader2 size={15} className="animate-spin" /> : <FolderInput size={15} />}>
        移动 {chosen.length} 个书签
      </Button>
    </>
  ) : undefined;

  return (
    <Modal
      title="整理书签"
      subtitle="把书签放进合适的文件夹。会修改浏览器里的真实书签：执行前可以逐个取消，执行后可以整次撤销。"
      icon={<span className="w-9 h-9 rounded-xl bg-warn-soft text-warn flex items-center justify-center"><FolderInput size={18} /></span>}
      onClose={onClose}
      width={780}
      bare
      footer={footer}
      headerExtra={
        <Segmented size="sm" ariaLabel="整理视图" value={tab} onChange={setTab} options={[
          { value: 'plan', label: '整理方案' },
          { value: 'history', label: '整理记录', icon: <History size={13} /> },
        ]} />
      }
    >
      {tab === 'plan' ? (
        <>
          <div className="mx-6 mb-3 p-3 rounded-2xl bg-fill-1 border border-line grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">范围</span>
              <Segmented size="sm" full ariaLabel="整理范围" value={opts.scope} onChange={scope => setOpts({ ...opts, scope })} options={[
                { value: 'loose', label: '只整理散落的' },
                { value: 'all', label: '也检查放错的' },
              ]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">方式</span>
              <div className="flex items-center gap-2">
                <Segmented size="sm" full ariaLabel="整理方式" value={useAI ? 'ai' : 'local'} onChange={v => setUseAI(v === 'ai' && aiReady)} options={[
                  { value: 'local', label: '本地分析' },
                  { value: 'ai', label: 'AI 规划', icon: <Sparkles size={12} />, title: aiReady ? '' : '在设置里配置 AI 后可用' },
                ]} />
                {useAI && (
                  <Button size="sm" variant="ai" onClick={() => void generate()} disabled={busy === 'planning'}
                    icon={busy === 'planning' ? <Loader2 size={13} className="animate-spin" /> : undefined}>生成方案</Button>
                )}
              </div>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <Checkbox checked={opts.allowNewFolders} onChange={v => setOpts({ ...opts, allowNewFolders: v })} label="允许新建文件夹" />
              {opts.allowNewFolders && roots.length > 0 && (
                <>
                  <span className="text-[13px] text-muted">放在</span>
                  <Select size="sm" ariaLabel="新文件夹的位置" value={opts.newFolderParentId} onChange={v => setOpts({ ...opts, newFolderParentId: v })}
                    options={roots.map(f => ({ value: f.id, label: f.title }))} minWidth={160} />
                </>
              )}
            </div>
          </div>

          <div className="px-4 pb-4 border-t border-line">
            {error && <p className="m-3 text-[13px] text-warn">{error}</p>}
            {busy === 'planning' && <p className="m-8 text-center text-[13px] text-muted"><Loader2 size={15} className="inline animate-spin mr-2" />正在分析……</p>}
            {plan && !busy && groups.length === 0 && (
              <p className="m-10 text-center text-[13.5px] text-muted leading-relaxed">
                {plan.candidates === 0 ? '没有散落的书签，已经很整齐了。' : `检查了 ${plan.candidates} 个书签，没有找到把握足够的去处。可以试试「AI 规划」，或先给书签打上标签。`}
              </p>
            )}
            {groups.map(g => {
              const ids = g.moves.map(m => m.bookmarkId);
              const n = ids.filter(id => checked.has(id)).length;
              return (
                <section key={g.target} className="mt-3 rounded-2xl border border-line overflow-hidden">
                  <label className="flex items-center gap-2.5 px-3 py-2.5 bg-fill-1 cursor-pointer">
                    <Checkbox checked={n === ids.length} indeterminate={n > 0 && n < ids.length} onChange={v => toggle(ids, v)} ariaLabel={`选择 ${g.target}`} />
                    {g.isNew ? <FolderPlus size={15} className="text-warn" /> : <FolderInput size={15} className="text-muted" />}
                    <span className="text-[13.5px] font-medium text-fg truncate">{g.target}</span>
                    {g.isNew && <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-warn-soft text-warn">新建</span>}
                    <span className="ml-auto text-[12px] text-muted">{n}/{g.moves.length}</span>
                  </label>
                  <ul className="flex flex-col py-1">
                    {g.moves.map(m => (
                      <li key={m.bookmarkId}>
                        <label className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-fill-1 cursor-pointer">
                          <Checkbox checked={checked.has(m.bookmarkId)} onChange={v => toggle([m.bookmarkId], v)} ariaLabel={m.title} />
                          {faviconUrl(m.url, 32) ? <img src={faviconUrl(m.url, 32)} alt="" className="w-4 h-4 shrink-0" /> : <span className="w-4 h-4 shrink-0 rounded bg-fill-2 text-[9px] leading-4 text-center text-muted">{m.title[0]}</span>}
                          <span className="truncate text-[13px] text-fg flex-1">{m.title}</span>
                          <span className="hidden sm:flex shrink-0 max-w-[45%] text-[11.5px] text-faint items-center gap-1 truncate">
                            {m.fromPath.slice(-1)[0] || '根目录'} <ChevronRight size={11} /> {m.reason}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="px-4 pb-4 border-t border-line">
          {!logs.length && <p className="m-10 text-center text-[13.5px] text-muted">还没有整理记录。</p>}
          {logs.map(l => (
            <div key={l.id} className="flex items-start gap-3 px-3 py-3 mt-1 rounded-xl hover:bg-fill-1">
              <span className={`mt-0.5 text-[11px] px-1.5 py-0.5 rounded-md ${l.kind === 'auto' ? 'bg-accent-soft text-accent-text' : 'bg-fill-2 text-muted'}`}>{l.kind === 'auto' ? '自动' : '手动'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-fg">
                  {new Date(l.at).toLocaleString()}：移动了 {l.moves.length} 个书签{l.createdFolders.length ? `，新建 ${l.createdFolders.length} 个文件夹` : ''}
                  {l.undone && <span className="ml-2 text-muted">（已撤销）</span>}
                </p>
                <p className="text-[12px] text-muted truncate">{l.moves.slice(0, 4).map(m => `${m.title} → ${m.toTitle}`).join('；')}{l.moves.length > 4 ? '……' : ''}</p>
              </div>
              {!l.undone && <Button size="sm" onClick={() => void undo(l.id)} icon={<Undo2 size={13} />}>撤销</Button>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default OrganizePanel;
