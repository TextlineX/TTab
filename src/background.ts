/**
 * TTab 后台服务（MV3 service worker）
 * 1. 地址栏搜索：在地址栏输入 t + 空格 + 关键词，直接搜索书签（支持 #标签、拼音）
 * 2. 右键菜单：在网页或链接上右键"收藏到 TTab"，自动打标签
 */
import { loadAllBookmarks } from './core/bookmarkSource';
import { loadMeta, saveMeta } from './core/metaStore';
import { addTags, applyRuleTags, buildItems, markTagged, recordOpen, setSummary } from './core/library';
import { parseQuery, searchItems, isEmptyQuery } from './core/search';
import { inferRuleTags, suggestFromVocabulary } from './core/ruleTagger';
import { getDomain, normalizeUrl } from './core/normalize';
import { loadUsage } from './core/usage';
import { topTags, uniqueByKey, usageOf } from './core/tagGraph';
import { isAIReady, defaultAIConfig, type AIConfig } from './core/ai/client';
import { aiTagBatch, buildTagContext } from './core/ai/tasks';
import { getPageInfos } from './core/pageInfo';
import { assignThreshold, bestFolderFor, buildProfiles, isLoose } from './core/organize/organizer';
import { appendLog, chromeWriter } from './core/organize/executor';
import { buildLocalModel, toDoc } from './core/vectors/localEmbed';
import { VectorIndex } from './core/vectors/semantic';
import { storage } from './utils/storage';
import type { LibraryItem } from './core/types';

// ---------------------------------------------------------------------------
// 数据缓存：一次地址栏输入会触发多次查询，短时间内复用
// ---------------------------------------------------------------------------
let cache: { at: number; items: LibraryItem[] } | null = null;
const invalidate = () => { cache = null; };

async function getItems(): Promise<LibraryItem[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.items;
  const [{ records }, loaded, usage] = await Promise.all([loadAllBookmarks(), loadMeta(), loadUsage()]);
  // 在别处新增的书签也立刻有规则标签，不必先打开新标签页
  const meta = applyRuleTags(loaded, records);
  if (meta !== loaded) await saveMeta(meta);
  const items = buildItems(records, meta, usage);
  cache = { at: Date.now(), items };
  return items;
}

chrome.bookmarks.onCreated.addListener(invalidate);
chrome.bookmarks.onRemoved.addListener(invalidate);
chrome.bookmarks.onChanged.addListener(invalidate);
chrome.bookmarks.onMoved.addListener(invalidate);
chrome.storage.onChanged.addListener(invalidate);

// ---------------------------------------------------------------------------
// 地址栏
// ---------------------------------------------------------------------------
const xml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));

chrome.omnibox.setDefaultSuggestion({ description: '在 TTab 书签中搜索：%s（回车打开第一个结果）' });

export async function suggestionsFor(text: string): Promise<chrome.omnibox.SuggestResult[]> {
  const q = parseQuery(text);
  if (isEmptyQuery(q)) {
    // 还没输入关键词时，给出此刻最常用的
    const items = uniqueByKey(await getItems()).sort((a, b) => b.nowScore - a.nowScore || usageOf(b) - usageOf(a)).slice(0, 6);
    return items.map(toSuggestion);
  }
  return searchItems(await getItems(), q, 6).map(toSuggestion);
}

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  suggest(await suggestionsFor(text));
});

function toSuggestion(it: LibraryItem): chrome.omnibox.SuggestResult {
  const tags = it.tags.slice(0, 3).map(t => `#${t}`).join(' ');
  return {
    content: it.url,
    description: `<match>${xml(it.title)}</match> <dim>${xml(it.domain)}${tags ? '  ' + xml(tags) : ''}</dim>`,
  };
}

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  let url = /^https?:\/\//i.test(text.trim()) ? text.trim() : '';
  if (!url) {
    const first = searchItems(await getItems(), parseQuery(text), 1)[0];
    url = first ? first.url : chrome.runtime.getURL(`index.html?q=${encodeURIComponent(text)}`);
  }
  // 记录打开次数（用于推荐）
  const key = normalizeUrl(url);
  try {
    const meta = await loadMeta();
    if ((await getItems()).some(i => i.key === key)) await saveMeta(recordOpen(meta, [key]));
  } catch { /* ignore */ }
  if (disposition === 'currentTab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url });
    else await chrome.tabs.create({ url });
  } else {
    await chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
  }
});

// ---------------------------------------------------------------------------
// 右键菜单
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ttab-save-page', title: '收藏到 TTab', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'ttab-save-link', title: '把链接收藏到 TTab', contexts: ['link'] });
  });
});

async function flash(text: string, color: string) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => { void chrome.action.setBadgeText({ text: '' }); }, 2500);
  } catch { /* ignore */ }
}

export type SaveResult = 'saved' | 'exists' | 'invalid' | 'error';

/** 收藏网页并自动打标签（右键菜单调用） */
export async function saveToTTab(url: string | undefined, pageTitle: string | undefined, isLink: boolean, selectionText?: string): Promise<SaveResult> {
  if (!url || !/^https?:/i.test(url)) { await flash('×', '#9ca3af'); return 'invalid'; }
  const title = (isLink ? (selectionText || '') : (pageTitle || '')).trim() || getDomain(url) || url;

  try {
    const existing = await chrome.bookmarks.search({ url });
    if (existing.length) { await flash('已有', '#6b7280'); return 'exists'; }

    const settings = await storage.getSettings();
    // '0' 是书签树根节点，不能直接放书签；默认放进"其他收藏夹"
    const parentId = settings.defaultFolderId && settings.defaultFolderId !== '0' ? settings.defaultFolderId : '2';
    // 右键链接时拿不到链接文字：有权限的话读取目标网页的标题
    let finalTitle = title;
    if (isLink && !selectionText) {
      const infos = await getPageInfos([url]);
      if (infos[url]?.title) finalTitle = infos[url].title!;
    }
    const node = await chrome.bookmarks.create({ parentId, title: finalTitle, url });

    // 规则标签 + 已有词表匹配，立刻可用
    const key = normalizeUrl(url);
    let meta = await loadMeta();
    const { records, folders } = await loadAllBookmarks();
    const folder = folders.find(f => f.id === node.parentId);
    const vocab = topTags(buildItems(records, meta), 200).map(t => t.tag);
    const ruleTags = [...inferRuleTags({ title: finalTitle, url, domain: getDomain(url), folderPath: folder?.path || [] }), ...suggestFromVocabulary(finalTitle, vocab)];
    meta = markTagged(addTags(meta, [key], ruleTags, 'rule'), [key], 'rule');
    await saveMeta(meta);
    await flash('✓', '#10b981');

    // 配置了 AI 就顺手补充更准确的标签和简介
    const ai: AIConfig = { ...defaultAIConfig(), ...(settings.ai || {}) };
    if (isAIReady(ai)) try {
      const items = buildItems(records, meta);
      const item = items.find(i => i.key === key);
      if (item) {
        const [res] = await aiTagBatch(ai, [item], items, undefined, await buildTagContext([item], meta));
        if (res) {
          let m = await loadMeta();
          m = markTagged(addTags(m, [key], res.tags, 'ai'), [key], 'ai');
          if (res.summary && !m.pages[key]?.summary) m = setSummary(m, key, res.summary);
          await saveMeta(m);
        }
      }
    } catch (e) {
      console.warn('[TTab] AI 补充标签失败（书签已保存）', e); // 书签已经存好，AI 失败不影响
    }
    return 'saved';
  } catch (e) {
    console.warn('[TTab] 收藏失败', e);
    await flash('!', '#ef4444');
    return 'error';
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const isLink = info.menuItemId === 'ttab-save-link';
  void saveToTTab(isLink ? info.linkUrl : tab?.url, tab?.title, isLink, info.selectionText);
});



// ---------------------------------------------------------------------------
// 新收藏自动归类（设置里开启后生效）
// ---------------------------------------------------------------------------
let importing = false;
chrome.bookmarks.onImportBegan?.addListener(() => { importing = true; });
chrome.bookmarks.onImportEnded?.addListener(() => { importing = false; });

/** 自动归类比手动整理更保守：分数要明显高于阈值 */
const AUTO_MARGIN = 0.12;

export async function autoFileBookmark(id: string): Promise<string | null> {
  const settings = await storage.getSettings();
  if (!settings.autoFile) return null;
  const [{ records, folders }, loaded] = await Promise.all([loadAllBookmarks(), loadMeta()]);
  const meta = applyRuleTags(loaded, records);
  const items = buildItems(records, meta);
  const item = items.find(i => i.id === id);
  if (!item || !isLoose(item)) return null; // 用户自己选了文件夹的，不动
  const index = new VectorIndex('local', buildLocalModel(uniqueByKey(items).map(i => toDoc(i))).vectors);
  const profiles = buildProfiles(items, folders, index);
  const best = bestFolderFor(item, profiles, index);
  if (!best || best.score < assignThreshold(index) + AUTO_MARGIN) return null;
  const node = await chromeWriter.get(id);
  if (!node?.parentId) return null;
  await chromeWriter.move(id, best.profile.folder.id);
  await appendLog({
    id: `auto_${Date.now().toString(36)}`, at: Date.now(), kind: 'auto', createdFolders: [],
    moves: [{ id, title: item.title, fromParent: node.parentId, fromIndex: node.index ?? 0, toParent: best.profile.folder.id, toTitle: best.profile.folder.title }],
  });
  await flash('→', '#38bdf8');
  return best.profile.folder.title;
}

chrome.bookmarks.onCreated.addListener((id, node) => {
  if (importing || !node.url) return;
  // 等一会儿：用户可能正在浏览器的收藏对话框里自己选文件夹
  setTimeout(() => { void autoFileBookmark(id).catch(e => console.warn('[TTab] 自动归类失败', e)); }, 8000);
});

// 方便在扩展的 service worker 控制台里调试
(globalThis as Record<string, unknown>).ttab = { suggestionsFor, saveToTTab, autoFileBookmark };
