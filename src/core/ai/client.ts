/**
 * 多厂商 LLM 客户端。
 * - 'openai' 格式：OpenAI / DeepSeek / 通义千问 / Kimi / 智谱 / Gemini / Ollama 等兼容接口
 * - 'anthropic' 格式：Claude 原生接口
 * API Key 只保存在本机 chrome.storage.local，请求直接从扩展发往你配置的服务商。
 */

export type AIFormat = 'openai' | 'anthropic';

export interface AIConfig {
  enabled: boolean;
  provider: string;
  format: AIFormat;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  format: AIFormat;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  /** 是否支持 response_format: json_object */
  jsonMode: boolean;
  note?: string;
}

/** 模型名会随厂商更新而变化，这里只是默认值，设置里可以改 */
export const PROVIDERS: ProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek', format: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', needsKey: true, jsonMode: true },
  { id: 'qwen', name: '通义千问', format: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', needsKey: true, jsonMode: true },
  { id: 'zhipu', name: '智谱 GLM', format: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', needsKey: true, jsonMode: true },
  { id: 'moonshot', name: 'Kimi', format: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', needsKey: true, jsonMode: true },
  { id: 'claude', name: 'Claude', format: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5', needsKey: true, jsonMode: false },
  { id: 'openai', name: 'OpenAI', format: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true, jsonMode: true },
  { id: 'gemini', name: 'Gemini', format: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true, jsonMode: true },
  { id: 'ollama', name: 'Ollama 本地', format: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', needsKey: false, jsonMode: true, note: '需设置环境变量 OLLAMA_ORIGINS=chrome-extension://* 后重启 Ollama' },
  { id: 'custom', name: '自定义', format: 'openai', baseUrl: '', model: '', needsKey: false, jsonMode: false, note: '任何 OpenAI 兼容接口' },
];

export const defaultAIConfig = (): AIConfig => ({
  enabled: false,
  provider: 'deepseek',
  format: 'openai',
  baseUrl: PROVIDERS[0].baseUrl,
  apiKey: '',
  model: PROVIDERS[0].model,
});

export const isAIReady = (c?: AIConfig | null): c is AIConfig =>
  !!c && c.enabled && !!c.baseUrl && !!c.model && (!!c.apiKey || !PROVIDERS.find(p => p.id === c.provider)?.needsKey);

export class AIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface ChatOptions {
  json?: boolean;
  signal?: AbortSignal;
  maxTokens?: number;
  /** 测试注入 */
  fetchImpl?: typeof fetch;
}

const trimSlash = (u: string) => u.replace(/\/+$/, '');

function friendlyError(status: number, body: string): string {
  if (status === 401 || status === 403) return `API Key 无效或没有权限（${status}）`;
  if (status === 404) return `接口地址或模型名不对（404）`;
  if (status === 429) return `请求太频繁或额度不足（429）`;
  if (status >= 500) return `服务商暂时不可用（${status}）`;
  return `请求失败（${status}）：${body.slice(0, 160)}`;
}

/** 发送一次对话，返回模型输出的文本 */
export async function chat(config: AIConfig, system: string, user: string, opts: ChatOptions = {}): Promise<string> {
  const doFetch = opts.fetchImpl || fetch;
  const maxTokens = opts.maxTokens || 4096;
  let res: Response;
  try {
    if (config.format === 'anthropic') {
      res = await doFetch(`${trimSlash(config.baseUrl)}/v1/messages`, {
        method: 'POST',
        signal: opts.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: maxTokens,
          temperature: 0.2,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
    } else {
      const preset = PROVIDERS.find(p => p.id === config.provider);
      const body: Record<string, unknown> = {
        model: config.model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      };
      if (opts.json && preset?.jsonMode) body.response_format = { type: 'json_object' };
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
      res = await doFetch(`${trimSlash(config.baseUrl)}/chat/completions`, {
        method: 'POST', signal: opts.signal, headers, body: JSON.stringify(body),
      });
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError(`连接不上 AI 服务：${(e as Error).message}。请检查网络、接口地址，或在设置里重新授权访问该域名。`);
  }
  const text = await res.text();
  if (!res.ok) throw new AIError(friendlyError(res.status, text), res.status);
  let data: any;
  try { data = JSON.parse(text); } catch { throw new AIError('AI 返回的不是有效 JSON'); }
  const out = config.format === 'anthropic'
    ? (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    : data.choices?.[0]?.message?.content;
  if (typeof out !== 'string' || !out.trim()) throw new AIError('AI 没有返回内容');
  return out;
}

/** 从模型输出中稳健地提取 JSON（容忍 ```json 代码块和前后废话） */
export function extractJson<T = unknown>(text: string): T {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.search(/[[{]/);
  if (start < 0) throw new AIError('AI 输出中没有 JSON');
  const open = t[start];
  const close = open === '{' ? '}' : ']';
  const end = t.lastIndexOf(close);
  if (end <= start) throw new AIError('AI 输出的 JSON 不完整');
  const slice = t.slice(start, end + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    // 常见小错误：尾逗号
    try { return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1')) as T; } catch {
      throw new AIError('AI 输出的 JSON 格式有误');
    }
  }
}

/** 扩展访问 AI 接口需要对应域名的权限（manifest 中声明为可选权限，按需申请） */
export function originPattern(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

/** 必须在用户点击事件中同步调用 */
export function requestHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = originPattern(baseUrl);
  if (!pattern || typeof chrome === 'undefined' || !chrome.permissions?.request) return Promise.resolve(true);
  return chrome.permissions.request({ origins: [pattern] }).catch(() => false);
}
