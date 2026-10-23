/**
 * 自定义小组件的宿主接口：沙箱里的代码只能通过这里提供的方法访问外部，
 * 每次调用都检查小组件声明的权限。
 */
import type { CustomWidgetDef, WidgetPermission } from '../types';
import type { LibraryItem } from '../../core/types';
import { parseQuery, searchItems } from '../../core/search';
import { uniqueByKey, usageOf } from '../../core/tagGraph';

export interface RpcContext {
  def: CustomWidgetDef;
  items: LibraryItem[];
  openUrl: (url: string, background?: boolean) => void;
  notify: (text: string) => void;
  getData: () => Promise<Record<string, unknown> | undefined>;
  setData: (v: Record<string, unknown>) => Promise<void>;
  fetchImpl?: typeof fetch;
}

const MAX_DATA = 100 * 1024;
const MAX_TEXT = 1024 * 1024;

export const allows = (def: CustomWidgetDef, p: WidgetPermission) => def.permissions.includes(p);

/** 网址的主机是否在 net:<域名> 声明里（支持 *.example.com） */
export function netAllowed(def: CustomWidgetDef, url: string): boolean {
  let host: string;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    host = u.host.toLowerCase();
  } catch { return false; }
  return def.permissions.some(p => {
    if (!p.startsWith('net:')) return false;
    const rule = p.slice(4).toLowerCase();
    return rule.startsWith('*.') ? host === rule.slice(2) || host.endsWith(rule.slice(1)) : host === rule;
  });
}

/** 只把必要的书签字段交给小组件 */
const toPublic = (it: LibraryItem) => ({ title: it.title, url: it.url, domain: it.domain, tags: it.tags, summary: it.summary || '', folder: it.folderPath.join('/') });

export class RpcError extends Error {}

function need(def: CustomWidgetDef, p: WidgetPermission) {
  if (!allows(def, p)) throw new RpcError(`这个小组件没有声明 "${p}" 权限`);
}

export async function handleRpc(ctx: RpcContext, method: string, args: unknown[]): Promise<unknown> {
  const { def } = ctx;
  switch (method) {
    case 'notify': {
      ctx.notify(`${def.name}：${String(args[0] ?? '').slice(0, 120)}`);
      return true;
    }
    case 'open': {
      need(def, 'open');
      const url = String(args[0] ?? '');
      if (!/^https?:\/\//i.test(url)) throw new RpcError('只能打开 http/https 网址');
      ctx.openUrl(url, !!args[1]);
      return true;
    }
    case 'storage.get': {
      need(def, 'storage');
      const data = (await ctx.getData()) || {};
      return args[0] === undefined ? data : data[String(args[0])];
    }
    case 'storage.set': {
      need(def, 'storage');
      const data = { ...((await ctx.getData()) || {}), [String(args[0])]: args[1] };
      if (JSON.stringify(data).length > MAX_DATA) throw new RpcError('数据太大（最多 100KB）');
      await ctx.setData(data);
      return true;
    }
    case 'bookmarks.search': {
      need(def, 'bookmarks');
      const limit = Math.min(Number(args[1]) || 20, 100);
      return searchItems(ctx.items, parseQuery(String(args[0] ?? '')), limit).map(toPublic);
    }
    case 'bookmarks.list': {
      need(def, 'bookmarks');
      const o = (args[0] || {}) as { tag?: string; limit?: number; sort?: string };
      let list = uniqueByKey(ctx.items);
      if (o.tag) list = list.filter(i => i.tags.includes(String(o.tag)));
      if (o.sort === 'recent') list = [...list].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      else if (o.sort === 'random') list = [...list].sort(() => Math.random() - 0.5);
      else list = [...list].sort((a, b) => usageOf(b) - usageOf(a));
      return list.slice(0, Math.min(Number(o.limit) || 20, 200)).map(toPublic);
    }
    case 'bookmarks.tags': {
      need(def, 'bookmarks');
      const counts = new Map<string, number>();
      for (const it of uniqueByKey(ctx.items)) for (const t of it.tags) counts.set(t, (counts.get(t) || 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([tag, count]) => ({ tag, count }));
    }
    case 'fetch': {
      const url = String(args[0] ?? '');
      if (!netAllowed(def, url)) throw new RpcError(`没有访问 ${url.slice(0, 80)} 的权限，请在小组件里声明 net:<域名>`);
      const o = (args[1] || {}) as { method?: string; headers?: Record<string, string>; body?: string };
      const method = (o.method || 'GET').toUpperCase();
      if (!['GET', 'POST'].includes(method)) throw new RpcError('只支持 GET 和 POST');
      const res = await (ctx.fetchImpl || fetch)(url, { method, headers: o.headers, body: method === 'POST' ? o.body : undefined, credentials: 'omit' });
      const text = (await res.text()).slice(0, MAX_TEXT);
      return { ok: res.ok, status: res.status, text };
    }
    default:
      throw new RpcError(`不支持的方法：${method}`);
  }
}
