# 开发 TTab 小组件

TTab 的小组件分两类：

- **内置小组件**：网页搜索、待办、便签、常用网站、时钟、倒计时、天气。代码在 `src/widgets/builtins/`。
- **自定义小组件**：用 HTML + CSS + JavaScript 写，在新标签页的「小组件 → 编辑 → 添加 → 自定义 → 新建」里打开**小组件工作室**，边写边预览，保存后即可添加。也可以导出成 `.ttwidget.json` 文件分享给别人。

## 运行环境与安全

自定义小组件运行在扩展的**沙箱页面**（`widget-sandbox.html`）里：

- 没有浏览器扩展 API，读不到 TTab 和其它网站的数据；
- 不能直接联网（沙箱的 CSP 是 `connect-src 'none'`），只能通过 `ttab.fetch` 访问**声明过的域名**；
- 所有能力都通过 `window.ttab` 向 TTab 请求，TTab 每次都会检查小组件声明的权限；
- 安装别人分享的小组件时，会先列出它要的权限，确认后才安装。

## 小组件定义

```json
{
  "format": "ttab-widget@1",
  "widget": {
    "id": "yourname.pomodoro",
    "name": "番茄钟",
    "version": "1.0.0",
    "author": "yourname",
    "description": "专注 25 分钟，休息 5 分钟。",
    "sizes": ["s", "m"],
    "defaultSize": "s",
    "permissions": ["storage"],
    "config": [
      { "key": "minutes", "label": "专注时长（分钟）", "type": "number", "default": 25 }
    ],
    "html": "<div id=\"time\">25:00</div>",
    "css": "#time { font-size: 34px; }",
    "js": "document.getElementById('time').textContent = ttab.config.minutes + ':00';"
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一标识，小写字母/数字/`.`/`_`/`-`，建议 `作者.名称` |
| `sizes` | 支持的尺寸：`s` 1×1、`m` 2×1、`l` 2×2、`w` 4×1 通栏 |
| `permissions` | 见下表 |
| `config` | 配置项，会自动生成设置表单。`type` 为 `text` / `number` / `boolean` / `select`（`select` 需要 `options: [{value,label}]`） |
| `html` / `css` / `js` | 小组件内容。`html` 放在 `#app` 里；`js` 以函数形式执行，参数是 `ttab` |

### 权限

| 权限 | 能做什么 |
| --- | --- |
| `storage` | `ttab.storage.get/set`：保存自己的数据（每个小组件实例独立，最多 100KB） |
| `bookmarks` | `ttab.bookmarks.*`：读取书签的标题、网址、域名、标签、简介、文件夹（只读） |
| `open` | `ttab.open(url)`：打开 http/https 网页 |
| `net:<域名>` | `ttab.fetch`：访问该域名，支持 `*.example.com` 通配子域名。请求不带 Cookie |

## `ttab` 接口

```js
ttab.config                // 当前配置
ttab.size                  // 当前尺寸 's' | 'm' | 'l' | 'w'
ttab.onConfigChange(cfg => {})
ttab.onResize(size => {})
ttab.notify('提示文字')     // 在 TTab 底部显示提示，不需要权限

await ttab.storage.get('key')         // 不传 key 返回全部
await ttab.storage.set('key', value)

await ttab.bookmarks.search('#前端 react', 10)   // 支持 TTab 搜索语法和拼音
await ttab.bookmarks.list({ tag: '设计', sort: 'frequent' | 'recent' | 'random', limit: 20 })
await ttab.bookmarks.tags()                      // [{ tag, count }]
// 书签对象：{ title, url, domain, tags, summary, folder }

await ttab.open('https://example.com', /* 后台打开 */ false)

const r = await ttab.fetch('https://api.example.com/x', { method: 'GET' })  // { ok, status, text }
const data = await ttab.fetchJSON('https://api.example.com/x')
```

### 样式

- 可用主题变量：`var(--text)` `var(--muted)` `var(--ai)` `var(--warn)`；
- 根元素带有当前尺寸：`html[data-size="l"] .chart { display: block; }`；
- 小组件背景由 TTab 绘制（毛玻璃面板），页面本身是透明的。

### 出错时

运行时错误会显示在小组件里，工作室的预览下方也会显示错误信息。

## 示例

工作室的"从模板开始"里有四个示例，可以直接修改：

- **番茄钟**：`storage` + 配置项
- **随机书签**：`bookmarks` + `open`
- **每日一句**：`net:v1.hitokoto.cn`，演示联网和缓存
- **空白**

## 开发内置小组件

内置小组件是普通的 React 组件，可以直接使用 TTab 内部数据：

1. 在 `src/widgets/builtins/` 新建组件，导出一个 `BuiltinWidget` 对象（名称、图标、尺寸、默认配置、`Component`、可选的 `Settings`）；
2. 需要持久数据用 `useWidgetData(instance.id, 初始值)`；
3. 需要联网时在 `hostPermissions` 里写上网址模式（添加时申请权限）；
4. 在 `src/widgets/registry.ts` 里登记。
