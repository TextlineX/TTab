# TTab 云端服务

给 TTab 扩展用的小服务器：**账号、跨浏览器同步、社区标签比对**。零依赖，只要 Node 18+，数据存成 JSON 文件。

不部署它，TTab 照样完整可用（所有数据只在本机）。

## 运行

```bash
node server.mjs                 # 默认监听 0.0.0.0:8787，数据在 ./data
PORT=9000 DATA_DIR=/var/lib/ttab node server.mjs
docker build -t ttab-server . && docker run -d -p 8787:8787 -v ttab-data:/data ttab-server
```

**务必放在 HTTPS 反向代理（Nginx / Caddy）后面**：扩展只允许连接 `https://` 服务器（本机测试的 `http://localhost` 除外）。放在代理后面时设置 `TRUST_PROXY=1`，登录限流才能看到真实 IP。

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `PORT` / `HOST` | 8787 / 0.0.0.0 | 监听地址 |
| `DATA_DIR` | ./data | 数据目录（用户、同步数据、社区票数、签名密钥） |
| `ALLOW_REGISTER` | 开 | 设为 `0` 关闭注册（给自己用时建议注册完自己的账号后关掉） |
| `MIN_VOTES` | 2 | 社区建议至少需要几个人投同一个标签 |
| `TTAB_SECRET` | 自动生成 | 令牌签名密钥；不设置则第一次启动时生成并保存在 `data/secret` |
| `TRUST_PROXY` | 关 | 设为 `1` 时读取 `X-Forwarded-For` |

## 在扩展里使用

设置 → 云端与同步 → 填服务器地址 → 连接（浏览器会请求访问该服务器的权限）→ 注册/登录。三个开关**默认全部关闭**：

1. **跨浏览器同步标签和组合** —— 按网页、按组合比较修改时间，后修改的算数；删除的组合用「墓碑」传播。
2. **匿名贡献我的手动标签** —— 只上传网址的 SHA-256 哈希和你亲手打的标签。服务器不知道你收藏了什么。
3. **新书签自动与社区比对** —— 没有 AI 也能给没有标签的书签补上社区共识；也可以手动「比对」，看建议后再应用。

## 同义词表

在 `data/aliases.json` 里写 `{"js": "javascript", "前端": "web"}`，所有用户下次比对时自动生效，不用发新版扩展。

## 接口

全部 JSON，除注册/登录/健康检查/同义词外都要 `Authorization: Bearer <token>`。

- `POST /api/register` `{email,password}` · `POST /api/login` · `POST /api/logout`（令牌立即失效）· `GET /api/me` · `DELETE /api/account` `{password}`
- `POST /api/sync` `{pages,collections,tombstones,cursor}` → 增量返回其他设备的修改
- `POST /api/contribute` `{items:[{h,d,tags}]}` · `POST /api/suggest` `{items:[{h,d}]}` · `DELETE /api/contributions`
- `GET /api/aliases` · `GET /api/health`

## 安全与隐私

- 密码用 scrypt + 随机盐；令牌是 HMAC 签名、30 天有效、退出登录即失效；登录失败 10 次后限流 10 分钟。
- 社区投票只存哈希，投票人是服务器密钥派生的匿名 ID；删除账号会一并删除这些票。
- 请求体上限 4MB，同步和贡献数量都有上限。

## 测试

```bash
npm test      # 在 server 目录
```
