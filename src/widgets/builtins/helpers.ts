/** 内置小组件的纯函数（与界面分开，方便测试） */

export const ENGINES: { id: string; name: string; url: string }[] = [
  { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { id: 'custom', name: '自定义', url: '' },
];

export const searchUrl = (cfg: { engine: string; customUrl: string }, q: string) => {
  const tpl = cfg.engine === 'custom' ? cfg.customUrl : ENGINES.find(e => e.id === cfg.engine)?.url || ENGINES[0].url;
  return (tpl || ENGINES[0].url).replace('%s', encodeURIComponent(q));
};

export function daysUntil(date: string, now = new Date()): number | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400e3);
}

/** WMO 天气代码 */
const WMO: [number[], string, string][] = [
  [[0], '晴', '☀️'], [[1, 2], '少云', '🌤️'], [[3], '阴', '☁️'], [[45, 48], '雾', '🌫️'],
  [[51, 53, 55, 56, 57], '毛毛雨', '🌦️'], [[61, 63, 65, 66, 67, 80, 81, 82], '雨', '🌧️'],
  [[71, 73, 75, 77, 85, 86], '雪', '🌨️'], [[95, 96, 99], '雷雨', '⛈️'],
];
export const describeWeather = (code: number) => {
  const hit = WMO.find(([codes]) => codes.includes(code));
  return hit ? { text: hit[1], emoji: hit[2] } : { text: '未知', emoji: '🌡️' };
};
