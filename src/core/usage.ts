/**
 * 基于浏览历史的使用统计（需要可选权限 history，用户在设置里或首页提示中授权）。
 * - 真实访问次数：不只是通过 TTab 打开的次数，装上第一天"常用"就有数据
 * - 时段习惯：工作日/周末 × 凌晨/上午/下午/晚上 共 8 个时段，用于"此刻常用"
 * 统计结果缓存在 storage，6 小时刷新一次；历史记录本身不会被保存或上传。
 */
import type { BookmarkRecord } from './types';
import { getDomain, normalizeUrl } from './normalize';

export interface UsageEntry {
  visits: number;
  last: number;
  /** 8 个时段的访问次数，只为访问最多的一批网页统计 */
  slots?: number[];
}

export interface UsageState {
  computedAt: number;
  entries: Record<string, UsageEntry>;
}

const KEY = 'ttab_usage_v1';
const DAY = 86400e3;
export const USAGE_WINDOW = 90 * DAY;
export const USAGE_TTL = 6 * 3600e3;
const SLOT_DETAIL_LIMIT = 150;

export const emptyUsage = (): UsageState => ({ computedAt: 0, entries: {} });

/** 0-3 工作日 凌晨/上午/下午/晚上，4-7 周末 */
export function slotOf(d: Date): number {
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  return (weekend ? 4 : 0) + Math.floor(d.getHours() / 6);
}

const PART = ['深夜', '上午', '下午', '晚上'];
export function slotLabel(slot: number): string {
  return `${slot >= 4 ? '周末' : '工作日'}${PART[slot % 4]}`;
}

export interface HistoryLike { url?: string; visitCount?: number; lastVisitTime?: number }

/**
 * 纯函数：把历史记录映射到书签上。
 * 书签是网站首页（如 github.com）时，同域名下其它页面的访问按一半计入。
 */
export function aggregateHistory(records: BookmarkRecord[], history: HistoryLike[]): {
  entries: Record<string, UsageEntry>;
  /** 用于进一步查询时段：书签 key → 历史里对应的真实网址 */
  exactUrls: Record<string, string>;
} {
  const byKey = new Map<string, { visits: number; last: number; url: string }>();
  const byDomain = new Map<string, { visits: number; last: number }>();
  for (const h of history) {
    if (!h.url || !/^https?:/.test(h.url)) continue;
    const key = normalizeUrl(h.url);
    const v = h.visitCount || 0;
    const last = h.lastVisitTime || 0;
    const e = byKey.get(key);
    if (e) { e.visits += v; e.last = Math.max(e.last, last); } else byKey.set(key, { visits: v, last, url: h.url });
    const dom = getDomain(h.url);
    const d = byDomain.get(dom);
    if (d) { d.visits += v; d.last = Math.max(d.last, last); } else byDomain.set(dom, { visits: v, last });
  }
  const entries: Record<string, UsageEntry> = {};
  const exactUrls: Record<string, string> = {};
  for (const r of records) {
    if (entries[r.key]) continue;
    const exact = byKey.get(r.key);
    let visits = exact?.visits || 0;
    let last = exact?.last || 0;
    const isRoot = r.key === r.domain || r.key === r.domain + '/';
    if (isRoot) {
      const d = byDomain.get(r.domain);
      if (d) { visits += Math.round((d.visits - (exact?.visits || 0)) * 0.5); last = Math.max(last, d.last); }
    }
    if (visits > 0) {
      entries[r.key] = { visits, last };
      if (exact) exactUrls[r.key] = exact.url;
    }
  }
  return { entries, exactUrls };
}

/** 纯函数：时段分布 */
export function slotsFromVisitTimes(times: number[], since: number): number[] {
  const slots = new Array(8).fill(0);
  for (const t of times) if (t >= since) slots[slotOf(new Date(t))]++;
  return slots;
}

/**
 * "此刻"的推荐分：访问越多、越常在当前时段访问、越近期访问，分越高。
 * 没有时段数据时只看频率和新近度。
 */
export function nowScore(e: UsageEntry | undefined, opens: number, now: Date): number {
  const visits = (e?.visits || 0) + opens * 2;
  if (!visits) return 0;
  let s = Math.log(1 + visits);
  if (e?.slots) {
    const total = e.slots.reduce((a, b) => a + b, 0);
    const share = (e.slots[slotOf(now)] + 0.5) / (total + 4); // 平滑
    s *= 0.4 + share * 8 * 0.6; // 在当前时段访问占比高于平均时加分
  }
  const age = now.getTime() - (e?.last || 0);
  if (age < DAY) s *= 1.3;
  else if (age < 7 * DAY) s *= 1.1;
  return s;
}

// ---------------------------------------------------------------------------
// 浏览器 API
// ---------------------------------------------------------------------------
const hasPermApi = () => typeof chrome !== 'undefined' && !!chrome.permissions?.contains;

export async function hasHistoryPermission(): Promise<boolean> {
  if (!hasPermApi()) return false;
  try { return await chrome.permissions.contains({ permissions: ['history'] }); } catch { return false; }
}

/** 必须在用户点击事件中同步调用 */
export function requestHistoryPermission(): Promise<boolean> {
  if (!hasPermApi()) return Promise.resolve(false);
  return chrome.permissions.request({ permissions: ['history'] }).catch(() => false);
}

export async function revokeHistoryPermission(): Promise<void> {
  if (!hasPermApi()) return;
  try { await chrome.permissions.remove({ permissions: ['history'] }); } catch { /* ignore */ }
  await saveUsage(emptyUsage());
}

export async function loadUsage(): Promise<UsageState> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const v = (await chrome.storage.local.get(KEY))[KEY] as UsageState | undefined;
      if (v && typeof v === 'object' && v.entries) return v;
    }
  } catch { /* ignore */ }
  return emptyUsage();
}

export async function saveUsage(u: UsageState): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [KEY]: u });
  } catch { /* ignore */ }
}

/** 从浏览历史重新计算（需要已授权） */
export async function computeUsage(records: BookmarkRecord[], now = Date.now()): Promise<UsageState> {
  if (typeof chrome === 'undefined' || !chrome.history?.search) return emptyUsage();
  const since = now - USAGE_WINDOW;
  const history = await chrome.history.search({ text: '', startTime: since, maxResults: 20000 });
  const { entries, exactUrls } = aggregateHistory(records, history);
  // 只为访问最多的网页查询逐次访问时间，控制开销
  const top = Object.entries(entries)
    .filter(([k]) => exactUrls[k])
    .sort((a, b) => b[1].visits - a[1].visits)
    .slice(0, SLOT_DETAIL_LIMIT);
  await Promise.all(top.map(async ([key]) => {
    try {
      const visits = await chrome.history.getVisits({ url: exactUrls[key] });
      entries[key].slots = slotsFromVisitTimes(visits.map(v => v.visitTime || 0), since);
    } catch { /* ignore */ }
  }));
  return { computedAt: now, entries };
}
