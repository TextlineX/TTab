import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Plus, Settings2, Trash2, GripVertical, Puzzle } from 'lucide-react';
import { useWidgetBoard, newWidgetId, removeWidgetData } from './store';
import { getBuiltin } from './registry';
import WidgetFrame from './WidgetFrame';
import WidgetGallery from './WidgetGallery';
import WidgetSettingsModal from './WidgetSettingsModal';
import WidgetStudio from './WidgetStudio';
import { SIZE_LABEL, type CustomWidgetDef, type WidgetHost, type WidgetInstance, type WidgetSize } from './types';

interface Props {
  host: WidgetHost;
}

const SPAN: Record<WidgetSize, string> = {
  s: 'col-span-1 row-span-1',
  m: 'col-span-2 row-span-1',
  l: 'col-span-2 row-span-2',
  w: 'col-span-2 lg:col-span-4 row-span-1',
};

/** 小组件看板：显示、排序（拖动）、改尺寸、设置、删除、添加 */
const WidgetBoard: React.FC<Props> = ({ host }) => {
  const { board, customDefs, update, installCustom, uninstallCustom } = useWidgetBoard();
  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [studio, setStudio] = useState<{ def?: CustomWidgetDef } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  if (!board) return null;
  const instances = board.instances;
  const customOf = (type: string) => (type.startsWith('custom:') ? customDefs.find(d => `custom:${d.id}` === type) : undefined);

  const add = (inst: Omit<WidgetInstance, 'id'>) => {
    update(list => [...list, { ...inst, id: newWidgetId() }]);
    setGallery(false);
    setEditing(true);
  };
  const patch = (id: string, p: Partial<WidgetInstance>) => update(list => list.map(i => (i.id === id ? { ...i, ...p } : i)));
  const remove = (id: string) => { update(list => list.filter(i => i.id !== id)); void removeWidgetData(id); };
  const cycleSize = (inst: WidgetInstance, sizes: WidgetSize[]) => {
    const next = sizes[(sizes.indexOf(inst.size) + 1) % sizes.length];
    patch(inst.id, { size: next });
  };
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    update(list => {
      const from = list.findIndex(i => i.id === dragId);
      const to = list.findIndex(i => i.id === targetId);
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragId(null);
  };

  const settingsInst = instances.find(i => i.id === settingsId);

  return (
    <section aria-label="小组件" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <h2 className="text-[14px] text-muted">小组件</h2>
        <div className="ml-auto flex items-center gap-3 text-[12px] text-muted">
          {editing && <button onClick={() => setGallery(true)} className="flex items-center gap-1 hover:text-fg"><Plus size={13} /> 添加</button>}
          <button onClick={() => setEditing(e => !e)} className={editing ? 'text-fg' : 'hover:text-fg'}>{editing ? '完成' : '编辑'}</button>
        </div>
      </div>

      <div className="tt-widget-grid grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {instances.map(inst => {
          const builtin = getBuiltin(inst.type);
          const custom = customOf(inst.type);
          const sizes = builtin?.sizes || custom?.sizes || [inst.size];
          const config = { ...(builtin?.defaultConfig || {}), ...Object.fromEntries((custom?.config || []).map(f => [f.key, f.default])), ...inst.config };
          return (
            <div
              key={inst.id}
              className={`tt-widget relative rounded-[16px] overflow-hidden ${SPAN[inst.size]} ${editing ? 'tt-widget-editing' : ''} ${dragId === inst.id ? 'opacity-40' : ''}`}
              draggable={editing}
              onDragStart={e => { setDragId(inst.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => { if (editing) e.preventDefault(); }}
              onDrop={() => drop(inst.id)}
              onDragEnd={() => setDragId(null)}
            >
              {builtin ? (
                <builtin.Component instance={inst} config={config} setConfig={p => patch(inst.id, { config: { ...inst.config, ...p } })} host={host} />
              ) : custom ? (
                <WidgetFrame def={custom} instanceId={inst.id} size={inst.size} config={config} host={host} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-1 text-[12px] text-muted"><Puzzle size={18} />这个小组件已被卸载</div>
              )}
              {editing && (
                <div className="absolute inset-0 bg-[color:var(--scrim)] backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
                  <GripVertical size={16} className="text-muted" aria-hidden />
                  <div className="flex items-center gap-1">
                    {sizes.length > 1 && (
                      <button onClick={() => cycleSize(inst, sizes)} title="切换尺寸" className="h-8 px-2.5 rounded-[10px] bg-fill-3 hover:bg-fill-3 text-[12px] text-fg">{SIZE_LABEL[inst.size]}</button>
                    )}
                    {(builtin?.Settings || custom) && (
                      <button onClick={() => setSettingsId(inst.id)} aria-label="设置" className="h-8 w-8 rounded-[10px] bg-fill-3 hover:bg-fill-3 flex items-center justify-center text-fg"><Settings2 size={14} /></button>
                    )}
                    <button onClick={() => remove(inst.id)} aria-label="删除" className="h-8 w-8 rounded-[10px] bg-fill-3 hover:bg-[color:var(--danger)]/12 flex items-center justify-center text-fg"><Trash2 size={14} /></button>
                  </div>
                  <span className="text-[11px] text-muted">{builtin?.name || custom?.name}，拖动可排序</span>
                </div>
              )}
            </div>
          );
        })}
        {(editing || !instances.length) && (
          <button onClick={() => setGallery(true)} className="col-span-1 row-span-1 rounded-[16px] border border-dashed border-line-strong hover:border-line-strong text-[13px] text-muted hover:text-fg flex flex-col items-center justify-center gap-1">
            <Plus size={18} /> 添加小组件
          </button>
        )}
      </div>

      <AnimatePresence>
        {gallery && (
          <WidgetGallery
            key="gallery"
            customDefs={customDefs}
            onAddBuiltin={w => add({ type: w.type, size: w.defaultSize, config: {} })}
            onAddCustom={d => add({ type: `custom:${d.id}`, size: d.defaultSize, config: {} })}
            onInstall={installCustom}
            onUninstall={id => { void uninstallCustom(id); }}
            onOpenStudio={def => { setGallery(false); setStudio({ def }); }}
            onClose={() => setGallery(false)}
          />
        )}
        {settingsInst && (
          <WidgetSettingsModal
            key="settings"
            instance={settingsInst}
            builtin={getBuiltin(settingsInst.type)}
            custom={customOf(settingsInst.type)}
            host={host}
            onChange={p => patch(settingsInst.id, p)}
            onEditCode={def => { setSettingsId(null); setStudio({ def }); }}
            onClose={() => setSettingsId(null)}
          />
        )}
        {studio && (
          <WidgetStudio
            key="studio"
            initial={studio.def}
            host={host}
            onSave={async def => {
              await installCustom(def);
              // 新的小组件自动加到看板上
              if (!instances.some(i => i.type === `custom:${def.id}`)) update(list => [...list, { id: newWidgetId(), type: `custom:${def.id}`, size: def.defaultSize, config: {} }]);
            }}
            onClose={() => setStudio(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
};

export default WidgetBoard;
