import React, { useState } from 'react';
import { Plus, Code2, Upload, Download, Trash2, Pencil, Puzzle, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import { BUILTIN_WIDGETS } from './registry';
import type { BuiltinWidget, CustomWidgetDef } from './types';
import { describePermission, exportWidgetFile, hostPatternsFor, parseWidgetFile } from './sdk/validate';
import { requestOrigins } from './permissions';

interface Props {
  customDefs: CustomWidgetDef[];
  onAddBuiltin: (w: BuiltinWidget) => void;
  onAddCustom: (def: CustomWidgetDef) => void;
  onInstall: (def: CustomWidgetDef) => Promise<void>;
  onUninstall: (id: string) => void;
  onOpenStudio: (def?: CustomWidgetDef) => void;
  onClose: () => void;
}

export function downloadWidget(def: CustomWidgetDef) {
  const blob = new Blob([exportWidgetFile(def)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${def.id}.ttwidget.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 安装前展示权限，确认后才安装 */
export const InstallConfirm: React.FC<{ def: CustomWidgetDef; onCancel: () => void; onConfirm: () => void }> = ({ def, onCancel, onConfirm }) => (
  <Modal
    title={`安装「${def.name}」？`}
    subtitle={[def.author && `作者：${def.author}`, `版本 ${def.version}`].filter(Boolean).join('，')}
    onClose={onCancel}
    width={460}
    footer={<>
      <button onClick={onCancel} className="h-9 px-4 rounded-[10px] text-[14px] text-muted hover:bg-fill-2">取消</button>
      <button onClick={onConfirm} className="h-9 px-4 rounded-[10px] text-[14px] bg-accent text-on-accent">安装并添加</button>
    </>}
  >
    {def.description && <p className="text-[13px] text-fg mb-3">{def.description}</p>}
    <p className="text-[12px] text-muted mb-2 flex items-center gap-1.5"><ShieldCheck size={13} /> 它在隔离的沙箱里运行，只能做下面这些事：</p>
    <ul className="flex flex-col gap-1.5 text-[13px] text-fg">
      {def.permissions.length ? def.permissions.map(p => <li key={p} className="px-3 py-2 rounded-[10px] bg-fill-1">{describePermission(p)}</li>)
        : <li className="px-3 py-2 rounded-[10px] bg-fill-1">不需要任何权限（只显示内容）</li>}
    </ul>
  </Modal>
);

const WidgetGallery: React.FC<Props> = ({ customDefs, onAddBuiltin, onAddCustom, onInstall, onUninstall, onOpenStudio, onClose }) => {
  const [pending, setPending] = useState<CustomWidgetDef | null>(null);
  const [error, setError] = useState('');

  const addBuiltin = (w: BuiltinWidget) => {
    // 需要联网的内置小组件（天气）在这里申请对应网站的权限
    void requestOrigins(w.hostPermissions || []).then(ok => {
      if (ok) onAddBuiltin(w); else setError(`没有获得 ${w.name} 需要的网站访问权限`);
    });
  };

  const importFile = async (file: File) => {
    setError('');
    const r = parseWidgetFile(await file.text());
    if (!r.ok || !r.def) { setError(`导入失败：${r.errors.join('；')}`); return; }
    setPending(r.def);
  };

  const confirmInstall = () => {
    const def = pending!;
    void requestOrigins(hostPatternsFor(def)).then(async ok => {
      if (!ok) { setError('没有获得这个小组件需要的网站访问权限，已取消安装'); setPending(null); return; }
      await onInstall(def);
      onAddCustom(def);
      setPending(null);
    });
  };

  const card = 'flex items-start gap-3 p-3 rounded-[14px] bg-fill-1 border border-line';
  return (
    <>
      <Modal title="添加小组件" subtitle="内置小组件开箱即用；也可以自己写，或导入别人分享的小组件文件。" onClose={onClose} width={640}>
        {error && <p className="mb-3 text-[13px] text-warn">{error}</p>}
        <h3 className="text-[13px] text-muted mb-2">内置</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
          {BUILTIN_WIDGETS.map(w => (
            <div key={w.type} className={card}>
              <w.icon size={18} className="mt-0.5 text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-fg">{w.name}</p>
                <p className="text-[12px] text-muted leading-relaxed">{w.description}</p>
              </div>
              <button onClick={() => addBuiltin(w)} aria-label={`添加${w.name}`} className="shrink-0 h-8 w-8 rounded-[10px] bg-fill-2 hover:bg-fill-3 flex items-center justify-center text-fg"><Plus size={15} /></button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] text-muted">自定义</h3>
          <div className="flex gap-1.5">
            <button onClick={() => onOpenStudio()} className="h-8 px-3 rounded-[10px] text-[12px] bg-fill-2 hover:bg-fill-3 text-fg flex items-center gap-1.5"><Code2 size={13} /> 新建</button>
            <label className="h-8 px-3 rounded-[10px] text-[12px] bg-fill-2 hover:bg-fill-3 text-fg flex items-center gap-1.5 cursor-pointer">
              <Upload size={13} /> 导入文件
              <input type="file" accept=".json,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
            </label>
          </div>
        </div>
        {!customDefs.length && <p className="text-[12px] text-muted leading-relaxed">还没有自定义小组件。点"新建"打开小组件工作室，里面有番茄钟、随机书签、每日一句等示例可以直接改。</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {customDefs.map(d => (
            <div key={d.id} className={card}>
              <Puzzle size={18} className="mt-0.5 text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-fg truncate">{d.name} <span className="text-[11px] text-muted">{d.version}</span></p>
                <p className="text-[12px] text-muted truncate">{d.description || d.id}</p>
                <div className="flex gap-0.5 mt-1 -ml-1.5">
                  <button onClick={() => onOpenStudio(d)} title="编辑代码" className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-fill-2"><Pencil size={13} /></button>
                  <button onClick={() => downloadWidget(d)} title="导出分享" className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-fill-2"><Download size={13} /></button>
                  <button onClick={() => { if (confirm(`卸载「${d.name}」？已添加的实例也会移除。`)) onUninstall(d.id); }} title="卸载" className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-[color:var(--danger)]/12"><Trash2 size={13} /></button>
                </div>
              </div>
              <button onClick={() => onAddCustom(d)} aria-label={`添加${d.name}`} className="shrink-0 h-8 w-8 rounded-[10px] bg-fill-2 hover:bg-fill-3 flex items-center justify-center text-fg"><Plus size={15} /></button>
            </div>
          ))}
        </div>
      </Modal>
      {pending && <InstallConfirm def={pending} onCancel={() => setPending(null)} onConfirm={confirmInstall} />}
    </>
  );
};

export default WidgetGallery;
