# 存储模块 (`storage.ts`)

该模块封装了 `chrome.storage.local` 的异步操作，并提供了在非扩展环境下的 `localStorage` 回退逻辑。

## 1. 核心方法

- **storage.get(key)**: 异步获取指定键的值。
- **storage.set(key, value)**: 异步保存指定键的值。
- **storage.getColorCache()**: 获取所有书签图标的色彩缓存字典。
- **storage.setColorCache(url, color)**: 为特定 URL 缓存其主色调。

## 2. 应用设置 (`app_settings`)

配置对象包含以下键：

| 键 | 默认值 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `defaultFolderId` | `'0'` | `string` | 应用启动时的起始目录 (即逻辑根目录) |
| `displayMode` | `'tile'` | `'tile' | 'tag'` | UI 展示模式 |
| `wallpaper` | `''` | `string` | 壁纸 URL 或 Base64 编码。支持本地上传 (需 `unlimitedStorage` 权限) |
| `language` | `'auto'` | `string` | 语言设置 (zh, en, auto)。影响全局文案显示 |
| `useCustomFont` | `true` | `boolean` | 是否启用内置的“晓来”中文字体 |
| `gridColumns` | `10` | `number` | 平铺模式下的网格列数 |
| `containerWidth` | `960` | `number` | 容器的最大宽度 (px) |

## 3. 存储特性：自定义壁纸

- **Base64 存储**: 用户上传的本地图片会转换为 Base64 字符串。
- **无限存储权限**: 在 `manifest.json` 中配置了 `unlimitedStorage`，确保大尺寸壁纸（>5MB）能稳定保存而不受 Chrome 默认存储配额限制。
- **实时同步**: 通过 `settings_updated` 自定义事件，壁纸更改会即时反映在 `BackgroundLayer` 中。

## 3. 使用示例

```typescript
import { storage } from '../utils/storage';

// 更新设置
const updateDisplay = async () => {
  await storage.updateSettings({ displayMode: 'tag' });
};

// 获取设置并应用
const settings = await storage.getSettings();
console.log(settings.gridColumns); // 10
```
