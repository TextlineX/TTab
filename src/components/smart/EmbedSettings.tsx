import React, { useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { EMBED_PROVIDERS, defaultEmbedConfig, type EmbedConfig } from '../../core/vectors/embedApi';
import { requestHostPermission, type AIConfig } from '../../core/ai/client';
import { clearVectorStore } from '../../core/vectors/vectorStore';
import { useVectorStatus } from '../../state/useSemantic';
import { Group, Row, inputCls } from '../settings/parts';
import Segmented from '../../ui/Segmented';
import Button from '../../ui/Button';

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

  const pct = Math.round(status.coverage * 100);

  return (
    <div className="flex flex-col gap-7">
      <Group desc="语义向量用于「相关网页」、自动分组和「意思相近」搜索。本地向量无需配置；接入向量接口后能理解意思，比如搜「记账」也能找到「理财」类网页。">
        <Row label="向量来源">
          <Segmented ariaLabel="向量来源" value={cfg.mode} onChange={setMode} options={[
            { value: 'local', label: '仅本地（免费）' },
            { value: 'api', label: '向量接口（更准）' },
          ]} />
        </Row>
        <Row label="当前状态" desc={
          <span className="flex flex-col gap-0.5">
            <span>正在使用：{status.mode === 'api' ? '向量接口' : '本地向量'}</span>
            {cfg.mode === 'api' && <span>已生成 {pct}% 的网页{pct < 80 && !status.syncing ? '（达到 80% 后自动切换到接口向量）' : ''}</span>}
            {status.syncing && <span className="text-ai">正在生成 {status.syncing.done}/{status.syncing.total}……</span>}
            {status.error && <span className="text-warn">{status.error}</span>}
            {saved && !status.syncing && !status.error && cfg.mode === 'api' && <span>已保存，几秒后开始在后台生成。</span>}
          </span>
        }>
          {cfg.mode === 'api' && <Button size="sm" variant="ghost" onClick={rebuild} icon={<RefreshCw size={14} />}>全部重新生成</Button>}
        </Row>
        {cfg.mode === 'api' && status.coverage > 0 && (
          <div className="px-4 pb-4 -mt-1">
            <div className="h-1.5 rounded-full bg-fill-2 overflow-hidden"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
          </div>
        )}
      </Group>

      {cfg.mode === 'api' && (
        <>
          <Group title="服务商">
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EMBED_PROVIDERS.map(p => {
                const on = cfg.provider === p.id;
                return (
                  <button key={p.id} onClick={() => pick(p.id)} aria-pressed={on}
                    className={`h-11 px-3 rounded-xl text-[13.5px] border flex items-center justify-between gap-2 transition-colors ${on ? 'bg-accent-soft border-[color:var(--accent-line)] text-fg' : 'border-line text-muted hover:text-fg hover:bg-fill-2'}`}>
                    <span className="truncate">{p.name}</span>
                    {on && <Check size={15} className="text-accent-text shrink-0" />}
                  </button>
                );
              })}
            </div>
          </Group>
          <Group title="连接">
            <Row label="接口地址" stack>
              <input className={inputCls} value={cfg.baseUrl} onChange={e => setCfg({ ...cfg, baseUrl: e.target.value.trim() })} placeholder="https://…/v1" />
            </Row>
            <Row label="向量模型" stack>
              <input className={inputCls} value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value.trim() })} />
            </Row>
            <Row label="API Key" desc={preset?.note} stack>
              <input className={inputCls} type="password" autoComplete="off" value={cfg.apiKey} onChange={e => setCfg({ ...cfg, apiKey: e.target.value.trim() })}
                placeholder={canReuseKey ? '留空则使用 AI 助手里的 Key' : preset?.needsKey ? 'sk-…' : '可不填'} />
            </Row>
            <div className="px-4 py-3.5">
              <Button variant="primary" onClick={save} disabled={!cfg.baseUrl || !cfg.model} icon={<Check size={15} />}>保存，开始生成向量</Button>
            </div>
          </Group>
        </>
      )}
    </div>
  );
};

export default EmbedSettings;
