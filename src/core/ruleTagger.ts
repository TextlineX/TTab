/**
 * 离线规则打标签：不需要 AI 也能让标签系统立刻可用。
 * 依据：域名词典 + 标题/路径关键词 + 所在文件夹名。
 */
import type { BookmarkRecord } from './types';
import { normalizeTag, uniqTags } from './normalize';

/** 域名 → 标签（匹配域名本身或其子域名） */
const DOMAIN_TAGS: Record<string, string[]> = {
  'github.com': ['开发', '代码托管', '开源'],
  'gitlab.com': ['开发', '代码托管'],
  'gitee.com': ['开发', '代码托管', '开源'],
  'stackoverflow.com': ['开发', '问答'],
  'developer.mozilla.org': ['开发', '前端', '文档'],
  'react.dev': ['开发', '前端', 'react', '文档'],
  'vuejs.org': ['开发', '前端', 'vue', '文档'],
  'cn.vuejs.org': ['开发', '前端', 'vue', '文档'],
  'vite.dev': ['开发', '前端', '构建工具', '文档'],
  'vitejs.dev': ['开发', '前端', '构建工具', '文档'],
  'tailwindcss.com': ['开发', '前端', 'css', '文档'],
  'typescriptlang.org': ['开发', 'typescript', '文档'],
  'nodejs.org': ['开发', 'node', '文档'],
  'npmjs.com': ['开发', '包管理'],
  'caniuse.com': ['开发', '前端', '工具'],
  'motion.dev': ['开发', '前端', '动画'],
  'dndkit.com': ['开发', '前端', 'react'],
  'flutter.dev': ['开发', 'flutter', '移动端', '文档'],
  'docs.flutter.cn': ['开发', 'flutter', '移动端', '文档'],
  'flutter.cn': ['开发', 'flutter', '移动端', '文档'],
  'pub.dev': ['开发', 'flutter', 'dart', '包管理'],
  'dart.dev': ['开发', 'dart', '文档'],
  'dart.cn': ['开发', 'dart', '文档'],
  'developer.android.com': ['开发', 'android', '移动端', '文档'],
  'developer.apple.com': ['开发', 'ios', '移动端', '文档'],
  'leetcode.com': ['开发', '算法', '刷题'],
  'leetcode.cn': ['开发', '算法', '刷题'],
  'juejin.cn': ['开发', '技术社区'],
  'csdn.net': ['开发', '技术社区'],
  'cnblogs.com': ['开发', '技术社区'],
  'segmentfault.com': ['开发', '技术社区', '问答'],
  'v2ex.com': ['技术社区', '社区'],
  'news.ycombinator.com': ['技术社区', '新闻'],
  'vercel.com': ['开发', '部署'],
  'netlify.com': ['开发', '部署'],
  'cloudflare.com': ['开发', '部署', '网络'],
  'docker.com': ['开发', '运维'],
  'chat.openai.com': ['AI', '大模型', 'AI 对话'],
  'chatgpt.com': ['AI', '大模型', 'AI 对话'],
  'openai.com': ['AI', '大模型'],
  'claude.ai': ['AI', '大模型', 'AI 对话'],
  'anthropic.com': ['AI', '大模型'],
  'gemini.google.com': ['AI', '大模型', 'AI 对话'],
  'chat.deepseek.com': ['AI', '大模型', 'AI 对话'],
  'deepseek.com': ['AI', '大模型'],
  'kimi.moonshot.cn': ['AI', '大模型', 'AI 对话'],
  'kimi.com': ['AI', '大模型', 'AI 对话'],
  'tongyi.aliyun.com': ['AI', '大模型', 'AI 对话'],
  'doubao.com': ['AI', '大模型', 'AI 对话'],
  'yiyan.baidu.com': ['AI', '大模型', 'AI 对话'],
  'huggingface.co': ['AI', '模型', '开源'],
  'perplexity.ai': ['AI', '搜索'],
  'midjourney.com': ['AI', 'AI 绘画'],
  'bilibili.com': ['视频', '娱乐'],
  'youtube.com': ['视频', '娱乐'],
  'douyin.com': ['视频', '短视频'],
  'iqiyi.com': ['视频', '影视'],
  'v.qq.com': ['视频', '影视'],
  'youku.com': ['视频', '影视'],
  'netflix.com': ['视频', '影视'],
  'music.163.com': ['音乐', '娱乐'],
  'y.qq.com': ['音乐', '娱乐'],
  'spotify.com': ['音乐', '娱乐'],
  'zhihu.com': ['问答', '社区'],
  'weibo.com': ['社交', '资讯'],
  'xiaohongshu.com': ['社交', '生活'],
  'douban.com': ['社区', '影视', '读书'],
  'reddit.com': ['社区'],
  'twitter.com': ['社交'],
  'x.com': ['社交'],
  'sspai.com': ['效率', '数码', '资讯'],
  'ifanr.com': ['数码', '资讯'],
  '36kr.com': ['科技', '资讯'],
  'taobao.com': ['购物'],
  'tmall.com': ['购物'],
  'jd.com': ['购物'],
  'pinduoduo.com': ['购物'],
  'amazon.com': ['购物'],
  'smzdm.com': ['购物', '优惠'],
  'notion.so': ['效率', '笔记', '协作'],
  'feishu.cn': ['效率', '协作', '文档'],
  'yuque.com': ['效率', '笔记', '文档'],
  'docs.qq.com': ['效率', '协作', '文档'],
  'docs.google.com': ['效率', '协作', '文档'],
  'drive.google.com': ['网盘', '效率'],
  'pan.baidu.com': ['网盘'],
  'aliyundrive.com': ['网盘'],
  'alipan.com': ['网盘'],
  'excalidraw.com': ['效率', '白板', '设计'],
  'figma.com': ['设计', 'UI 设计', '协作'],
  'dribbble.com': ['设计', '灵感'],
  'behance.net': ['设计', '灵感'],
  'huaban.com': ['设计', '灵感'],
  'zcool.com.cn': ['设计', '灵感'],
  'unsplash.com': ['设计', '图片素材'],
  'pexels.com': ['设计', '图片素材'],
  'iconfont.cn': ['设计', '图标'],
  'lucide.dev': ['设计', '图标', '开发'],
  'fonts.google.com': ['设计', '字体'],
  'translate.google.com': ['工具', '翻译'],
  'fanyi.baidu.com': ['工具', '翻译'],
  'deepl.com': ['工具', '翻译'],
  'amap.com': ['工具', '地图', '出行'],
  'map.baidu.com': ['工具', '地图', '出行'],
  'maps.google.com': ['工具', '地图', '出行'],
  '12306.cn': ['出行'],
  'ctrip.com': ['出行', '旅行'],
  'booking.com': ['出行', '旅行'],
  'coursera.org': ['学习', '课程'],
  'udemy.com': ['学习', '课程'],
  'icourse163.org': ['学习', '课程'],
  'khanacademy.org': ['学习', '课程'],
  'wikipedia.org': ['百科', '学习'],
  'baike.baidu.com': ['百科'],
  'arxiv.org': ['学习', '论文', '科研'],
  'scholar.google.com': ['论文', '科研'],
  'cnki.net': ['论文', '科研'],
  'mail.google.com': ['邮箱', '效率'],
  'outlook.live.com': ['邮箱', '效率'],
  'mail.qq.com': ['邮箱', '效率'],
  'google.com': ['搜索'],
  'bing.com': ['搜索'],
  'baidu.com': ['搜索'],
};

/** 标题/路径关键词 → 标签 */
const KEYWORD_TAGS: [RegExp, string[]][] = [
  [/\b(docs?|documentation|handbook|guide|api reference)\b|文档|手册|指南/i, ['文档']],
  [/教程|tutorial|入门|学习|course|课程/i, ['学习']],
  [/\breact\b/i, ['react', '前端']],
  [/\bvue\b/i, ['vue', '前端']],
  [/\bangular\b/i, ['angular', '前端']],
  [/\bsvelte\b/i, ['svelte', '前端']],
  [/\bnext\.?js\b/i, ['next.js', 'react', '前端']],
  [/\btypescript\b/i, ['typescript']],
  [/\bjavascript\b/i, ['javascript']],
  [/\bcss\b|样式/i, ['css', '前端']],
  [/\bflutter\b/i, ['flutter', '移动端']],
  [/\bdart\b/i, ['dart']],
  [/\bandroid\b|安卓/i, ['android', '移动端']],
  [/\b(ios|swift|swiftui)\b/i, ['ios', '移动端']],
  [/\bpython\b/i, ['python']],
  [/\b(java|spring)\b/i, ['java', '后端']],
  [/\b(go|golang)\b(?!ogle)/i, ['go', '后端']],
  [/\brust\b/i, ['rust']],
  [/\b(sql|mysql|postgres|redis|mongodb)\b|数据库/i, ['数据库', '后端']],
  [/\b(docker|kubernetes|k8s|linux|nginx)\b|运维|服务器/i, ['运维']],
  [/\b(gpt|llm|chatbot|prompt|agent)\b|大模型|提示词|智能体/i, ['AI', '大模型']],
  [/\b(ai|ml|machine learning|deep learning)\b|人工智能|机器学习|深度学习/i, ['AI']],
  [/\b(figma|sketch|ui|ux)\b|设计|配色|字体/i, ['设计']],
  [/图标|icons?\b/i, ['图标']],
  [/壁纸|wallpaper|图片|photos?\b/i, ['图片素材']],
  [/\b(blog)\b|博客/i, ['博客']],
  [/新闻|news|资讯|日报/i, ['资讯']],
  [/工具|tools?\b|在线|converter|generator|生成器|转换/i, ['工具']],
  [/翻译|translat/i, ['翻译']],
  [/下载|download/i, ['下载']],
  [/论文|paper|arxiv/i, ['论文']],
  [/面试|interview|简历|resume|招聘|jobs?\b/i, ['求职']],
  [/理财|基金|股票|finance|stock/i, ['理财']],
  [/菜谱|食谱|recipe|美食/i, ['美食']],
  [/游戏|game|steam/i, ['游戏']],
  [/小说|阅读|读书|\bbooks?\b|\bkindle\b/i, ['阅读']],
];

/** 文件夹名里没有意义的通用词 */
const GENERIC_FOLDERS = new Set([
  '收藏夹栏', '书签栏', '其他收藏夹', '其他书签', '移动收藏夹', '移动设备书签', 'bookmarks bar', 'other bookmarks',
  'favorites bar', 'other favorites', 'mobile bookmarks', '未命名', '新建文件夹', 'new folder', '收藏', 'favorites',
]);

/** 书签栏、其他收藏夹这类没有分类意义的文件夹名 */
export const isGenericFolder = (name: string) => GENERIC_FOLDERS.has(name.trim().toLowerCase());

function domainTags(domain: string): string[] {
  if (!domain) return [];
  if (DOMAIN_TAGS[domain]) return DOMAIN_TAGS[domain];
  // 匹配父域名：docs.github.com → github.com
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (DOMAIN_TAGS[parent]) return DOMAIN_TAGS[parent];
  }
  return [];
}

/** 为单个书签推断标签（不含手动标签） */
export function inferRuleTags(rec: Pick<BookmarkRecord, 'title' | 'url' | 'domain' | 'folderPath'>): string[] {
  const tags: string[] = [...domainTags(rec.domain)];
  let path = '';
  try { path = decodeURIComponent(new URL(rec.url).pathname); } catch { /* ignore */ }
  const text = `${rec.title} ${path}`;
  for (const [re, t] of KEYWORD_TAGS) if (re.test(text)) tags.push(...t);
  // 文件夹名就是用户已有的分类，直接转为标签
  for (const f of rec.folderPath) {
    const name = f.trim();
    if (name && !GENERIC_FOLDERS.has(name.toLowerCase()) && name.length <= 12) tags.push(name);
  }
  return uniqTags(tags).slice(0, 6);
}

/** 根据已有标签词表猜测（用于 popup 收藏时推荐） */
export function suggestFromVocabulary(title: string, vocabulary: string[]): string[] {
  const lower = title.toLowerCase();
  return vocabulary.filter(t => t.length >= 2 && lower.includes(normalizeTag(t).toLowerCase())).slice(0, 5);
}
