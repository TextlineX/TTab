/**
 * TTab 智能层核心类型
 *
 * 设计原则：
 * - 浏览器书签（chrome.bookmarks）是"事实来源"，标签/集合等智能数据是叠加在其上的一层，
 *   存在扩展自己的 storage 里，不污染真实书签。
 * - 智能数据以「归一化 URL」为键，而不是书签 id：
 *   Edge 与 Chrome 之间、或重装浏览器后书签 id 会变，URL 不会。导出/导入可跨浏览器复用。
 */

/** 标签来源：手动 > AI > 规则。手动标签永远不会被自动流程覆盖 */
export type TagSource = 'manual' | 'ai' | 'rule';

export interface TagEntry {
  name: string;
  source: TagSource;
}

/** 一个网页的智能元数据 */
export interface PageMeta {
  key: string;            // 归一化 URL
  tags: TagEntry[];
  /** 用户手动移除过的标签，自动流程不会再加回来 */
  removed?: string[];
  summary?: string;
  aiTaggedAt?: number;
  ruleTaggedAt?: number;
  opens?: number;         // 通过 TTab 打开的次数
  lastOpened?: number;
}

/** 标签查询：用于动态集合和筛选 */
export interface TagQuery {
  tags: string[];
  mode: 'and' | 'or';
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  /** 静态成员（URL key） */
  keys: string[];
  /** 动态规则：满足查询的网页自动加入 */
  query?: TagQuery;
  pinned?: boolean;
  source: 'manual' | 'ai' | 'auto';
  createdAt: number;
}

/** 持久化的智能数据 */
export interface MetaState {
  version: 1;
  pages: Record<string, PageMeta>;
  collections: Collection[];
}

/** 从浏览器书签扁平化出来的一条记录 */
export interface BookmarkRecord {
  id: string;
  url: string;
  title: string;
  parentId?: string;
  folderPath: string[];   // 不含根节点的文件夹路径
  dateAdded?: number;
  key: string;            // 归一化 URL
  domain: string;
}

export interface FolderRecord {
  id: string;
  title: string;
  path: string[];         // 含自身
}

/** UI 使用的合成条目 */
export interface LibraryItem extends BookmarkRecord {
  tags: string[];
  tagEntries: TagEntry[];
  summary?: string;
  opens: number;
  lastOpened?: number;
  /** 浏览历史中的访问次数（授权后才有） */
  visits: number;
  lastVisit?: number;
  /** "此刻"推荐分：频率 × 当前时段习惯 × 新近度 */
  nowScore: number;
}

export const emptyMeta = (): MetaState => ({ version: 1, pages: {}, collections: [] });
