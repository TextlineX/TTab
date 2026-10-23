import React from 'react';
import Modal from './Modal';
import { SIZE_LABEL, type BuiltinWidget, type CustomWidgetDef, type WidgetHost, type WidgetInstance, type WidgetSize } from './types';

interface Props {
  instance: WidgetInstance;
  builtin?: BuiltinWidget;
  custom?: CustomWidgetDef;
  host: WidgetHost;
  onChange: (patch: Partial<WidgetInstance>) => void;
  onEditCode: (def: CustomWidgetDef) => void;
  onClose: () => void;
}

const field = 'h-9 px-3 rounded-[10px] bg-white/8 border border-white/15 outline-none text-[13px] text-[color:var(--text)]';

/** 小组件设置：尺寸 + 内置组件自己的设置 / 自定义组件按 config 字段自动生成的表单 */
const WidgetSettingsModal: React.FC<Props> = ({ instance, builtin, custom, host, onChange, onEditCode, onClose }) => {
  const sizes: WidgetSize[] = builtin?.sizes || custom?.sizes || ['s'];
  const cfg = { ...(builtin?.defaultConfig || {}), ...Object.fromEntries((custom?.config || []).map(f => [f.key, f.default])), ...instance.config };
  const setConfig = (patch: Record<string, unknown>) => onChange({ config: { ...instance.config, ...patch } });
  return (
    <Modal title={`${builtin?.name || custom?.name || '小组件'}设置`} onClose={onClose} width={460}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--muted)]">
          尺寸
          {sizes.map(s => (
            <button key={s} onClick={() => onChange({ size: s })} className={`h-8 px-3 rounded-[10px] border ${instance.size === s ? 'bg-white/12 border-white/25 text-[color:var(--text)]' : 'border-white/10 hover:text-[color:var(--text)]'}`}>{SIZE_LABEL[s]}</button>
          ))}
        </div>
        {builtin?.Settings && <builtin.Settings config={cfg} setConfig={setConfig} host={host} />}
        {custom?.config?.map(f => (
          <label key={f.key} className={`flex ${f.type === 'boolean' ? 'items-center gap-2' : 'flex-col gap-1.5'} text-[12px] text-[color:var(--muted)]`}>
            {f.type === 'boolean' && <input type="checkbox" className="accent-sky-300" checked={!!cfg[f.key]} onChange={e => setConfig({ [f.key]: e.target.checked })} />}
            {f.label}
            {f.type === 'text' && <input className={field} value={String(cfg[f.key] ?? '')} onChange={e => setConfig({ [f.key]: e.target.value })} />}
            {f.type === 'number' && <input type="number" className={field} value={Number(cfg[f.key] ?? 0)} onChange={e => setConfig({ [f.key]: Number(e.target.value) })} />}
            {f.type === 'select' && (
              <select className={field} value={String(cfg[f.key] ?? '')} onChange={e => setConfig({ [f.key]: e.target.value })}>
                {f.options?.map(o => <option key={o.value} value={o.value} className="bg-[#1b1d23]">{o.label}</option>)}
              </select>
            )}
          </label>
        ))}
        {custom && (
          <button onClick={() => onEditCode(custom)} className="self-start h-8 px-3 rounded-[10px] text-[12px] bg-white/10 hover:bg-white/15 text-[color:var(--text)]">在小组件工作室里编辑代码</button>
        )}
        {!builtin?.Settings && !custom?.config?.length && !custom && <p className="text-[12px] text-[color:var(--muted)]">这个小组件没有其他设置。</p>}
      </div>
    </Modal>
  );
};

export default WidgetSettingsModal;
