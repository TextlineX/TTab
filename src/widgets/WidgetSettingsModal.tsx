import React from 'react';
import Modal from './Modal';
import { SIZE_LABEL, type BuiltinWidget, type CustomWidgetDef, type WidgetHost, type WidgetInstance, type WidgetSize } from './types';
import Segmented from '../ui/Segmented';
import Checkbox from '../ui/Checkbox';
import Select from '../ui/Select';

interface Props {
  instance: WidgetInstance;
  builtin?: BuiltinWidget;
  custom?: CustomWidgetDef;
  host: WidgetHost;
  onChange: (patch: Partial<WidgetInstance>) => void;
  onEditCode: (def: CustomWidgetDef) => void;
  onClose: () => void;
}

const field = 'h-9 px-3 rounded-[10px] bg-fill-2 border border-line-strong outline-none text-[13px] text-fg';

/** 小组件设置：尺寸 + 内置组件自己的设置 / 自定义组件按 config 字段自动生成的表单 */
const WidgetSettingsModal: React.FC<Props> = ({ instance, builtin, custom, host, onChange, onEditCode, onClose }) => {
  const sizes: WidgetSize[] = builtin?.sizes || custom?.sizes || ['s'];
  const cfg = { ...(builtin?.defaultConfig || {}), ...Object.fromEntries((custom?.config || []).map(f => [f.key, f.default])), ...instance.config };
  const setConfig = (patch: Record<string, unknown>) => onChange({ config: { ...instance.config, ...patch } });
  return (
    <Modal title={`${builtin?.name || custom?.name || '小组件'}设置`} onClose={onClose} width={460}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
          尺寸
          <Segmented size="sm" ariaLabel="尺寸" value={instance.size} onChange={s => onChange({ size: s })} options={sizes.map(s => ({ value: s, label: SIZE_LABEL[s] }))} />
        </div>
        {builtin?.Settings && <builtin.Settings config={cfg} setConfig={setConfig} host={host} />}
        {custom?.config?.map(f => (
          <label key={f.key} className={`flex ${f.type === 'boolean' ? 'items-center gap-2' : 'flex-col gap-1.5'} text-[12px] text-muted`}>
            {f.type === 'boolean' && <Checkbox checked={!!cfg[f.key]} onChange={v => setConfig({ [f.key]: v })} ariaLabel={f.label} />}
            {f.label}
            {f.type === 'text' && <input className={field} value={String(cfg[f.key] ?? '')} onChange={e => setConfig({ [f.key]: e.target.value })} />}
            {f.type === 'number' && <input type="number" className={field} value={Number(cfg[f.key] ?? 0)} onChange={e => setConfig({ [f.key]: Number(e.target.value) })} />}
            {f.type === 'select' && (
              <Select ariaLabel={f.label} value={String(cfg[f.key] ?? '')} onChange={v => setConfig({ [f.key]: v })} options={(f.options || []).map(o => ({ value: String(o.value), label: o.label }))} className="w-full" />
            )}
          </label>
        ))}
        {custom && (
          <button onClick={() => onEditCode(custom)} className="self-start h-8 px-3 rounded-[10px] text-[12px] bg-fill-2 hover:bg-fill-3 text-fg">在小组件工作室里编辑代码</button>
        )}
        {!builtin?.Settings && !custom?.config?.length && !custom && <p className="text-[12px] text-muted">这个小组件没有其他设置。</p>}
      </div>
    </Modal>
  );
};

export default WidgetSettingsModal;
