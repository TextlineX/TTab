/** URL 与标签的归一化工具（纯函数，可单测） */

const TRACKING_PARAMS = /^(utm_|spm$|from$|share_|si$|fbclid$|gclid$|ref$|ref_src$|vd_source$)/i;

/** 归一化 URL 作为稳定键：去协议差异、www、hash、追踪参数、末尾斜杠 */
export function normalizeUrl(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return raw.trim();
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const qs = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
    let path = u.pathname.replace(/\/+$/, '');
    if (path === '') path = '';
    const port = u.port ? `:${u.port}` : '';
    return `${host}${port}${path}${qs}`;
  } catch {
    return raw.trim();
  }
}

export function getDomain(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 常见同义词，统一成一个规范写法 */
const TAG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  golang: 'go',
  'react.js': 'react',
  reactjs: 'react',
  'vue.js': 'vue',
  vuejs: 'vue',
  'node.js': 'node',
  nodejs: 'node',
  ai: 'AI',
  'a.i.': 'AI',
  人工智能: 'AI',
  llm: '大模型',
  大语言模型: '大模型',
  ui: '设计',
  ux: '设计',
  docs: '文档',
  documentation: '文档',
  video: '视频',
  videos: '视频',
  music: '音乐',
  shopping: '购物',
  news: '新闻',
  tools: '工具',
  tool: '工具',
  learning: '学习',
  tutorial: '教程',
  tutorials: '教程',
};

/** 标签归一化：去掉 # 和多余空白，英文统一小写，同义词合并 */
export function normalizeTag(raw: string): string {
  let t = (raw || '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length > 24) t = t.slice(0, 24);
  const lower = t.toLowerCase();
  if (TAG_ALIASES[lower]) return TAG_ALIASES[lower];
  // 纯 ASCII 标签统一小写（AI 这类大写缩写已在别名表中保留）
  return /^[\x00-\x7f]+$/.test(t) ? lower : t;
}

export function uniqTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = normalizeTag(raw);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
