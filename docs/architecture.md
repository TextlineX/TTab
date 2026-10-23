# TTab 架构文档

TTab 是一个基于 **React 19** 和 **Vite 8** 构建的高级书签管理器浏览器扩展。它采用了层级化的 UI 结构，结合了强大的拖拽（dnd-kit）和动画（framer-motion）系统。

## 1. 核心层级结构 (Layer Architecture)

UI 逻辑分为两个主要图层，定义在 `src/components/layers/`：

- **BackgroundLayer**: 负责背景（极光 / 纯色 / 图片 / 必应每日），颜色来自 `src/theme` 生成的主题变量。
- **ContainerLayer**: UI 的核心容器，承载所有功能性内容。

## 2. 数据管理 (Data Flow)

### 书签管理 (`useBookmarks.ts`)
- **状态驱动**: 通过 `currentFolderId` 驱动视图更新。
- **相对路径**: 系统支持设定一个 `rootId`。当 `rootId` 被设置时，面包屑导航和回溯逻辑会将该 ID 视为逻辑上的根目录，增强了私密性和专注度。
- **实时同步**: 与 Chrome 书签 API (`chrome.bookmarks`) 深度绑定，操作（如重命名、删除、排序）会直接反映到浏览器书签中。

### 存储机制 (`storage.ts`)
- **双重支持**: 优先使用 `chrome.storage.local` 以确保扩展数据的持久性，同时提供 `localStorage` 回退，支持在非扩展环境（如开发调试）下运行。
- **配置系统**: 集中管理所有用户偏好（显示模式、网格列数、标签旋转等）。

## 3. 视觉与交互 (Visuals & Interactions)

- **智能色彩提取**: `colorExtractor.ts` 利用 Canvas API 从网页图标中动态提取主色调，用于自动为书签标签上色，提升视觉辨识度。
- **双重显示模式**: 
  - **平铺模式 (Tile)**: 响应式网格布局，支持多种尺寸（small, medium, wide, large）和拖动排序。
  - **云标签模式 (Tag)**: 动态生成的标签云，支持旋转、大小权重调节和纯文本模式。
- **动画引擎**: 使用 `framer-motion` 实现平滑的层级切换、模态框弹出和列表更新。

## 4. 技术栈概览

- **前端框架**: React 19 (TypeScript)
- **样式**: Tailwind CSS 4.0 (采用最新的 `@tailwindcss/vite` 插件)
- **拖拽系统**: @dnd-kit/core, @dnd-kit/sortable
- **动画**: framer-motion
- **图标库**: lucide-react
- **构建工具**: Vite 8.0
