/**
 * 小组件类型定义
 *
 * 网格：桌面 4 列、窄屏 2 列，每行固定高度。
 *   s = 1×1 小方块   m = 2×1 横条   l = 2×2 大块   w = 4×1 通栏
 */
import type React from 'react';
import type { Collection, LibraryItem } from '../core/types';

export type WidgetSize = 's' | 'm' | 'l' | 'w';

export const SIZE_LABEL: Record<WidgetSize, string> = { s: '小', m: '中', l: '大', w: '通栏' };

export interface WidgetInstance {
  id: string;
  /** 内置类型，或 custom:<定义 id> */
  type: string;
  size: WidgetSize;
  config: Record<string, unknown>;
}

export interface WidgetBoardState {
  version: 1;
  instances: WidgetInstance[];
}

/** 提供给小组件的宿主能力 */
export interface WidgetHost {
  items: LibraryItem[];
  collections: Collection[];
  openUrl: (url: string, background?: boolean) => void;
  notify: (text: string) => void;
}

export interface WidgetProps<C = Record<string, unknown>> {
  instance: WidgetInstance;
  config: C;
  setConfig: (patch: Partial<C>) => void;
  host: WidgetHost;
}

export interface WidgetSettingsProps<C = Record<string, unknown>> {
  config: C;
  setConfig: (patch: Partial<C>) => void;
  host: WidgetHost;
}

/** 内置小组件定义 */
export interface BuiltinWidget<C = Record<string, unknown>> {
  type: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  defaultConfig: C;
  Component: React.FC<WidgetProps<C>>;
  Settings?: React.FC<WidgetSettingsProps<C>>;
  /** 需要的网站访问权限（添加时申请） */
  hostPermissions?: string[];
}

// ---------------------------------------------------------------------------
// 自定义小组件（在沙箱里运行）
// ---------------------------------------------------------------------------

/**
 * 权限：
 *   bookmarks  读取书签（标题、网址、标签，只读）
 *   open       打开网页
 *   storage    保存自己的数据
 *   net:<域名>  访问指定域名（例如 net:v1.hitokoto.cn）
 */
export type WidgetPermission = 'bookmarks' | 'open' | 'storage' | `net:${string}`;

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
}

export interface CustomWidgetDef {
  /** 唯一标识，建议 作者.名称，如 textline.pomodoro */
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  permissions: WidgetPermission[];
  config?: ConfigField[];
  html: string;
  css: string;
  js: string;
}

export const WIDGET_FILE_FORMAT = 'ttab-widget@1';
