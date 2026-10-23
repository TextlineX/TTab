# 智能层（标签 / 组合 / AI）

## 数据模型

浏览器书签是事实来源，TTab 的智能数据叠加在其上，存在 `chrome.storage.local` 的 `ttab_meta_v1` 键里，**不修改真实书签**。

- 以**归一化 URL** 为键（去掉 www、追踪参数、hash、末尾斜杠），不用书签 id。Edge 和 Chrome 的书签 id 不同，URL 相同，所以导出/导入可以跨浏览器合并。
- `PageMeta.tags[]`：每个标签带来源 `manual | ai | rule`。手动 > AI > 规则，高优先级不会被低优先级覆盖。
- `PageMeta.removed[]`：用户手动删掉的标签，AI 和规则不会再加回来。
- `Collection`：组合 = 固定成员 `keys` + 可选的动态规则 `query`（满足标签条件的网页自动加入）。

## 模块

| 文件 | 作用 |
| --- | --- |
| `core/types.ts` | 类型定义 |
| `core/normalize.ts` | URL / 标签归一化，同义词合并（js→javascript、人工智能→AI…） |
| `core/library.ts` | 对智能数据的纯函数操作（不可变，便于撤销） |
| `core/bookmarkSource.ts` | 读取/监听/写入浏览器书签，批量打开并放进标签组；开发模式内置示例书签 |
| `core/metaStore.ts` | 持久化、跨标签页同步、导入导出 |
| `core/ruleTagger.ts` | 离线规则打标签：域名词典 + 标题关键词 + 文件夹名 |
| `core/tagGraph.ts` | 相关标签、相关网页（标签 TF-IDF 余弦）、推荐组合（频繁标签组合 + 去冗余）、智能视图 |
| `core/search.ts` | 搜索语法：`#标签`、`-#标签`、`site:域名`、拼音首字母 |
| `core/usage.ts` | 浏览历史统计（可选权限 history）：访问次数、8 个时段分布、“此刻”推荐分；缓存 6 小时 |
| `core/pageInfo.ts` | 读取网页简介给 AI（可选主机权限）：只读前 256KB、识别 GBK、不带 Cookie、缓存 30 天 |
| `utils/pinyinData.ts` | 6763 个常用汉字的拼音表（由 pypinyin 数据生成，MIT） |
| `background.ts` | 后台服务：地址栏搜索（关键词 `t`）、右键收藏；控制台里可用 `ttab.suggestionsFor()` / `ttab.saveToTTab()` 调试 |
| `core/vectors/vecmath.ts` | 向量运算、Int8 量化存储、球面 k-means |
| `core/vectors/localEmbed.ts` | 本地向量：中文二元组/单字 + 英文单词 + 标签/域名特征，TF-IDF + 带符号特征哈希（512 维） |
| `core/vectors/embedApi.ts` | 向量接口（OpenAI 兼容 /embeddings），各厂商批大小、复用对话 Key |
| `core/vectors/vectorStore.ts` | 接口向量存储：按文本哈希增量更新，换模型自动重建 |
| `core/vectors/semantic.ts` | 相似度索引：相关网页、意思相近搜索、自动分组（≤700 个用邻域分组，更多用 k-means） |
| `core/vectors/related.ts` | 相关网页：标签关系与内容相似度融合 |
| `state/useSemantic.ts` | 选择本地/接口向量（接口向量覆盖 ≥80% 才切换），后台增量同步，空闲时计算分组 |
| `core/organize/organizer.ts` | 自动整理方案：文件夹画像（内容中心 + 标签 + 名称）打分归入已有文件夹，剩余按共享标签新建主题文件夹 |
| `core/organize/aiPlan.ts` | AI 规划整理方案（校验文件夹 id、同名合并、丢弃单个书签的新文件夹） |
| `core/organize/executor.ts` | 执行整理并记录日志；撤销时按原位置还原、删除空的新建文件夹 |
| `widgets/*` | 小组件：布局与数据存储、内置小组件、沙箱运行时（`public/widget-sandbox.*`）、宿主接口与权限检查、小组件工作室，详见 [widgets.md](../widgets.md) |
| `core/ai/client.ts` | 多厂商客户端：OpenAI 兼容格式（DeepSeek/通义/智谱/Kimi/OpenAI/Gemini/Ollama）和 Claude 原生格式 |
| `core/ai/actions.ts` | AI 可提议的动作、校验、执行 |
| `core/ai/tasks.ts` | 批量打标签、自然语言指令 → 动作计划、快捷指令 |
| `state/useLibrary.ts` | React 状态中心：合并书签与智能数据、撤销栈、自动规则打标签 |
| `components/smart/*` | 智能视图界面 |

## 权限

| 权限 | 类型 | 用途 |
| --- | --- | --- |
| bookmarks / storage / unlimitedStorage / favicon | 必需 | 读写书签、保存标签数据、显示网站图标 |
| tabs / tabGroups | 必需 | 批量打开网页并放进同一个标签组 |
| contextMenus | 必需 | 右键“收藏到 TTab” |
| 网站访问（指定域名） | 可选 | 天气小组件（open-meteo.com）、自定义小组件声明的 net:<域名>，添加时申请 |
| history | 可选 | 参考浏览历史推荐，在设置或首页提示中开启 |
| 网站访问（https/http） | 可选 | 访问 AI 接口（只申请该接口域名）；开启“读取网页简介”时申请全部网站 |

可选权限不会在安装或升级时弹出警告，用户主动开启时才申请，随时可以在设置里关闭。

## AI 安全边界

- AI 只能"提议"动作，全部在预览面板里勾选确认后才执行。
- 只改智能层的动作（标签、组合、筛选、打开）默认勾选；**移动真实书签默认不勾选**并以琥珀色标出；没有删除书签的动作。
- 发给模型的网页用短编号 `b1、b2…` 表示，模型返回的编号会校验，编造的直接丢弃。
- 书签很多时（>350 个），只把与指令最相关的 350 个发给模型。
- 接口域名权限是可选权限，在设置里"保存并测试连接"时按需申请。

## 测试

```bash
pnpm test   # 等价于 npx tsx --test tests/*.test.ts
```

覆盖归一化、规则打标签、标签不可变操作、相关推荐、组合、搜索语法、AI 请求格式、JSON 容错、动作校验与执行。
