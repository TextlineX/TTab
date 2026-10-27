import type { CloudConfig } from './config';

export class CloudError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
  get unauthorized() { return this.status === 401 && this.code === 'unauthorized'; }
}

export async function cloudRequest<T = any>(cfg: Pick<CloudConfig, 'server' | 'token'>, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  if (!cfg.server) throw new CloudError(0, 'no_server', '还没有填写服务器地址');
  let res: Response;
  try {
    res = await fetch(cfg.server + path, {
      method,
      headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new CloudError(0, 'network', '连不上服务器，请检查地址和网络');
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* 非 JSON */ }
  if (!res.ok) throw new CloudError(res.status, data?.error || 'http', data?.message || `服务器返回 ${res.status}`);
  return data as T;
}

export const cloudAuth = (cfg: Pick<CloudConfig, 'server'>, mode: 'login' | 'register', email: string, password: string) =>
  cloudRequest<{ token: string; user: { email: string } }>({ server: cfg.server, token: '' }, 'POST', mode === 'login' ? '/api/login' : '/api/register', { email, password });
