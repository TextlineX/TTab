import React, { useState } from 'react';
import { Loader2, Check, AlertTriangle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { PROVIDERS, chat, defaultAIConfig, requestHostPermission, type AIConfig } from '../../core/ai/client';
import { Group, Row, inputCls } from '../settings/parts';
import Switch from '../../ui/Switch';
import Button from '../../ui/Button';

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
      setCfg(next);
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

  return (
    <div className="flex flex-col gap-7">
      <Group>
        <Row label="启用 AI 助手" desc="用于自动打标签、整理书签、用一句话描述要找的网页">
          <Switch
            label="启用 AI 助手"
            checked={!!value?.enabled}
            onChange={on => { if (on) saveAndTest(); else { const n = { ...cfg, enabled: false }; setCfg(n); void onSave(n); setStatus({ kind: 'idle' }); } }}
          />
        </Row>
      </Group>

      <Group title="服务商" desc="选一个预设会自动填好接口地址和模型；自定义可以接任何 OpenAI 兼容接口">
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PROVIDERS.map(p => {
            const on = cfg.provider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                aria-pressed={on}
                className={`h-11 px-3 rounded-xl text-[13.5px] border flex items-center justify-between gap-2 transition-colors ${on ? 'bg-accent-soft border-[color:var(--accent-line)] text-fg' : 'border-line text-muted hover:text-fg hover:bg-fill-2'}`}
              >
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
        {cfg.provider === 'custom' && (
          <Row label="使用 Claude 原生接口格式" desc="默认是 OpenAI 兼容格式">
            <Switch label="使用 Claude 原生接口格式" checked={cfg.format === 'anthropic'} onChange={v => setCfg({ ...cfg, format: v ? 'anthropic' : 'openai' })} />
          </Row>
        )}
        <Row label="模型" stack>
          <input className={inputCls} value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value.trim() })} placeholder="模型名称" />
        </Row>
        <Row label={`API Key${preset && !preset.needsKey ? '（可不填）' : ''}`} desc={preset?.note} stack>
          <div className="relative">
            <input className={`${inputCls} pr-10`} type={showKey ? 'text' : 'password'} value={cfg.apiKey} onChange={e => setCfg({ ...cfg, apiKey: e.target.value.trim() })} placeholder="sk-…" autoComplete="off" />
            <button onClick={() => setShowKey(s => !s)} aria-label={showKey ? '隐藏' : '显示'} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-faint hover:text-fg">
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Row>
        <div className="px-4 py-3.5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={saveAndTest} disabled={status.kind === 'testing' || !cfg.baseUrl || !cfg.model}
            icon={status.kind === 'testing' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}>
            保存并测试连接
          </Button>
          {status.text && (
            <span className={`text-[12.5px] leading-relaxed flex items-start gap-1.5 min-w-0 ${status.kind === 'ok' ? 'text-accent-text' : 'text-warn'}`}>
              {status.kind === 'error' && <AlertTriangle size={14} className="shrink-0 mt-0.5" />}<span className="break-all">{status.text}</span>
            </span>
          )}
        </div>
      </Group>

      <p className="px-1 flex gap-2 text-[12.5px] text-faint leading-relaxed">
        <ShieldCheck size={15} className="shrink-0 mt-0.5" />
        API Key 只保存在这台电脑的浏览器里。使用 AI 时，书签的标题、网址和标签会发送给你选择的服务商。AI 永远不会删除书签。
      </p>
    </div>
  );
};

export default AISettings;
