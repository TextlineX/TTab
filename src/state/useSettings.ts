import { useCallback, useEffect, useState } from 'react';
import { storage } from '../utils/storage';
import { defaultAIConfig, type AIConfig } from '../core/ai/client';

export type AppSettings = Awaited<ReturnType<typeof storage.getSettings>> & { ai: AIConfig };

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const load = useCallback(async () => {
    const s = await storage.getSettings();
    setSettings({ ...s, ai: { ...defaultAIConfig(), ...(s.ai || {}) } } as AppSettings);
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener('settings_updated', load);
    return () => window.removeEventListener('settings_updated', load);
  }, [load]);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((prev: AppSettings | null) => (prev ? { ...prev, ...patch } : prev));
    await storage.updateSettings(patch);
    window.dispatchEvent(new Event('settings_updated'));
  }, []);

  return { settings, update };
}
