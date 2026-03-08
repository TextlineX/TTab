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
      containerWidth: 960, // 新增：容器宽度
      language: 'auto',    // 新增：多语言支持 (auto, zh, en)
      wallpaper: ''
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
