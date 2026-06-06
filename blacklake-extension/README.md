# 黑湖小工单 · 本地同步浏览器扩展（MV3，SQLite/sql.js）

零构建的 Chrome 扩展：从黑湖小工单 OpenAPI 拉取 **5 张数据**（销售订单 / 客户 / 产品 / 物料清单 / 库存余额）到本地 **SQLite（sql.js WASM）**。支持**定时增量同步**与**SQL 数据浏览**。独立于任何后端。

## 登录态（重要）
黑湖**一个账号单会话**：扩展若自己调 `_login`，会把你**正在用的网页挤下线**。本扩展默认 **复用网页登录态**：
- `background.js` 用 `chrome.webRequest` 监听网页发往 `liteweb.blacklake.cn` 的请求，抓取其 `X-AUTH`（登录令牌），同步时直接复用 → **不调 `_login`，网页不掉线**。
- 选项页可切换两种模式：
  - **复用网页登录态（默认/推荐）**：保持浏览器已登录小工单网页即可，扩展借用其令牌。
  - **账号密码登录**：扩展自己 `_login`（会把网页踢下线），适合无人值守/无网页登录的场景。
- 复用模式下若提示「未捕获网页登录态」，**刷新一次小工单网页**让它发一次接口请求即可被捕获。

## 设计要点
- **SHA3-224**：黑湖登录密码需 SHA3-224，浏览器 Web Crypto 不支持 → `sha3.js` 自带（已对齐 Node crypto 验证）。
- **CORS**：跨域请求在 background service worker 发起，靠 `manifest.host_permissions` 放行。
- **本地库 = SQLite**：`sql.js`（WASM）在 SW 内运行；SW 会休眠 → 写完用 `db.export()` 导出字节存 IndexedDB，唤醒时还原（`new SQL.Database(bytes)`）。需 CSP `wasm-unsafe-eval`（已在 manifest 配好）。
- **经典 SW + importScripts**：sql.js 是 UMD，故 SW 用经典脚本 `importScripts(...)` 加载（非 ES module）。
- **定时同步**：`chrome.alarms` 周期触发增量（选项页开关 + 间隔）。
- **数据浏览**：`browse.html` 5 个表 Tab + 关键词搜索 + 自定义只读 SQL；查询经消息发给 SW 执行（只允许 SELECT/WITH/PRAGMA）。

## 文件
| 文件 | 作用 |
|---|---|
| `manifest.json` | MV3（经典 SW、WASM CSP、options_page、host_permissions） |
| `sql-wasm.js` / `sql-wasm.wasm` | sql.js 运行时（vendored，勿改名）|
| `sha3.js` | SHA3-224 |
| `blacklake.js` | 登录 + 5 接口分页抓取 + 字段映射（自定义字段平铺） |
| `sqldb.js` | SQLite 封装：建表 / upsert / 只读查询 / 导出持久化 |
| `background.js` | service worker：编排全量/增量同步、alarms、runSql |
| `popup.*` | 弹窗：同步按钮 + 条数 + 入口 |
| `options.*` | 配置（账号/密码/域名）+ 定时同步开关 |
| `browse.*` | 数据浏览：5 表 Tab + 搜索 + 只读 SQL |

## 安装
1. `chrome://extensions/` → 开**开发者模式** → **加载已解压的扩展程序** → 选本文件夹。

## 使用
1. 扩展图标 → **⚙ 配置/定时**（选项页）→ 填 **工厂码/账号/密码**（`LOGIN_TYPE=0` 填手机号）；如需自动同步，勾「启用」并设间隔 → 保存。
2. 弹窗点 **全量同步**（首次）/ **增量同步**。
3. 弹窗 → **🔎 数据浏览**：切表、搜索，或写只读 SQL（如 `SELECT * FROM products WHERE custom LIKE '%成品%'`）。

## 数据形态
每张表：snake_case 系统字段 + `custom`（租户自定义字段平铺，JSON 文本）+ `raw`（原始返回，JSON 文本）。表名：`sale_orders / customers / products / materials / stock`。

## 注意
- **接入域名**：默认 `liteweb.blacklake.cn`，按租户改 `manifest.host_permissions`（改后需重新加载扩展）。
- **密码**存 `chrome.storage.local`（明文）；更安全可改存 token / `chrome.storage.session`。
- 数据仅本地、按浏览器 profile 隔离。SQLite 字节持久化在 IndexedDB（`blsqlite/kv/db`）。
- 未在真机 Chrome 跑过自动化测试，请加载后用「全量同步」验证一次。
