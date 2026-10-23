import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, AlertTriangle, X } from 'lucide-react';
import type { ResolvedAction } from '../../core/ai/actions';
import Checkbox from '../../ui/Checkbox';
import { fade, pop } from '../../ui/motion';

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
      <motion.div variants={fade} initial="hidden" animate="show" exit="exit" onClick={onCancel} className="absolute inset-0 bg-[color:var(--scrim)] backdrop-blur-[3px]" />
      <motion.div
        variants={pop} initial="hidden" animate="show" exit="exit"
        className="tt-raised relative w-full max-w-[600px] rounded-[22px] overflow-hidden"
        role="dialog" aria-label="AI 操作预览"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="mt-0.5 w-8 h-8 rounded-full bg-ai-soft text-ai flex items-center justify-center shrink-0">
            {plan.status === 'thinking' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted truncate">“{plan.command}”</p>
            <p className="text-[15px] text-fg mt-1 leading-relaxed">
              {plan.status === 'thinking' && '正在理解你的书签……'}
              {plan.status === 'ready' && (plan.reply || (plan.actions.length ? '我准备这样做：' : '没有找到可以执行的操作。'))}
              {plan.status === 'error' && plan.error}
            </p>
          </div>
          <button onClick={onCancel} aria-label="关闭" className="p-1.5 rounded-lg hover:bg-fill-2 text-muted"><X size={16} /></button>
        </div>

        {plan.status === 'ready' && plan.actions.length > 0 && (
          <ul className="max-h-[46vh] overflow-y-auto px-3 pb-2 flex flex-col gap-1">
            {plan.actions.map(a => (
              <li key={a.id}>
                <label className={`flex items-start gap-3 px-3 py-2.5 rounded-[12px] cursor-pointer hover:bg-fill-1 ${a.touchesBrowser ? 'bg-warn-soft' : ''}`}>
                  <Checkbox checked={checked.has(a.id)} onChange={() => toggle(a.id)} ariaLabel={a.label} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-fg">{a.label}</span>
                    {a.detail && <span className="block text-[12px] text-muted mt-0.5 line-clamp-2">{a.detail}</span>}
                    {a.touchesBrowser && (
                      <span className="flex items-center gap-1 text-[12px] text-warn mt-1">
                        <AlertTriangle size={12} /> 会修改浏览器里的真实书签，默认不勾选
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 p-4 border-t border-line">
          {plan.status === 'error' && <button onClick={onRetry} className="h-9 px-4 rounded-[10px] text-[14px] text-fg hover:bg-fill-2">重试</button>}
          <button onClick={onCancel} className="h-9 px-4 rounded-[10px] text-[14px] text-muted hover:bg-fill-2">取消</button>
          {plan.status === 'ready' && plan.actions.length > 0 && (
            <button
              onClick={() => onApply(chosen)}
              disabled={!chosen.length}
              className="h-9 px-4 rounded-[10px] text-[14px] bg-ai text-on-ai disabled:opacity-40"
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
