import type { AIConfig } from '../core/ai/client';
import type { EmbedConfig } from '../core/vectors/embedApi';
import type { ThemeSettings } from '../theme/tokens';

/**
 * 封装 chrome.storage.local 的异步操作
 */
export const storage = {
  get: async (key: string): Promise<any> => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(key);
      return result[key];
    }
    return JSON.parse(localStorage.getItem(key) || 'null');
  },

  set: async (key: string, value: any): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ [key]: value });
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  },

  getColorCache: async (): Promise<Record<string, string>> => {
    return (await storage.get('color_cache')) || {};
  },

  setColorCache: async (url: string, color: string): Promise<void> => {
    const cache = await storage.getColorCache();
    cache[url] = color;
    await storage.set('color_cache', cache);
  },

  getSettings: async () => {
    const defaults = {
      defaultFolderId: '0',
      displayMode: 'tile' as 'tile' | 'tag',
      theme: 'dark',
      showEffect: true,
      tagColorMode: true,
      pureTextMode: false,
      tagRotation: true,
      tagMaxSize: 32,
      gridColumns: 10,
      containerWidth: 960,
      language: 'auto',
      useCustomFont: true,
      wallpaper: '',
      /** 首页：smart = 智能视图（标签/组合/AI），folder = 原来的文件夹磁贴视图 */
      homeView: 'smart' as 'smart' | 'folder',
      ai: undefined as Partial<AIConfig> | undefined,
      /** 语义向量：默认只用本地向量 */
      embed: undefined as Partial<EmbedConfig> | undefined,
      /** 新收藏的书签自动归入最合适的已有文件夹 */
      autoFile: false,
      /** 外观：明暗、强调色、背景、字体、密度（见 src/theme/tokens.ts） */
      appearance: undefined as Partial<ThemeSettings> | undefined,
    };
    const saved = await storage.get('app_settings');
    return { ...defaults, ...saved };
  },

  updateSettings: async (newSettings: any) => {
    const current = await storage.getSettings();
    await storage.set('app_settings', { ...current, ...newSettings });
  },

  clearColorCache: async () => {
    await storage.set('color_cache', {});
  }
};
