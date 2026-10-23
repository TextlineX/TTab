import React, { useState } from 'react';
import { Sparkles, Loader2, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { PROVIDERS, chat, defaultAIConfig, requestHostPermission, type AIConfig } from '../../core/ai/client';

interface Props {
  value?: Partial<AIConfig>;
  onSave: (ai: AIConfig) => Promise<void> | void;
}

/** AI 服务商配置：API Key 只保存在本机 */
const AISettings: React.FC<Props> = ({ value, onSave }) => {
  const [cfg, setCfg] = useState<AIConfig>({ ...defaultAIConfig(), ...(value || {}) });
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });
  const preset = PROVIDERS.find(p => p.id === cfg.provider);

  const pick = (id: string) => {
    const p = PROVIDERS.find(x => x.id === id)!;
    setCfg(c => ({ ...c, provider: id, format: p.format, baseUrl: p.baseUrl || c.baseUrl, model: p.model || c.model }));
    setStatus({ kind: 'idle' });
  };

  const saveAndTest = () => {
    // 权限申请必须在点击事件里同步发起
    const perm = requestHostPermission(cfg.baseUrl);
    void (async () => {
      setStatus({ kind: 'testing' });
      const granted = await perm;
      const next = { ...cfg, enabled: true };
      await onSave(next);
      if (!granted) {
        setStatus({ kind: 'error', text: '没有获得访问该接口地址的权限，AI 请求会被浏览器拦截。' });
        return;
      }
      try {
        const out = await chat(next, '你是连通性测试。', '只回复两个字：可用', { maxTokens: 20 });
        setStatus({ kind: 'ok', text: `连接成功：${out.trim().slice(0, 20)}` });
      } catch (e) {
        setStatus({ kind: 'error', text: (e as Error).message });
      }
    })();
  };

  const input = 'w-full h-9 px-3 rounded-xl bg-white/5 border border-white/10 focus:border-[#7cc4ff]/60 outline-none text-xs text-white placeholder:text-white/30';

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#7cc4ff] text-[12px] font-bold">
          <Sparkles size={14} /> <span>AI 助手</span>
        </div>
        {value?.enabled && (
          <button
            onClick={() => { const n = { ...cfg, enabled: false }; setCfg(n); void onSave(n); setStatus({ kind: 'idle' }); }}
            className="text-[11px] text-white/40 hover:text-white"
          >停用</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            className={`h-8 rounded-lg text-[11px] border transition-colors ${cfg.provider === p.id ? 'bg-[#7cc4ff]/15 border-[#7cc4ff]/50 text-[#a9d8ff]' : 'bg-white/5 border-white/5 text-white/50 hover:text-white'}`}
          >{p.name}</button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-white/50">接口地址</span>
        <input className={input} value={cfg.baseUrl} onChange={e => setCfg({ ...cfg, baseUrl: e.target.value.trim() })} placeholder="https://…/v1" />
      </label>
      {cfg.provider === 'custom' && (
        <label className="flex items-center gap-2 text-[11px] text-white/50">
          <input type="checkbox" checked={cfg.format === 'anthropic'} onChange={e => setCfg({ ...cfg, format: e.target.checked ? 'anthropic' : 'openai' })} />
          使用 Claude 原生接口格式（默认 OpenAI 兼容格式）
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-white/50">模型</span>
        <input className={input} value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value.trim() })} placeholder="模型名称" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-white/50">API Key{preset && !preset.needsKey ? '（可不填）' : ''}</span>
        <div className="relative">
          <input className={`${input} pr-9`} type={showKey ? 'text' : 'password'} value={cfg.apiKey} onChange={e => setCfg({ ...cfg, apiKey: e.target.value.trim() })} placeholder="sk-…" autoComplete="off" />
          <button onClick={() => setShowKey(s => !s)} aria-label={showKey ? '隐藏' : '显示'} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </label>
      {preset?.note && <p className="text-[11px] text-white/40 leading-relaxed">{preset.note}</p>}

      <button
        onClick={saveAndTest}
        disabled={status.kind === 'testing' || !cfg.baseUrl || !cfg.model}
        className="h-10 rounded-xl bg-[#7cc4ff] text-[#0c1a26] text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {status.kind === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 保存并测试连接
      </button>
      {status.text && (
        <p className={`text-[11px] leading-relaxed flex gap-1.5 ${status.kind === 'ok' ? 'text-emerald-300' : 'text-[#f5b94a]'}`}>
          {status.kind === 'error' && <AlertTriangle size={12} className="shrink-0 mt-0.5" />} {status.text}
        </p>
      )}
      <p className="text-[11px] text-white/35 leading-relaxed">
        API Key 只保存在这台电脑的浏览器里。使用 AI 时，书签的标题、网址和标签会发送给你选择的服务商。
      </p>
    </section>
  );
};

export default AISettings;
