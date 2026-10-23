import React, { useState } from 'react';
import { Waypoints, Check } from 'lucide-react';
import { EMBED_PROVIDERS, defaultEmbedConfig, type EmbedConfig } from '../../core/vectors/embedApi';
import { requestHostPermission, type AIConfig } from '../../core/ai/client';
import { clearVectorStore } from '../../core/vectors/vectorStore';
import { useVectorStatus } from '../../state/useSemantic';

interface Props {
  value?: Partial<EmbedConfig>;
  chat?: Partial<AIConfig>;
  onSave: (embed: EmbedConfig) => Promise<void> | void;
}

/** 语义向量设置：默认本地向量，可选接入向量接口 */
const EmbedSettings: React.FC<Props> = ({ value, chat, onSave }) => {
  const [cfg, setCfg] = useState<EmbedConfig>({ ...defaultEmbedConfig(), ...(value || {}) });
  const [saved, setSaved] = useState(false);
  const status = useVectorStatus();
  const preset = EMBED_PROVIDERS.find(p => p.id === cfg.provider);
  const canReuseKey = !!preset?.chatProvider && preset.chatProvider === chat?.provider && !!chat?.apiKey;

  const pick = (id: string) => {
    const p = EMBED_PROVIDERS.find(x => x.id === id)!;
    setCfg(c => ({ ...c, provider: id, baseUrl: p.baseUrl || c.baseUrl, model: p.model || c.model }));
    setSaved(false);
  };

  const setMode = (mode: 'local' | 'api') => {
    const next = { ...cfg, mode };
    setCfg(next);
    if (mode === 'local') void onSave(next);
  };

  const save = () => {
    const perm = requestHostPermission(cfg.baseUrl); // 必须在点击里同步发起
    void perm.then(async () => {
      await onSave(cfg);
      setSaved(true);
    });
  };

  const rebuild = () => {
    void clearVectorStore().then(() => window.dispatchEvent(new Event('ttab_vectors_resync')));
  };

  const input = 'w-full h-9 px-3 rounded-xl bg-white/5 border border-white/10 focus:border-[#7cc4ff]/60 outline-none text-xs text-white placeholder:text-white/30';
  const pct = Math.round(status.coverage * 100);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-violet-300/80 text-[12px] font-bold">
        <Waypoints size={14} /> <span>语义向量</span>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed -mt-2">用于"相关网页"、自动分组和"意思相近"搜索。本地向量无需配置；接入向量接口后能理解意思，比如搜"记账"也能找到"理财"类网页。</p>

      <div className="grid grid-cols-2 gap-1.5">
        {(['local', 'api'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`h-9 rounded-xl text-[11px] border transition-colors ${cfg.mode === m ? 'bg-violet-400/15 border-violet-300/50 text-violet-200' : 'bg-white/5 border-white/5 text-white/50 hover:text-white'}`}
          >{m === 'local' ? '仅本地（免费）' : '向量接口（更准）'}</button>
        ))}
      </div>

      {cfg.mode === 'api' && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {EMBED_PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className={`h-8 rounded-lg text-[11px] border transition-colors ${cfg.provider === p.id ? 'bg-violet-400/15 border-violet-300/50 text-violet-200' : 'bg-white/5 border-white/5 text-white/50 hover:text-white'}`}
              >{p.name}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-white/50">接口地址</span>
            <input className={input} value={cfg.baseUrl} onChange={e => setCfg({ ...cfg, baseUrl: e.target.value.trim() })} placeholder="https://…/v1" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-white/50">向量模型</span>
            <input className={input} value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value.trim() })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-white/50">API Key</span>
            <input className={input} type="password" autoComplete="off" value={cfg.apiKey} onChange={e => setCfg({ ...cfg, apiKey: e.target.value.trim() })}
              placeholder={canReuseKey ? '留空则使用 AI 助手里的 Key' : preset?.needsKey ? 'sk-…' : '可不填'} />
          </label>
          {preset?.note && <p className="text-[11px] text-white/40">{preset.note}</p>}
          <button onClick={save} disabled={!cfg.baseUrl || !cfg.model} className="h-10 rounded-xl bg-violet-300 text-[#1a1030] text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            <Check size={14} /> 保存，开始生成向量
          </button>
        </>
      )}

      <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-white/55 leading-relaxed flex flex-col gap-1">
        <span>当前使用：{status.mode === 'api' ? '向量接口' : '本地向量'}</span>
        {cfg.mode === 'api' && <span>已生成：{pct}% 的网页{pct < 80 && !status.syncing ? '（达到 80% 后自动切换到接口向量）' : ''}</span>}
        {status.syncing && <span className="text-violet-200">正在生成 {status.syncing.done}/{status.syncing.total}……</span>}
        {status.error && <span className="text-[#f5b94a]">{status.error}</span>}
        {saved && !status.syncing && !status.error && cfg.mode === 'api' && <span>已保存，几秒后开始在后台生成。</span>}
        {cfg.mode === 'api' && <button onClick={rebuild} className="self-start mt-1 text-white/45 hover:text-white underline underline-offset-2">全部重新生成</button>}
      </div>
    </section>
  );
};

export default EmbedSettings;
