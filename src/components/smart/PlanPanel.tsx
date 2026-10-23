import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, AlertTriangle, X } from 'lucide-react';
import type { ResolvedAction } from '../../core/ai/actions';

export type PlanState =
  | { status: 'thinking'; command: string }
  | { status: 'ready'; command: string; reply: string; actions: ResolvedAction[] }
  | { status: 'error'; command: string; error: string };

interface Props {
  plan: PlanState;
  onApply: (actions: ResolvedAction[]) => void;
  onCancel: () => void;
  onRetry: () => void;
}

/** AI 提议的动作预览：用户勾选后才执行 */
const PlanPanel: React.FC<Props> = ({ plan, onApply, onCancel, onRetry }) => {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (plan.status === 'ready') setChecked(new Set(plan.actions.filter(a => a.defaultChecked).map(a => a.id)));
  }, [plan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toggle = (id: string) => setChecked(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const chosen = plan.status === 'ready' ? plan.actions.filter(a => checked.has(a.id)) : [];

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center pt-[12vh] px-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="absolute inset-0 bg-black/50" />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}
        className="tt-plan relative w-full max-w-[560px] rounded-[20px] overflow-hidden"
        role="dialog" aria-label="AI 操作预览"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 w-8 h-8 rounded-full bg-[color:var(--ai)]/15 text-[color:var(--ai)] flex items-center justify-center shrink-0">
            {plan.status === 'thinking' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[color:var(--muted)] truncate">“{plan.command}”</p>
            <p className="text-[15px] text-[color:var(--text)] mt-1 leading-relaxed">
              {plan.status === 'thinking' && '正在理解你的书签……'}
              {plan.status === 'ready' && (plan.reply || (plan.actions.length ? '我准备这样做：' : '没有找到可以执行的操作。'))}
              {plan.status === 'error' && plan.error}
            </p>
          </div>
          <button onClick={onCancel} aria-label="关闭" className="p-1.5 rounded-lg hover:bg-white/10 text-[color:var(--muted)]"><X size={16} /></button>
        </div>

        {plan.status === 'ready' && plan.actions.length > 0 && (
          <ul className="max-h-[46vh] overflow-y-auto px-3 pb-2 flex flex-col gap-1">
            {plan.actions.map(a => (
              <li key={a.id}>
                <label className={`flex items-start gap-3 px-3 py-2.5 rounded-[12px] cursor-pointer hover:bg-white/5 ${a.touchesBrowser ? 'bg-[color:var(--warn)]/6' : ''}`}>
                  <input type="checkbox" checked={checked.has(a.id)} onChange={() => toggle(a.id)} className="mt-1 accent-sky-300 w-4 h-4" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-[color:var(--text)]">{a.label}</span>
                    {a.detail && <span className="block text-[12px] text-[color:var(--muted)] mt-0.5 line-clamp-2">{a.detail}</span>}
                    {a.touchesBrowser && (
                      <span className="flex items-center gap-1 text-[12px] text-[color:var(--warn)] mt-1">
                        <AlertTriangle size={12} /> 会修改浏览器里的真实书签，默认不勾选
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/8">
          {plan.status === 'error' && <button onClick={onRetry} className="h-9 px-4 rounded-[10px] text-[14px] text-[color:var(--text)] hover:bg-white/8">重试</button>}
          <button onClick={onCancel} className="h-9 px-4 rounded-[10px] text-[14px] text-[color:var(--muted)] hover:bg-white/8">取消</button>
          {plan.status === 'ready' && plan.actions.length > 0 && (
            <button
              onClick={() => onApply(chosen)}
              disabled={!chosen.length}
              className="h-9 px-4 rounded-[10px] text-[14px] bg-[color:var(--ai)] text-[#0c1a26] disabled:opacity-40"
            >
              执行 {chosen.length} 项
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default PlanPanel;
