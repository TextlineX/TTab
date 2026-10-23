import React, { useEffect, useMemo, useState } from 'react';
import { Play, Save, Download, BookOpen } from 'lucide-react';
import Modal from './Modal';
import WidgetFrame from './WidgetFrame';
import { TEMPLATES } from './templates';
import { SIZE_LABEL, type CustomWidgetDef, type WidgetHost, type WidgetSize } from './types';
import { hostPatternsFor, validateWidgetDef } from './sdk/validate';
import { downloadWidget } from './WidgetGallery';
import { requestOrigins } from './permissions';
import Checkbox from '../ui/Checkbox';
import Select from '../ui/Select';

interface Props {
  initial?: CustomWidgetDef;
  host: WidgetHost;
  onSave: (def: CustomWidgetDef) => Promise<void>;
  onClose: () => void;
}

const SIZES: WidgetSize[] = ['s', 'm', 'l', 'w'];
const PREVIEW_PX: Record<WidgetSize, [number, number]> = { s: [150, 132], m: [312, 132], l: [312, 274], w: [520, 132] };

const API_DOC = `ttab.config            当前配置（定义里的 config 字段）
ttab.size              当前尺寸 s / m / l / w
ttab.onConfigChange(fn) 配置变化时回调
ttab.onResize(fn)      尺寸变化时回调
ttab.notify(text)      在 TTab 底部提示

需要 storage 权限：
ttab.storage.get(key?) / ttab.storage.set(key, value)

需要 bookmarks 权限（只读）：
ttab.bookmarks.search('#前端 react', 10)
ttab.bookmarks.list({ tag, sort: 'frequent'|'recent'|'random', limit })
ttab.bookmarks.tags()

需要 open 权限：
ttab.open(url, background?)

需要 net:<域名> 权限（沙箱不能直接联网）：
ttab.fetch(url, { method, headers, body }) → { ok, status, text }
ttab.fetchJSON(url)

样式变量：var(--text) var(--muted) var(--ai) var(--warn)
html[data-size="l"] 可以按尺寸写样式`;

const field = 'h-8 px-2.5 rounded-[8px] bg-fill-2 border border-line outline-none text-[12px] text-fg';
const code = 'w-full h-full min-h-[220px] p-3 rounded-[10px] bg-[color:var(--bg)] border border-line focus:border-[color:var(--accent-line)] outline-none font-mono text-[12px] leading-[1.6] text-fg resize-none';

/** 小组件工作室：写 HTML/CSS/JS，实时预览，保存安装或导出分享 */
const WidgetStudio: React.FC<Props> = ({ initial, host, onSave, onClose }) => {
  const [def, setDef] = useState<CustomWidgetDef>(() => initial || { ...TEMPLATES[1].def, id: 'my.pomodoro', name: '我的番茄钟' });
  const [tab, setTab] = useState<'html' | 'css' | 'js' | 'config' | 'doc'>('js');
  const [previewSize, setPreviewSize] = useState<WidgetSize>(def.defaultSize);
  const [previewDef, setPreviewDef] = useState(def);
  const [runtimeError, setRuntimeError] = useState('');
  const [runId, setRunId] = useState(0);
  const [message, setMessage] = useState('');
  const [configText, setConfigText] = useState(() => JSON.stringify(def.config || [], null, 2));
  const [netText, setNetText] = useState(() => def.permissions.filter(p => p.startsWith('net:')).map(p => p.slice(4)).join('\n'));

  // 合并"联网域名"和"配置项"两个文本框的内容
  const assembled = useMemo<CustomWidgetDef>(() => {
    let config = def.config;
    try { config = JSON.parse(configText || '[]'); } catch { /* 校验时提示 */ }
    const base = def.permissions.filter(p => !p.startsWith('net:'));
    const nets = netText.split(/\s+/).map(s => s.trim()).filter(Boolean).map(h => `net:${h}` as const);
    return { ...def, config, permissions: [...base, ...nets] };
  }, [def, configText, netText]);

  const validation = useMemo(() => {
    const r = validateWidgetDef(assembled);
    try { JSON.parse(configText || '[]'); } catch { r.ok = false; r.errors = [...r.errors, '配置项不是有效的 JSON']; }
    return r;
  }, [assembled, configText]);

  // 停止输入 0.8 秒后自动刷新预览
  useEffect(() => {
    const t = setTimeout(() => { if (validation.ok && validation.def) { setPreviewDef(validation.def); setRuntimeError(''); } }, 800);
    return () => clearTimeout(t);
  }, [validation]);

  const set = (patch: Partial<CustomWidgetDef>) => setDef(d => ({ ...d, ...patch }));
  const togglePerm = (p: 'bookmarks' | 'open' | 'storage') => set({ permissions: def.permissions.includes(p) ? def.permissions.filter(x => x !== p) : [...def.permissions, p] });
  const toggleSize = (s: WidgetSize) => {
    const sizes = def.sizes.includes(s) ? def.sizes.filter(x => x !== s) : SIZES.filter(x => x === s || def.sizes.includes(x));
    set({ sizes, defaultSize: sizes.includes(def.defaultSize) ? def.defaultSize : sizes[0] });
  };
  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find(x => x.id === id);
    if (!t || !confirm('用模板替换当前代码？')) return;
    setDef({ ...t.def });
    setConfigText(JSON.stringify(t.def.config || [], null, 2));
    setNetText(t.def.permissions.filter(p => p.startsWith('net:')).map(p => p.slice(4)).join('\n'));
    setPreviewSize(t.def.defaultSize);
  };

  const save = () => {
    if (!validation.ok || !validation.def) return;
    const d = validation.def;
    void requestOrigins(hostPatternsFor(d)).then(async ok => {
      if (!ok) { setMessage('没有获得联网需要的网站权限，未保存'); return; }
      await onSave(d);
      setMessage(`已保存「${d.name}」${d.version}`);
    });
  };

  const [pw, ph] = PREVIEW_PX[previewSize];

  return (
    <Modal
      title="小组件工作室"
      subtitle="用 HTML、CSS、JavaScript 写自己的小组件。代码在隔离的沙箱里运行，只能使用下面勾选的权限。"
      onClose={onClose}
      width={1120}
      footer={<>
        <span className="mr-auto text-[12px] text-muted">{message || (validation.ok ? '' : validation.errors.join('；'))}</span>
        <button onClick={() => validation.def && downloadWidget(validation.def)} disabled={!validation.ok} className="h-9 px-3 rounded-[10px] text-[13px] text-fg hover:bg-fill-2 disabled:opacity-40 flex items-center gap-1.5"><Download size={14} /> 导出文件</button>
        <button onClick={save} disabled={!validation.ok} className="h-9 px-4 rounded-[10px] text-[13px] bg-accent text-on-accent disabled:opacity-40 flex items-center gap-1.5"><Save size={14} /> 保存并安装</button>
      </>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_520px] gap-5">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input className={field} value={def.name} onChange={e => set({ name: e.target.value })} placeholder="名称" aria-label="名称" />
            <input className={field} value={def.id} onChange={e => set({ id: e.target.value.trim() })} placeholder="作者.名称" aria-label="标识" />
            <input className={field} value={def.version} onChange={e => set({ version: e.target.value.trim() })} placeholder="1.0.0" aria-label="版本" />
            <Select ariaLabel="从模板开始" value="" placeholder="从模板开始…" onChange={v => loadTemplate(v)} options={TEMPLATES.map(t => ({ value: t.id, label: t.label }))} className="w-full" minWidth={180} />
          </div>
          <input className={field} value={def.description || ''} onChange={e => set({ description: e.target.value })} placeholder="一句话介绍" aria-label="介绍" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted">
            <span className="flex items-center gap-2">尺寸
              {SIZES.map(s => (
                <Checkbox key={s} checked={def.sizes.includes(s)} onChange={() => toggleSize(s)} label={SIZE_LABEL[s]} />
              ))}
            </span>
            <span className="flex items-center gap-2">权限
              {(['bookmarks', 'open', 'storage'] as const).map(p => (
                <Checkbox key={p} checked={def.permissions.includes(p)} onChange={() => togglePerm(p)} label={p === 'bookmarks' ? '读取书签' : p === 'open' ? '打开网页' : '保存数据'} />
              ))}
            </span>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-muted">联网域名（每行一个，如 api.example.com 或 *.example.com；不联网就留空）
            <textarea value={netText} onChange={e => setNetText(e.target.value)} rows={2} className="px-2.5 py-1.5 rounded-[8px] bg-fill-2 border border-line outline-none text-[12px] font-mono text-fg resize-none" />
          </label>

          <div className="flex gap-1 border-b border-line">
            {(['html', 'css', 'js', 'config', 'doc'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`h-8 px-3 text-[12px] -mb-px border-b-2 ${tab === t ? 'border-[color:var(--ai)] text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
                {t === 'config' ? '配置项' : t === 'doc' ? <span className="flex items-center gap-1"><BookOpen size={12} />接口说明</span> : t.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="h-[340px]">
            {tab === 'html' && <textarea className={code} spellCheck={false} value={def.html} onChange={e => set({ html: e.target.value })} aria-label="HTML" />}
            {tab === 'css' && <textarea className={code} spellCheck={false} value={def.css} onChange={e => set({ css: e.target.value })} aria-label="CSS" />}
            {tab === 'js' && <textarea className={code} spellCheck={false} value={def.js} onChange={e => set({ js: e.target.value })} aria-label="JavaScript" onKeyDown={e => {
              if (e.key === 'Tab') { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart; set({ js: t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd) }); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); }
            }} />}
            {tab === 'config' && <textarea className={code} spellCheck={false} value={configText} onChange={e => setConfigText(e.target.value)} aria-label="配置项"
              placeholder={'[\n  { "key": "city", "label": "城市", "type": "text", "default": "上海" }\n]'} />}
            {tab === 'doc' && <pre className={`${code} overflow-auto whitespace-pre-wrap`}>{API_DOC}</pre>}
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            预览
            {def.sizes.map(s => (
              <button key={s} onClick={() => setPreviewSize(s)} className={`h-7 px-2.5 rounded-[8px] border ${previewSize === s ? 'bg-fill-3 border-line-strong text-fg' : 'border-line'}`}>{SIZE_LABEL[s]}</button>
            ))}
            <button onClick={() => { if (validation.def) { setPreviewDef(validation.def); setRunId(n => n + 1); setRuntimeError(''); } }} className="ml-auto h-7 px-2.5 rounded-[8px] bg-fill-2 hover:bg-fill-3 text-fg flex items-center gap-1"><Play size={12} /> 重新运行</button>
          </div>
          <div className="tt-preview-stage rounded-[14px] p-5 flex items-start justify-center overflow-auto min-h-[300px]">
            <div className="tt-widget rounded-[16px] overflow-hidden shrink-0" style={{ width: pw, height: ph }}>
              <WidgetFrame def={previewDef} instanceId={`preview_${previewDef.id}`} size={previewSize} config={Object.fromEntries((previewDef.config || []).map(f => [f.key, f.default]))} host={host} onError={setRuntimeError} reloadKey={runId} />
            </div>
          </div>
          {runtimeError && <p className="text-[12px] text-warn whitespace-pre-wrap">{runtimeError}</p>}
          <p className="text-[11px] text-muted leading-relaxed">预览使用真实的书签数据和权限检查；预览里保存的数据和正式添加的小组件互不影响。</p>
        </div>
      </div>
    </Modal>
  );
};

export default WidgetStudio;
