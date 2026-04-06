# 书签管理模块 (`useBookmarks.ts`)

该模块是 TTab 的逻辑核心，负责与 `chrome.bookmarks` API 的所有交互。

## 核心 Hook: `useBookmarks`

该自定义 Hook 管理书签的加载、导航、路径追踪和状态维护。

### 状态定义

- **bookmarks**: `BookmarkNode[]` - 当前文件夹下的书签列表。扩展了官方的 `chrome.bookmarks.BookmarkTreeNode` 类型，新增了 `color`、`size` 和 `weight` 字段。
- **loading**: `boolean` - 加载状态标识。
- **currentFolderId**: `string` - 当前视图显示的文件夹 ID。
- **rootId**: `string` - 用户设定的“逻辑根目录” ID（由 `storage` 提供）。
- **path**: `PathNode[]` - 当前层级的面包屑导航路径。

### 关键逻辑

#### 1. 全局搜索与拼音匹配
- **穿透层级**: 搜索不再局限于当前文件夹。系统调用 `chrome.bookmarks.getTree` 获取全量数据并进行扁平化处理。
- **拼音增强**: 集成 `pinyinMatch` 引擎，支持中文标题的全拼或首字母简拼检索。
- **上下文感知**: 搜索结果会自动注入 `parentTitle`（父文件夹标题），帮助用户在全局结果中快速定位方位。
- **防抖优化**: 引入了 300ms 的搜索防抖，降低大规模搜索时的 API 负载和渲染开销。

#### 2. 文件夹加载 (`loadFolder`)
- **异步获取**: 使用 `chrome.bookmarks.getSubTree` 获取子书签。
- **色彩丰富**: 结合 `storage.getColorCache()`，为每一个带有 URL 的书签节点注入缓存的色彩。
- **动态路径构建**: 通过递归或迭代的方式，向上回溯至 `rootId`。一旦回溯到 `rootId` 或到达系统根目录，路径追踪将停止，从而实现“相对路径”效果。

#### 2. 导航控制
- **navigateTo(id)**: 更改 `currentFolderId`，触发 `useEffect` 重新加载文件夹。
- **navigateBack()**: 根据 `path` 数组回退至上一级。

## 扩展字段说明

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `color` | `string` | 从图标提取的主色调 (CSS rgb 格式) |
| `size` | `string` | 在平铺模式下的尺寸比例 (small, medium, wide, large) |
| `weight` | `number` | 在标签模式下的字体权重/大小权重 (0.0 到 1.0) |

## 与 Chrome API 的集成

- **chrome.bookmarks.move**: 处理拖动排序后的数据持久化。
- **chrome.bookmarks.update**: 处理重命名。
- **chrome.bookmarks.removeTree**: 处理书签/文件夹的删除。
