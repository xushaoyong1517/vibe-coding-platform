# 黑湖小工单 · 本地同步浏览器扩展（MV3）

零依赖、零构建的 Chrome 扩展：从黑湖小工单 OpenAPI 拉取 **5 张数据**（销售订单 / 客户 / 产品 / 物料清单 / 库存余额）到浏览器本地 **IndexedDB**。可独立于任何后端运行。

## 为什么这样设计
- **SHA3-224**：黑湖登录要求密码 SHA3-224 哈希，而浏览器 Web Crypto 不支持 SHA3 → `sha3.js` 自带实现（已逐字节对齐 Node `crypto` 验证）。
- **CORS**：跨域请求放在 background service worker，靠 `manifest.host_permissions` 放行（扩展后台不受 CORS 限制）。
- **本地库**：IndexedDB（浏览器内置），5 个对象库 + `meta`（同步时间/增量水位）。

## 文件
| 文件 | 作用 |
|---|---|
| `manifest.json` | MV3 配置（host_permissions / background module / popup） |
| `sha3.js` | SHA3-224（密码哈希） |
| `blacklake.js` | 登录 + 5 接口分页抓取 + 字段映射（含自定义字段平铺） |
| `db.js` | IndexedDB 封装（putAll/getAll/count/clear/meta） |
| `background.js` | service worker：编排全量/增量同步 |
| `popup.html` / `popup.js` | 弹窗 UI：配置、触发同步、显示条数 |

## 安装
1. Chrome 打开 `chrome://extensions/` → 开启**开发者模式**。
2. **加载已解压的扩展程序** → 选本文件夹。

## 使用
1. 点扩展图标 → 展开「连接配置」→ 填 **工厂码 / 账号 / 密码**（`LOGIN_TYPE=0` 时填手机号）→ 保存。
2. 点 **全量同步**（首次）/ **增量同步**（按 updatedAt 水位，只拉更新过的）。
3. 数据落在 IndexedDB（F12 → Application → IndexedDB → `blacklake`）。
   代码里读：`import { getAll } from './db.js'; const products = await getAll('products')`。

## 配置 / 调整
- **接入域名**：`manifest.json` 的 `host_permissions` 默认 `https://liteweb.blacklake.cn/*`，按租户改。
- **定时同步**：`background.js` 已挂 `chrome.alarms` 监听，启用时加一句
  `chrome.alarms.create('bl-sync', { periodInMinutes: 60 })`。
- **数据形态**：每张表行是 snake_case 系统字段 + `custom`（租户自定义字段平铺）+ `raw`（原始返回）。

## 注意
- 密码默认存 `chrome.storage.local`（明文）。更安全可改存 token / `chrome.storage.session`。
- 数据仅本地、按浏览器 profile 隔离，不上云。
