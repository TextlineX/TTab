# TTab - 灵动书签仪表盘 🚀

[![Build and Release Extension](https://github.com/TextlineX/TTab/actions/workflows/release.yml/badge.svg)](https://github.com/TextlineX/TTab/actions/workflows/release.yml)

TTab 是一款基于 Vite + React 开发的高性能、高交互浏览器插件。它不仅是一个书签管理器，更是一个充满工业美感与艺术气息的个人仪表盘。

## ✨ 核心特性

### 🧱 Windows 10 磁贴模式 (Start View)
- **砖墙式拼合**：采用严格的 12 列网格算法，支持 1x1, 2x2, 4x2, 4x4 多种磁贴尺寸，像砌砖墙一样严丝合缝。
- **Metro 工业美感**：彻底直角化、纯色块填充、大图标小标题，完美复刻 Windows 经典设计。
- **智能色彩引擎**：根据图标颜色自动计算背景色，并具备“三段式”对冲算法，确保任何图标都能清晰显示。

### ☁️ 灵动词云模式 (Cloud View)
- **有机权重布局**：标签根据权重（随机或文件夹深度）自动调整字号，形成中心放射状的有机布局。
- **艺术级视觉**：支持随机旋转、毛玻璃模糊以及纯文字模式，将书签转化为跳动的现代艺术品。

### 🛠️ 深度自定义控制
- **Workspace Root**：可以自由指定书签树的任何一个文件夹作为插件的“根目录”。
- **动态容器**：支持自由调节最大显示列数（4-16列）以及容器总宽度。
- **视觉主题**：内置多种高清壁纸，支持实时切换背景与粒子特效。

### ⌨️ 硬核交互体验
- **丝滑拖拽**：集成 `@dnd-kit`，支持磁贴的自由排序与位置同步。
- **右键菜单**：精致的磨砂质感菜单，支持重命名（毛玻璃对话框）、删除、进入文件夹。
- **多语言支持**：原生集成 i18n 系统，支持中文与英文自动匹配。

## 🚀 技术栈

- **构建工具**: [Vite](https://vitejs.dev/)
- **UI 框架**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **样式方案**: [Tailwind CSS 4](https://tailwindcss.com/)
- **动画/拖拽**: [Framer Motion](https://www.framer.com/motion/) + [@dnd-kit](https://dndkit.com/)
- **图标库**: [Lucide React](https://lucide.dev/)

## 📦 安装与开发

### 直接安装 (推荐)
1. 前往 [Releases](https://github.com/TextlineX/TTab/releases) 下载最新的 `ttab-extension.zip` 并解压。
2. 打开 Chrome 或 Edge 的扩展程序页面 (`edge://extensions/`)。
3. 开启“开发人员模式”。
4. 点击“加载解压后的扩展程序”，选中解压出的文件夹。

### 本地开发
```bash
# 克隆项目
git clone https://github.com/TextlineX/TTab.git

# 安装依赖
pnpm install

# 启动开发环境
pnpm dev

# 编译打包
pnpm build
```

## 📜 开源协议
本项目采用 [MIT License](LICENSE) 开源。

---
由 **Gemini CLI** 与 **TextlineX** 合作打造。
