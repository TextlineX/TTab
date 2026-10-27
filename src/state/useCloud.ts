/** 云账号 / 同步 / 社区比对的状态中心。所有开关默认关闭，只有登录并打开开关后才会联网 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Library } from './useLibrary';
import { CLOUD_KEY, defaultCloud, loadCloud, saveCloud, signedIn, type CloudConfig } from '../core/cloud/config';
import { cloudAuth, cloudRequest, CloudError } from '../core/cloud/api';
import { refreshAliases, syncOnce } from '../core/cloud/engine';
import { applyProposals, contributable, contribute, fetchProposals, type Proposal } from '../core/cloud/community';
import { setExtraAliases } from '../core/normalize';
import { MIRROR_KEY, pullMirror, pushMirror } from '../core/cloud/mirror';

export interface CloudApi {
  cfg: CloudConfig;
  loaded: boolean;
  busy: string;          // 正在做什么（空 = 空闲）
  error: string;
  /** 在设置页登录/注册；成功后返回 true */
  auth: (mode: 'login' | 'register', email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<boolean>;
  setServer: (server: string) => Promise<void>;
  patch: (p: Partial<CloudConfig>) => Promise<void>;
  syncNow: () => Promise<string>;
  /** 手动比对：返回建议，由界面确认后 apply */
  compare: () => Promise<Proposal[]>;
  applyCompare: (ps: Proposal[]) => void;
  shareNow: () => Promise<string>;
  withdraw: () => Promise<string>;
}

const SYNC_DEBOUNCE = 6000;
const SYNC_INTERVAL = 5 * 60 * 1000;

export function useCloud(lib: Library): CloudApi {
  const [cfg, setCfg] = useState<CloudConfig>(defaultCloud);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const libRef = useRef(lib); libRef.current = lib;
  const running = useRef(false);

  useEffect(() => {
    void loadCloud().then(c => { setCfg(c); if (c.aliases) setExtraAliases(c.aliases); setLoaded(true); });
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[CLOUD_KEY]) setCfg({ ...defaultCloud(), ...(changes[CLOUD_KEY].newValue as Partial<CloudConfig>) });
    };
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onChange);
      return () => chrome.storage.onChanged.removeListener(onChange);
    }
  }, []);

  const patch = useCallback(async (p: Partial<CloudConfig>) => { setCfg(await saveCloud(p)); }, []);

  const fail = useCallback(async (e: unknown): Promise<string> => {
    const msg = e instanceof CloudError ? e.message : (e as Error).message || '出错了';
    if (e instanceof CloudError && e.unauthorized) await patch({ token: '', sync: false, contribute: false, autoCompare: false });
    setError(msg);
    return msg;
  }, [patch]);

  const syncNow = useCallback(async (): Promise<string> => {
    const c = cfgRef.current;
    if (!signedIn(c)) return '还没有登录';
    if (running.current) return '正在同步';
    running.current = true; setBusy('正在同步…'); setError('');
    try {
      const l = libRef.current;
      const { result, cfg: next } = await syncOnce(c, () => l.meta, l.applyExternal);
      setCfg(cur => ({ ...cur, cursor: next.cursor, lastPushAt: next.lastPushAt, lastSyncAt: next.lastSyncAt }));
      return `同步完成：上传 ${result.pushed} 项，收到 ${result.pulled} 项`;
    } catch (e) {
      return `同步失败：${await fail(e)}`;
    } finally { running.current = false; setBusy(''); }
  }, [fail]);

  const auth = useCallback(async (mode: 'login' | 'register', email: string, password: string) => {
    setBusy(mode === 'login' ? '正在登录…' : '正在注册…'); setError('');
    try {
      const r = await cloudAuth(cfgRef.current, mode, email, password);
      await patch({ token: r.token, email: r.user.email, cursor: 0, lastPushAt: 0 });
      return true;
    } catch (e) { await fail(e); return false; } finally { setBusy(''); }
  }, [patch, fail]);

  const logout = useCallback(async () => {
    try { await cloudRequest(cfgRef.current, 'POST', '/api/logout'); } catch { /* 服务器不可用也要能退出 */ }
    await patch({ token: '', email: '', sync: false, contribute: false, autoCompare: false, cursor: 0, lastPushAt: 0 });
  }, [patch]);

  const deleteAccount = useCallback(async (password: string) => {
    setBusy('正在删除账号…'); setError('');
    try {
      await cloudRequest(cfgRef.current, 'DELETE', '/api/account', { password });
      await patch({ token: '', email: '', sync: false, contribute: false, autoCompare: false, cursor: 0, lastPushAt: 0 });
      return true;
    } catch (e) { await fail(e); return false; } finally { setBusy(''); }
  }, [patch, fail]);

  const setServer = useCallback(async (server: string) => {
    // 换服务器就是换账号：旧的令牌和游标都作废
    await patch({ server, token: '', email: '', sync: false, contribute: false, autoCompare: false, cursor: 0, lastPushAt: 0 });
  }, [patch]);

  const compare = useCallback(async () => {
    const c = cfgRef.current; const l = libRef.current;
    setBusy('正在与社区比对…'); setError('');
    try {
      await refreshAliases(c).catch(() => undefined);
      const keys = [...new Set(l.records.map(r => r.key))].filter(Boolean);
      return await fetchProposals(c, l.meta, keys);
    } catch (e) { await fail(e); return []; } finally { setBusy(''); }
  }, [fail]);

  const applyCompare = useCallback((ps: Proposal[]) => {
    libRef.current.update(s => applyProposals(s, ps), `云端比对（${ps.length} 个网页）`);
  }, []);

  const shareNow = useCallback(async () => {
    setBusy('正在贡献标签…'); setError('');
    try { const n = await contribute(cfgRef.current, libRef.current.meta); return `已匿名贡献 ${n} 条标签`; }
    catch (e) { return `贡献失败：${await fail(e)}`; } finally { setBusy(''); }
  }, [fail]);

  const withdraw = useCallback(async () => {
    setBusy('正在收回…'); setError('');
    try { const r = await cloudRequest<{ removed: number }>(cfgRef.current, 'DELETE', '/api/contributions'); return `已收回 ${r.removed} 条贡献`; }
    catch (e) { return `收回失败：${await fail(e)}`; } finally { setBusy(''); }
  }, [fail]);

  // ---- 自动同步：打开时一次、修改后稍等一会儿、定时、切回页面时
  const syncing = loaded && signedIn(cfg) && cfg.sync;
  useEffect(() => {
    if (!syncing || !lib.ready) return;
    const first = setTimeout(() => { void syncNow(); }, 1500);
    const timer = setInterval(() => { void syncNow(); }, SYNC_INTERVAL);
    const onVis = () => { if (document.visibilityState === 'visible') void syncNow(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [syncing, lib.ready, syncNow]);

  useEffect(() => {
    if (!syncing || !lib.ready) return;
    const t = setTimeout(() => { void syncNow(); }, SYNC_DEBOUNCE);
    return () => clearTimeout(t);
  }, [lib.meta, syncing, lib.ready, syncNow]);

  // ---- 浏览器自带同步：开启后先拉取更新的设置，再监听本机设置变化推送、监听其他设备的变化拉取
  const mirroring = loaded && cfg.mirror;
  useEffect(() => {
    if (!mirroring || typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void pullMirror().then(applied => { if (!applied) return pushMirror(); }).catch(() => undefined);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'sync' && changes[MIRROR_KEY]) void pullMirror().catch(() => undefined);
      if (area === 'local' && changes.app_settings) { clearTimeout(timer); timer = setTimeout(() => { void pushMirror().catch(() => undefined); }, 1500); }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => { clearTimeout(timer); chrome.storage.onChanged.removeListener(onChange); };
  }, [mirroring]);

  // ---- 自动贡献：手动标签有变化后稍等一会儿再匿名上传（服务器按人去重，重复上传不会多算票）
  const sharing = loaded && signedIn(cfg) && cfg.contribute;
  const lastShared = useRef('');
  useEffect(() => {
    if (!sharing || !lib.ready) return;
    const t = setTimeout(() => {
      const sig = JSON.stringify(contributable(libRef.current.meta));
      if (sig === lastShared.current) return;
      lastShared.current = sig;
      void contribute(cfgRef.current, libRef.current.meta).catch(e => { lastShared.current = ''; void fail(e); });
    }, 20000);
    return () => clearTimeout(t);
  }, [lib.meta, sharing, lib.ready, fail]);

  // ---- 自动比对：新出现的、还没有任何标签的书签，向社区要建议（每次最多 100 个）
  const autoCmp = loaded && signedIn(cfg) && cfg.autoCompare;
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!autoCmp || !lib.ready) return;
    const pending = lib.records.filter(r => r.key && !asked.current.has(r.key) && !(lib.meta.pages[r.key]?.tags.some(t => t.source !== 'rule'))).slice(0, 100);
    if (!pending.length) return;
    const t = setTimeout(() => {
      pending.forEach(r => asked.current.add(r.key));
      void (async () => {
        try {
          const ps = (await fetchProposals(cfgRef.current, libRef.current.meta, pending.map(r => r.key))).filter(p => p.add.length);
          if (ps.length) libRef.current.update(s => applyProposals(s, ps.map(p => ({ ...p, remove: [] }))), '云端补充标签');
        } catch (e) { void fail(e); }
      })();
    }, 2500);
    return () => clearTimeout(t);
  }, [autoCmp, lib.ready, lib.records, lib.meta, fail]);

  return { cfg, loaded, busy, error, auth, logout, deleteAccount, setServer, patch, syncNow, compare, applyCompare, shareNow, withdraw };
}
