/**
 * 浏览器自带同步（chrome.storage.sync）：只同步外观、首页视图这类无密钥的轻量设置。
 * AI 密钥、令牌、书签标签都不在其中；单条上限 8KB，所以背景图片之类的大字段会被剔除。
 */
import { storage } from '../../utils/storage';
import { loadCloud, saveCloud } from './config';

export const MIRROR_KEY = 'ttab_settings_mirror';
const MAX_STR = 1500;

export interface MirrorData { appearance?: Record<string, unknown>; homeView?: string; autoFile?: boolean }
export interface MirrorBlob { at: number; data: string }

const strip = (v: unknown): unknown => {
  if (typeof v === 'string') return v.length > MAX_STR ? undefined : v;
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { const y = strip(x); if (y !== undefined) o[k] = y; }
    return o;
  }
  return v;
};

export function mirrorData(s: { appearance?: unknown; homeView?: string; autoFile?: boolean }): string {
  const d: MirrorData = {
    appearance: strip(s.appearance) as Record<string, unknown> | undefined,
    homeView: s.homeView, autoFile: s.autoFile,
  };
  return JSON.stringify(d);
}

const hasSync = () => typeof chrome !== 'undefined' && !!chrome.storage?.sync;

/** 把本机设置写到浏览器同步区（有变化才写） */
export async function pushMirror(): Promise<boolean> {
  if (!hasSync()) return false;
  const [s, cfg, remote] = await Promise.all([storage.getSettings(), loadCloud(), chrome.storage.sync.get(MIRROR_KEY)]);
  const data = mirrorData(s);
  const prev = remote[MIRROR_KEY] as MirrorBlob | undefined;
  if (prev && prev.data === data) { if (cfg.mirrorAt !== prev.at) await saveCloud({ mirrorAt: prev.at }); return false; }
  const at = Date.now();
  await chrome.storage.sync.set({ [MIRROR_KEY]: { at, data } satisfies MirrorBlob });
  await saveCloud({ mirrorAt: at });
  return true;
}

/** 其它设备更新的设置比本机新时，应用到本机。返回是否有应用 */
export async function pullMirror(): Promise<boolean> {
  if (!hasSync()) return false;
  const [cfg, remote, s] = await Promise.all([loadCloud(), chrome.storage.sync.get(MIRROR_KEY), storage.getSettings()]);
  const blob = remote[MIRROR_KEY] as MirrorBlob | undefined;
  if (!blob || blob.at <= cfg.mirrorAt) return false;
  if (blob.data === mirrorData(s)) { await saveCloud({ mirrorAt: blob.at }); return false; }
  let d: MirrorData;
  try { d = JSON.parse(blob.data); } catch { return false; }
  const patch: Record<string, unknown> = {};
  if (d.appearance && typeof d.appearance === 'object') patch.appearance = { ...(s.appearance || {}), ...d.appearance };
  if (d.homeView === 'smart' || d.homeView === 'folder') patch.homeView = d.homeView;
  if (typeof d.autoFile === 'boolean') patch.autoFile = d.autoFile;
  await storage.updateSettings(patch);
  await saveCloud({ mirrorAt: blob.at });
  window.dispatchEvent(new Event('settings_updated'));
  return true;
}
