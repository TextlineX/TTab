/** 小组件的持久化：布局、每个小组件自己的数据、已安装的自定义小组件 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomWidgetDef, WidgetBoardState, WidgetInstance } from './types';

const BOARD_KEY = 'ttab_widgets_v1';
const CUSTOM_KEY = 'ttab_custom_widgets_v1';
const dataKey = (instanceId: string) => `ttab_wdata_${instanceId}`;

const hasChrome = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    if (hasChrome()) return (await chrome.storage.local.get(key))[key] as T | undefined;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch { return undefined; }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    if (hasChrome()) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('ttab_kv', { detail: key }));
}

export async function kvRemove(key: string): Promise<void> {
  try {
    if (hasChrome()) await chrome.storage.local.remove(key);
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
}

/** 监听某个键的变化（包括其它标签页） */
function subscribeKey(key: string, cb: () => void): () => void {
  const local = (e: Event) => { if ((e as CustomEvent).detail === key) cb(); };
  window.addEventListener('ttab_kv', local);
  const remote = (changes: Record<string, unknown>, area: string) => { if (area === 'local' && key in changes) cb(); };
  if (hasChrome() && chrome.storage.onChanged) chrome.storage.onChanged.addListener(remote);
  return () => {
    window.removeEventListener('ttab_kv', local);
    if (hasChrome() && chrome.storage.onChanged) chrome.storage.onChanged.removeListener(remote);
  };
}

let idSeq = 0;
export const newWidgetId = () => `w_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;

/** 第一次使用时的默认布局：网页搜索 + 待办 + 便签（TTab 接管新标签页后浏览器自带的搜索框就没了） */
export const defaultBoard = (): WidgetBoardState => ({
  version: 1,
  instances: [
    { id: 'w_default_search', type: 'search', size: 'm', config: {} },
    { id: 'w_default_todo', type: 'todo', size: 's', config: {} },
    { id: 'w_default_notes', type: 'notes', size: 's', config: {} },
  ],
});

export async function loadBoard(): Promise<WidgetBoardState> {
  const b = await kvGet<WidgetBoardState>(BOARD_KEY);
  if (!b || !Array.isArray(b.instances)) return defaultBoard();
  return b;
}

export async function saveBoard(b: WidgetBoardState) {
  await kvSet(BOARD_KEY, b);
}

export async function loadCustomDefs(): Promise<CustomWidgetDef[]> {
  return (await kvGet<CustomWidgetDef[]>(CUSTOM_KEY)) || [];
}

export async function saveCustomDefs(defs: CustomWidgetDef[]) {
  await kvSet(CUSTOM_KEY, defs);
}

export async function getWidgetData<T>(instanceId: string): Promise<T | undefined> {
  return kvGet<T>(dataKey(instanceId));
}

export async function setWidgetData(instanceId: string, value: unknown) {
  await kvSet(dataKey(instanceId), value);
}

export async function removeWidgetData(instanceId: string) {
  await kvRemove(dataKey(instanceId));
}

/** 小组件自己的持久数据（各标签页之间同步） */
export function useWidgetData<T>(instanceId: string, initial: T): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(value);
  ref.current = value;
  useEffect(() => {
    let alive = true;
    const load = () => getWidgetData<T>(instanceId).then(v => { if (alive) { if (v !== undefined) setValue(v); setLoaded(true); } });
    void load();
    const off = subscribeKey(dataKey(instanceId), () => { void load(); });
    return () => { alive = false; off(); };
  }, [instanceId]);
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const v = typeof next === 'function' ? (next as (p: T) => T)(ref.current) : next;
    setValue(v);
    void setWidgetData(instanceId, v);
  }, [instanceId]);
  return [value, set, loaded];
}

/** 布局与自定义小组件 */
export function useWidgetBoard() {
  const [board, setBoard] = useState<WidgetBoardState | null>(null);
  const [customDefs, setCustomDefs] = useState<CustomWidgetDef[]>([]);
  useEffect(() => {
    const load = () => { void loadBoard().then(setBoard); void loadCustomDefs().then(setCustomDefs); };
    load();
    const off1 = subscribeKey(BOARD_KEY, () => { void loadBoard().then(setBoard); });
    const off2 = subscribeKey(CUSTOM_KEY, () => { void loadCustomDefs().then(setCustomDefs); });
    return () => { off1(); off2(); };
  }, []);

  const update = useCallback((fn: (instances: WidgetInstance[]) => WidgetInstance[]) => {
    setBoard(prev => {
      const next: WidgetBoardState = { version: 1, instances: fn(prev?.instances || []) };
      void saveBoard(next);
      return next;
    });
  }, []);

  const installCustom = useCallback(async (def: CustomWidgetDef) => {
    const defs = await loadCustomDefs();
    const next = [...defs.filter(d => d.id !== def.id), def];
    setCustomDefs(next);
    await saveCustomDefs(next);
  }, []);

  const uninstallCustom = useCallback(async (id: string) => {
    const next = (await loadCustomDefs()).filter(d => d.id !== id);
    setCustomDefs(next);
    await saveCustomDefs(next);
    update(list => list.filter(i => i.type !== `custom:${id}`));
  }, [update]);

  return { board, customDefs, update, installCustom, uninstallCustom };
}
