/**
 * 向量接口（OpenAI 兼容的 /embeddings）。
 * 注意：DeepSeek、Claude、Kimi 目前没有向量接口，所以向量服务单独配置。
 */
import { AIError, type AIConfig } from '../ai/client';
import { normalize } from './vecmath';

export interface EmbedConfig {
  /** local = 只用本地向量；api = 调用向量接口 */
  mode: 'local' | 'api';
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface EmbedPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  /** 单次请求最多几条文本 */
  batch: number;
  /** 支持 dimensions 参数时请求 512 维，节省存储 */
  dimensions?: number;
  /** 与对话服务同一家时可以复用 API Key */
  chatProvider?: string;
  note?: string;
}

/** 模型名会随厂商更新而变化，这里只是默认值 */
export const EMBED_PROVIDERS: EmbedPreset[] = [
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'BAAI/bge-m3', needsKey: true, batch: 32, note: 'bge-m3 中文效果好，有免费额度' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'text-embedding-v3', needsKey: true, batch: 10, chatProvider: 'qwen' },
  { id: 'zhipu', name: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'embedding-3', needsKey: true, batch: 32, chatProvider: 'zhipu' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small', needsKey: true, batch: 64, dimensions: 512, chatProvider: 'openai' },
  { id: 'gemini', name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-embedding-001', needsKey: true, batch: 32, chatProvider: 'gemini' },
  { id: 'ollama', name: 'Ollama 本地', baseUrl: 'http://localhost:11434/v1', model: 'bge-m3', needsKey: false, batch: 32, chatProvider: 'ollama', note: '先运行 ollama pull bge-m3' },
  { id: 'custom', name: '自定义', baseUrl: '', model: '', needsKey: false, batch: 16 },
];

export const defaultEmbedConfig = (): EmbedConfig => ({ mode: 'local', provider: 'siliconflow', baseUrl: EMBED_PROVIDERS[0].baseUrl, apiKey: '', model: EMBED_PROVIDERS[0].model });

export const isEmbedApiReady = (c?: Partial<EmbedConfig> | null): c is EmbedConfig =>
  !!c && c.mode === 'api' && !!c.baseUrl && !!c.model && (!!c.apiKey || !EMBED_PROVIDERS.find(p => p.id === c.provider)?.needsKey);

/** 对话服务与向量服务是同一家时，自动带上对话服务的 Key */
export function resolveEmbedKey(embed: EmbedConfig, chat?: Partial<AIConfig>): EmbedConfig {
  if (embed.apiKey || !chat?.apiKey) return embed;
  const preset = EMBED_PROVIDERS.find(p => p.id === embed.provider);
  return preset?.chatProvider && preset.chatProvider === chat.provider ? { ...embed, apiKey: chat.apiKey } : embed;
}

/** 用于区分不同模型的向量（换模型后旧向量作废） */
export const embedModelId = (c: EmbedConfig) => `${c.provider}:${c.model}`;

export async function embedTexts(c: EmbedConfig, texts: string[], opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<Float32Array[]> {
  const doFetch = opts.fetchImpl || fetch;
  const preset = EMBED_PROVIDERS.find(p => p.id === c.provider);
  const batch = preset?.batch || 16;
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += batch) {
    const input = texts.slice(i, i + batch).map(t => t.slice(0, 2000) || ' ');
    const body: Record<string, unknown> = { model: c.model, input, encoding_format: 'float' };
    if (preset?.dimensions) body.dimensions = preset.dimensions;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (c.apiKey) headers.authorization = `Bearer ${c.apiKey}`;
    let res: Response;
    try {
      res = await doFetch(`${c.baseUrl.replace(/\/+$/, '')}/embeddings`, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new AIError(`连接不上向量服务：${(e as Error).message}`);
    }
    const text = await res.text();
    if (!res.ok) {
      const msg = res.status === 401 || res.status === 403 ? 'API Key 无效或没有权限' : res.status === 404 ? '接口地址或模型名不对' : res.status === 429 ? '请求太频繁或额度不足' : text.slice(0, 120);
      throw new AIError(`向量服务出错（${res.status}）：${msg}`, res.status);
    }
    let data: { data?: { embedding?: number[]; index?: number }[] };
    try { data = JSON.parse(text); } catch { throw new AIError('向量服务返回的不是 JSON'); }
    const rows = (data.data || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (rows.length !== input.length || rows.some(r => !Array.isArray(r.embedding))) throw new AIError('向量服务返回的数据数量不对');
    for (const r of rows) out.push(normalize(Float32Array.from(r.embedding!)));
  }
  return out;
}
