/**
 * AI 任务：批量打标签、自然语言指令 → 动作计划
 */
import type { FolderRecord, LibraryItem, MetaState } from '../types';
import { chat, extractJson, type AIConfig } from './client';
import { RefMap, resolveActions, type ResolvedAction } from './actions';
import { topTags, uniqueByKey } from '../tagGraph';
import { uniqTags } from '../normalize';
import { describeForAI, getPageInfos, type PageInfo } from '../pageInfo';

const lineOf = (refs: RefMap, it: LibraryItem, withUrl = false) => {
  const parts = [refs.ref(it), it.title.slice(0, 60), withUrl ? it.url.slice(0, 100) : it.domain];
  if (it.folderPath.length) parts.push('📁' + it.folderPath.slice(-2).join('/'));
  if (it.tags.length) parts.push('#' + it.tags.join(' #'));
  return parts.join(' | ');
};

// ---------------------------------------------------------------------------
// 批量打标签
// ---------------------------------------------------------------------------

export interface TagSuggestion { key: string; tags: string[]; summary?: string }

const TAG_SYSTEM = `你是一个书签整理助手，为用户的网页书签打标签。
规则：
- 每个网页给 2~5 个标签，从"领域/主题"、"内容类型"（文档、工具、社区、视频、教程…）、"用途场景"几个角度选择。
- 优先复用【已有标签】里的词，保持词表统一；确有必要才创造新标签。
- 标签简短（中文 2~6 字，技术名词保留英文小写如 react、flutter），不要带 #，不要用"网站""网页""链接"这种无意义词。
- 如果提供了「简介」，以它为主要依据判断网页内容，比标题更可靠。
- 「不要」后面是用户手动删除过的标签，说明用户不认可，不要再给这个网页这些标签。
- summary 用一句中文说明这个网页是做什么的，不超过 30 字。
- 只输出 JSON：{"items":[{"ref":"b1","tags":["..."],"summary":"..."}]}，ref 必须原样使用输入里的编号。`;

export interface TagContext {
  /** url → 网页信息 */
  pageInfos?: Record<string, PageInfo>;
  /** key → 用户删除过的标签 */
  removed?: Record<string, string[]>;
}

export async function aiTagBatch(
  config: AIConfig, batch: LibraryItem[], allItems: LibraryItem[], signal?: AbortSignal, ctx: TagContext = {},
): Promise<TagSuggestion[]> {
  const refs = new RefMap(batch);
  const vocab = topTags(allItems, 80).map(t => t.tag);
  const lines = uniqueByKey(batch).map(it => {
    let line = lineOf(refs, it, true);
    const desc = describeForAI(ctx.pageInfos?.[it.url]);
    if (desc) line += ` | 简介:${desc}`;
    const removed = ctx.removed?.[it.key];
    if (removed?.length) line += ` | 不要:${removed.slice(0, 8).join(',')}`;
    return line;
  });
  const user = `【已有标签】${vocab.join('、') || '（暂无）'}

【待处理网页】（编号 | 标题 | 网址 | 所在文件夹 | 已有标签 | 简介 | 不要）
${lines.join('\n')}`;
  const text = await chat(config, TAG_SYSTEM, user, { json: true, signal, maxTokens: 4096 });
  const data = extractJson<{ items?: { ref?: string; tags?: unknown; summary?: unknown }[] }>(text);
  const out: TagSuggestion[] = [];
  for (const row of data.items || []) {
    const it = row.ref ? refs.get(row.ref) : undefined;
    if (!it || !Array.isArray(row.tags)) continue;
    const removed = new Set(ctx.removed?.[it.key] || []);
    const tags = uniqTags(row.tags.map(String)).filter(t => t.length <= 12 && !removed.has(t)).slice(0, 5);
    if (!tags.length) continue;
    out.push({ key: it.key, tags, summary: typeof row.summary === 'string' ? row.summary.slice(0, 60) : undefined });
  }
  return out;
}

/** 打标签前准备上下文：读取网页简介（已授权时）+ 用户删除过的标签 */
export async function buildTagContext(batch: LibraryItem[], state: MetaState, signal?: AbortSignal): Promise<TagContext> {
  const removed: Record<string, string[]> = {};
  for (const it of batch) {
    const r = state.pages[it.key]?.removed;
    if (r?.length) removed[it.key] = r;
  }
  const pageInfos = await getPageInfos(batch.map(i => i.url), { signal });
  return { pageInfos, removed };
}

/** 选出需要 AI 打标签的网页：没被 AI 处理过的优先 */
export function pickForTagging(items: LibraryItem[], state: MetaState, onlyNew = true): LibraryItem[] {
  return uniqueByKey(items).filter(it => !onlyNew || !state.pages[it.key]?.aiTaggedAt);
}

// ---------------------------------------------------------------------------
// 自然语言指令
// ---------------------------------------------------------------------------

const PLAN_SYSTEM = `你是 TTab（浏览器新标签页书签助手）里的 AI 操作员。用户用自然语言描述需求，你把它转换成结构化动作，用户确认后执行。

可用动作（只能用这些）：
- {"type":"filter","tags":["标签"],"query":"关键词","mode":"and|or"}  在界面上筛选显示
- {"type":"open","items":["b1","b2"],"groupTitle":"标签组名"}  在浏览器里打开网页（最多 20 个，会放进同一个标签组）
- {"type":"addTags","items":["b1"],"tags":["标签"]}
- {"type":"removeTags","items":["b1"],"tags":["标签"]}
- {"type":"renameTag","from":"旧标签","to":"新标签"}  合并/重命名标签
- {"type":"createCollection","name":"组合名","emoji":"🎨","description":"一句话","items":["b1"],"tags":["标签"],"mode":"and|or"}
    组合 = 一组常一起用的网页。items 为固定成员；tags 为动态规则（以后打了这些标签的网页自动加入），两者可同时使用。
- {"type":"setSummary","item":"b1","summary":"一句话简介"}
- {"type":"moveBookmarks","items":["b1"],"folderId":"文件夹id"} 或 {"type":"moveBookmarks","items":["b1"],"newFolder":"新文件夹名"}
    会修改浏览器真实书签，仅当用户明确要求"移动/整理到文件夹"时才使用。

要求：
- items 只能使用【网页】列表里出现的编号，绝不编造。
- 用户说"这些/选中的"时指【当前选中】的网页。
- 做场景组合时，按真实使用场景（如"写前端代码""找设计灵感""日常娱乐"）分组，每组 3~12 个网页，组名简短。
- 能用标签解决的优先用标签和组合，不要轻易移动书签；不存在删除书签的能力，用户要求删除时在 reply 中说明请手动操作。
- 如果只是想找东西，用 filter 或直接 open。
- 只输出 JSON：{"reply":"用一两句中文告诉用户你打算做什么","actions":[...]}。没有合适的动作时 actions 为空数组，在 reply 里解释。`;

/** 中文没有空格，用二元组近似计算相关度，挑选发给模型的候选网页 */
function relevance(command: string, it: LibraryItem): number {
  const hay = `${it.title} ${it.domain} ${it.tags.join(' ')} ${it.folderPath.join(' ')} ${it.summary || ''}`.toLowerCase();
  const c = command.toLowerCase();
  let s = 0;
  for (const w of c.split(/[\s,，。、]+/).filter(x => x.length >= 2 && /^[\x00-\x7f]+$/.test(x))) if (hay.includes(w)) s += 3;
  const cjk = c.replace(/[^一-龥]/g, '');
  for (let i = 0; i < cjk.length - 1; i++) if (hay.includes(cjk.slice(i, i + 2))) s += 1;
  for (const t of it.tags) if (c.includes(t.toLowerCase())) s += 4;
  return s;
}

export interface PlanContext {
  items: LibraryItem[];
  folders: FolderRecord[];
  state: MetaState;
  selectedKeys: string[];
  activeTags: string[];
  /** 与指令的语义相似度（有向量时），用于书签很多时挑选候选 */
  semanticSim?: Map<string, number>;
}

export interface Plan {
  reply: string;
  actions: ResolvedAction[];
  refs: RefMap;
}

const MAX_ITEMS = 350;

export function buildPlanPrompt(command: string, ctx: PlanContext): { user: string; refs: RefMap } {
  const all = uniqueByKey(ctx.items);
  let pool = all;
  if (all.length > MAX_ITEMS) {
    const selected = new Set(ctx.selectedKeys);
    const scored = all.map(it => ({ it, s: (selected.has(it.key) ? 1000 : 0) + relevance(command, it) * 10 + (ctx.semanticSim?.get(it.key) || 0) * 60 + Math.min(it.opens + it.visits / 3, 20) }));
    pool = scored.sort((a, b) => b.s - a.s).slice(0, MAX_ITEMS).map(x => x.it);
  }
  const refs = new RefMap(pool);
  const selectedRefs = ctx.selectedKeys.map(k => pool.find(p => p.key === k)).filter(Boolean).map(it => refs.ref(it!));
  const vocab = topTags(all, 120).map(t => `${t.tag}(${t.count})`).join(' ');
  const folders = ctx.folders.slice(0, 150).map(f => `${f.id}:${f.path.join('/')}`).join('\n');
  const cols = ctx.state.collections.map(c => c.name).join('、');
  const user = `【用户指令】${command}

【当前选中】${selectedRefs.join(', ') || '无'}
【当前筛选标签】${ctx.activeTags.join(', ') || '无'}
【已有组合】${cols || '无'}
【标签词表】${vocab || '（还没有标签）'}
【书签文件夹】（id:路径）
${folders || '无'}

【网页】共 ${all.length} 个${all.length > pool.length ? `，以下是与指令最相关的 ${pool.length} 个` : ''}（编号 | 标题 | 域名 | 文件夹 | 标签）
${pool.map(it => lineOf(refs, it)).join('\n')}`;
  return { user, refs };
}

export async function planCommand(config: AIConfig, command: string, ctx: PlanContext, signal?: AbortSignal): Promise<Plan> {
  const { user, refs } = buildPlanPrompt(command, ctx);
  const text = await chat(config, PLAN_SYSTEM, user, { json: true, signal, maxTokens: 4096 });
  const data = extractJson<{ reply?: unknown; actions?: unknown }>(text);
  return {
    reply: typeof data.reply === 'string' ? data.reply.slice(0, 300) : '',
    actions: resolveActions(data.actions, refs, ctx.folders),
    refs,
  };
}

/** 快捷指令 */
export const QUICK_COMMANDS = [
  { id: 'scenes', label: '生成场景组合', prompt: '根据我的书签，按日常使用场景生成 4~6 个组合，每个组合配一个 emoji，并尽量为组合设置动态标签规则。' },
  { id: 'tidyTags', label: '统一标签词表', prompt: '检查标签词表，把意思重复或写法不同的标签合并成统一写法（用 renameTag），不要合并含义不同的标签。' },
  { id: 'untagged', label: '补全缺失标签', prompt: '为还没有标签或标签少于 2 个的网页补充合适的标签。' },
  { id: 'focus', label: '开始专注工作', prompt: '打开我最常用的开发/工作相关网页（最多 6 个），标签组命名为"专注"。' },
];
