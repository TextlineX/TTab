/** 云服务配置：只存在本机 storage.local，不进入导出文件，也不进 chrome.storage.sync */
import { storage } from '../../utils/storage';

export interface CloudConfig {
  /** 服务器地址，例如 https://ttab.example.com */
  server: string;
  token: string;
  email: string;
  /** 把标签和组合同步到账号，在你的所有浏览器之间保持一致 */
  sync: boolean;
  /** 匿名贡献自己手动打的标签（只发网址的哈希，不发网址） */
  contribute: boolean;
  /** 新书签自动与社区标签比对（默认关闭，也可以手动比对） */
  autoCompare: boolean;
  /** 用浏览器自带的同步（Edge/Chrome 账号）同步外观和首页设置，不含任何密钥 */
  mirror: boolean;
  mirrorAt: number;
  /** 服务器返回的增量游标 */
  cursor: number;
  /** 上一次成功推送的时间；比它新的修改才需要再上传 */
  lastPushAt: number;
  lastSyncAt: number;
  /** 服务器下发的同义词缓存 */
  aliases?: Record<string, string>;
}

export const CLOUD_KEY = 'ttab_cloud_v1';

export const defaultCloud = (): CloudConfig => ({
  server: '', token: '', email: '', sync: false, contribute: false, autoCompare: false,
  mirror: false, mirrorAt: 0,
  cursor: 0, lastPushAt: 0, lastSyncAt: 0,
});

export async function loadCloud(): Promise<CloudConfig> {
  const saved = await storage.get(CLOUD_KEY);
  return { ...defaultCloud(), ...(saved && typeof saved === 'object' ? saved : {}) };
}

export async function saveCloud(patch: Partial<CloudConfig>): Promise<CloudConfig> {
  const next = { ...(await loadCloud()), ...patch };
  await storage.set(CLOUD_KEY, next);
  return next;
}

export const signedIn = (c: CloudConfig) => !!(c.server && c.token);

/** 规范化服务器地址：补 https://，去掉末尾斜杠；非本机地址必须是 https */
export function normalizeServer(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `${/^(localhost|127\.|\[::1\])/i.test(s) ? 'http' : 'https'}://${s}`;
  try {
    const u = new URL(s);
    const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(u.hostname);
    if (u.protocol !== 'https:' && !local) return '';
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}
