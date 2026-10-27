/**
 * 浏览器书签读取/写入的适配层。
 * 非扩展环境（pnpm dev 直接在网页里打开）会使用内置示例数据，方便调试界面。
 */
import type { BookmarkRecord, FolderRecord } from './types';
import { getDomain, normalizeUrl } from './normalize';

type Node = chrome.bookmarks.BookmarkTreeNode;

export const hasBookmarkApi = () => typeof chrome !== 'undefined' && !!chrome.bookmarks?.getTree;

const ROOT_IDS = new Set(['0', 'root________']);

/** 把书签树扁平化成记录 + 文件夹列表 */
export function flattenTree(tree: Node[]): { records: BookmarkRecord[]; folders: FolderRecord[] } {
  const records: BookmarkRecord[] = [];
  const folders: FolderRecord[] = [];
  const walk = (nodes: Node[], path: string[], depth: number, parent?: string, parentIsRoot = true) => {
    for (const n of nodes) {
      if (n.url) {
        records.push({
          id: n.id,
          url: n.url,
          title: n.title || getDomain(n.url) || n.url,
          parentId: n.parentId ?? parent,
          folderPath: path,
          dateAdded: n.dateAdded,
          key: normalizeUrl(n.url),
          domain: getDomain(n.url),
        });
      } else {
        // 只有最顶层的根节点不计入路径（Edge/Chrome 中 id 为 '0'）
        const isRoot = depth === 0 || ROOT_IDS.has(n.id);
        const nextPath = isRoot ? path : [...path, n.title || '未命名'];
        if (!isRoot) folders.push({ id: n.id, title: n.title || '未命名', path: nextPath, parentId: parentIsRoot ? undefined : parent, index: n.index });
        if (n.children) walk(n.children, nextPath, depth + 1, n.id, isRoot);
      }
    }
  };
  walk(tree, [], 0);
  return { records, folders };
}

export async function loadAllBookmarks(): Promise<{ records: BookmarkRecord[]; folders: FolderRecord[] }> {
  if (!hasBookmarkApi()) return flattenTree(MOCK_TREE);
  const tree = await chrome.bookmarks.getTree();
  return flattenTree(tree);
}

export function subscribeBookmarkChanges(cb: () => void): () => void {
  if (!hasBookmarkApi() || !chrome.bookmarks.onCreated) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(cb, 200);
  };
  const evs = [
    chrome.bookmarks.onCreated, chrome.bookmarks.onRemoved, chrome.bookmarks.onChanged,
    chrome.bookmarks.onMoved, chrome.bookmarks.onChildrenReordered, chrome.bookmarks.onImportEnded,
  ].filter(Boolean);
  evs.forEach(e => e.addListener(fire));
  return () => {
    clearTimeout(timer);
    evs.forEach(e => e.removeListener(fire));
  };
}

/** 真实书签写操作（会影响浏览器书签，只在用户明确确认后调用） */
export const bookmarkOps = {
  async move(ids: string[], parentId: string) {
    if (!hasBookmarkApi()) return;
    for (const id of ids) await chrome.bookmarks.move(id, { parentId });
  },
  async createFolder(title: string, parentId?: string): Promise<string | undefined> {
    if (!hasBookmarkApi()) return undefined;
    // Edge/Chrome 中 '1' 是书签栏/收藏夹栏，'2' 是其他书签
    const node = await chrome.bookmarks.create({ title, parentId: parentId || '2' });
    return node.id;
  },
  async rename(id: string, title: string) {
    if (!hasBookmarkApi()) return;
    await chrome.bookmarks.update(id, { title });
  },
  async remove(id: string, isFolder: boolean) {
    if (!hasBookmarkApi()) return;
    if (isFolder) await chrome.bookmarks.removeTree(id);
    else await chrome.bookmarks.remove(id);
  },
  async create(title: string, url: string, parentId?: string) {
    if (!hasBookmarkApi()) return;
    await chrome.bookmarks.create({ title, url, parentId: parentId || '1' });
  },
};

/** 打开一组网页：一个用新标签页，多个时放进同一个标签组（Edge/Chrome 都支持） */
export async function openUrls(urls: string[], opts: { newWindow?: boolean; groupTitle?: string } = {}) {
  const list = urls.filter(Boolean);
  if (!list.length) return;
  if (typeof chrome === 'undefined' || !chrome.tabs?.create) {
    list.forEach(u => window.open(u, '_blank'));
    return;
  }
  if (opts.newWindow && chrome.windows?.create) {
    await chrome.windows.create({ url: list, focused: true });
    return;
  }
  const tabIds: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const tab = await chrome.tabs.create({ url: list[i], active: i === 0 && list.length === 1 });
    if (tab.id !== undefined) tabIds.push(tab.id);
  }
  if (tabIds.length > 1 && chrome.tabs.group && chrome.tabGroups?.update) {
    try {
      const groupId = (await chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] })) as unknown as number;
      if (opts.groupTitle) await chrome.tabGroups.update(groupId, { title: opts.groupTitle.slice(0, 30) });
    } catch {
      /* 标签组不可用时忽略 */
    }
  }
}

// ---------------------------------------------------------------------------
// 开发模式示例数据
// ---------------------------------------------------------------------------
const bm = (id: string, title: string, url: string): Node => ({ id, title, url, syncing: false } as Node);
const folder = (id: string, title: string, children: Node[]): Node => ({ id, title, children, syncing: false } as Node);

export const MOCK_TREE: Node[] = [
  folder('0', '', [
    folder('1', '收藏夹栏', [
      bm('101', 'GitHub', 'https://github.com/'),
      bm('102', 'React 官方文档', 'https://react.dev/learn'),
      bm('103', 'MDN Web Docs', 'https://developer.mozilla.org/zh-CN/'),
      bm('104', 'Tailwind CSS', 'https://tailwindcss.com/docs'),
      bm('105', 'Stack Overflow', 'https://stackoverflow.com/'),
      bm('106', '哔哩哔哩', 'https://www.bilibili.com/'),
      bm('107', 'ChatGPT', 'https://chat.openai.com/'),
      bm('108', 'Claude', 'https://claude.ai/'),
      folder('110', '前端', [
        bm('111', 'Vite 官方文档', 'https://vite.dev/guide/'),
        bm('112', 'TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html'),
        bm('113', 'Framer Motion', 'https://motion.dev/docs'),
        bm('114', 'dnd kit', 'https://dndkit.com/'),
        bm('115', 'Can I use', 'https://caniuse.com/'),
        bm('116', 'Vue.js 中文文档', 'https://cn.vuejs.org/guide/introduction.html'),
      ]),
      folder('120', 'Flutter', [
        bm('121', 'Flutter 中文文档', 'https://docs.flutter.cn/'),
        bm('122', 'pub.dev', 'https://pub.dev/'),
        bm('123', 'Dart 语言之旅', 'https://dart.cn/language'),
        bm('124', 'Android Developers', 'https://developer.android.com/'),
      ]),
      folder('130', '设计灵感', [
        bm('131', 'Dribbble', 'https://dribbble.com/'),
        bm('132', 'Figma', 'https://www.figma.com/'),
        bm('133', 'Unsplash 免费图片', 'https://unsplash.com/'),
        bm('134', 'Lucide Icons', 'https://lucide.dev/icons/'),
        bm('135', '花瓣网', 'https://huaban.com/'),
      ]),
    ]),
    folder('2', '其他收藏夹', [
      bm('201', '知乎', 'https://www.zhihu.com/'),
      bm('202', '少数派', 'https://sspai.com/'),
      bm('203', 'YouTube', 'https://www.youtube.com/'),
      bm('204', '淘宝', 'https://www.taobao.com/'),
      bm('205', '京东', 'https://www.jd.com/'),
      bm('206', 'Notion', 'https://www.notion.so/'),
      bm('207', '飞书文档', 'https://www.feishu.cn/'),
      bm('208', 'Hugging Face', 'https://huggingface.co/'),
      bm('209', 'DeepSeek', 'https://chat.deepseek.com/'),
      bm('210', '掘金', 'https://juejin.cn/'),
      bm('211', 'V2EX', 'https://www.v2ex.com/'),
      bm('212', '网易云音乐', 'https://music.163.com/'),
      bm('213', '高德地图', 'https://www.amap.com/'),
      bm('214', 'Google 翻译', 'https://translate.google.com/'),
      bm('215', 'GitHub 重复', 'https://github.com/?utm_source=edge'),
      bm('216', 'Coursera', 'https://www.coursera.org/'),
      bm('217', 'LeetCode 力扣', 'https://leetcode.cn/'),
      bm('218', 'Excalidraw', 'https://excalidraw.com/'),
    ]),
  ]),
];
