# 阀门智能报价系统

面向阀门询价、参数确认、BOM 生成与报价管理的业务系统。系统使用 AI 处理自然语言、表格和图纸中的模糊信息，再由确定性规则完成参数归一、产品匹配、材质推导和 BOM 合成。

## 核心能力

- 文本、Excel、PDF、图片询价参数提取
- 阀门参数归一化与 19 位产品编码匹配
- 牌 1 / 牌 2、高温等规则驱动的确定性 BOM
- 报价单、报价明细、状态流转与打印
- 小样图上传、解析、预览和模板填充
- 多租户数据隔离
- 黑湖销售订单、产品、物料和库存同步及齐套分析

## 技术架构

- Next.js 16 / React 19
- Supabase PostgreSQL 与 Storage
- Moonshot Kimi 文本及视觉模型
- 黑湖小工单 OpenAPI
- TypeScript 领域规则与 Node.js 单元测试

设计原则：AI 负责候选信息提取，编码、材质、BOM 和状态流转由可测试的规则与业务数据决定。

## 本地运行

项目要求 Node.js 22，并使用 pnpm 管理依赖。

```bash
nvm use 22
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 环境变量

- `MOONSHOT_API_KEY`：Kimi API 密钥
- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 地址
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase anon key
- `AUTH_SECRET`：登录会话签名密钥，生产环境必须配置
- `CRON_SECRET`：黑湖定时同步接口鉴权密钥
- `BLACKLAKE_*`：黑湖 OpenAPI 登录与工厂配置

完整字段见 `.env.example`。

## 质量检查

```bash
pnpm type-check
node --test lib/*.test.mjs
pnpm build
```

仓库治理路线与阶段计划见 `docs/仓库治理方案.html`。
