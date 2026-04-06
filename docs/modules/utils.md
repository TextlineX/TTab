# 工具函数模块 (`utils/`)

## 1. 拼音匹配引擎 (`pinyinUtils.ts`)

为了提升中文用户的搜索体验，该模块提供了一套轻量级的拼音处理逻辑。

### `getPinyinInitials(str: string)`
- **功能**: 提取中文字符串的拼音首字母。
- **实现**: 内置了常用汉字到拼音首字母的映射表 (`PINYIN_MAP`)，支持快速转换。

### `pinyinMatch(text: string, query: string)`
- **逻辑**: 
  1. **原词匹配**: 检查 `text` 是否直接包含 `query`。
  2. **拼音首字母匹配**: 提取 `text` 的首字母串，并检查是否包含 `query`。
- **场景**: 允许用户输入 `bd` 匹配到 “百度”。

## 2. 智能色彩提取 (`colorExtractor.ts`)

该工具通过分析 Favicon 图标，为每一个书签生成独特的视觉标识。

### `extractColorFromIcon(url: string)`
- **原理**: 
  1. 将图像绘制到 `Canvas`。
  2. 遍历 `ImageData` 像素，计算非透明像素的 RGB 平均值。
- **降级**: 加载失败时从 `PREMIUM_PALETTE` 随机选取。

## 3. 国际化支持 (`i18n.ts`)

全面的本地化方案，已覆盖应用的所有交互细节。

- **动态加载**: 组件（如 `SettingsPanel`, `ContextMenu`）会从 `storage` 获取语言偏好并应用对应的翻译字典。
- **覆盖范围**: 包含设置项标题、壁纸管理提示、搜索结果状态、右键菜单指令、重命名对话框及文件夹浏览器。
- **自动检测**: 支持 `auto` 模式，通过 `navigator.language` 自动适配用户浏览器语言。
