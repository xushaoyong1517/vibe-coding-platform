# 越强阀门 ValveQuote · 系统流程图

---

## 一、系统架构图

```mermaid
graph TB
  subgraph 浏览器 Browser
    UI["⚛️ React 19 / Next.js 16\n(单页应用 SPA)"]
    LS["💾 localStorage\n参数库 / 产品库\n规则表 / 报价缓存"]
  end

  subgraph 核心流程页面
    P1["🏠 首页 Dashboard\n指标 · 折线图 · 报价明细"]
    P2["✚ 新建报价\n参数录入 → BOM生成"]
    P3["☰ 报价单列表\n查看 · 删除 · 详情"]
    P4["≡ 报价明细\n查看BOM · 预览小样图"]
  end

  subgraph 数据管理页面
    D1["📐 小样图库\nPDF上传 · BOM模板"]
    D2["⊟ 阀门参数库\n19位编码对照表"]
    D3["⬡ 阀门产品库\n28个产品 · 19单元编码"]
    D4["◈ 参数库\nU1-U19参数值"]
    D5["☶ 规则库\n牌1+牌2材质对照表"]
    D6["⊕ 初始化\n历史数据批量导入"]
  end

  subgraph Next.js API Routes 后端
    A1["POST /api/claude\nskill路由器"]
    A2["GET/POST/PUT /api/drawings\nSELECT,INSERT,UPDATE"]
    A3["POST /api/drawings/parse\nPDF解析入口"]
    A4["POST /api/drawings/upload\n文件上传到Storage"]
    A5["GET/POST /api/quotes\n报价单CRUD"]
    A6["DELETE /api/quotes/[id]\n删除报价单"]
    A7["POST /api/init/upload\nExcel文字提取"]
  end

  subgraph AI Skills Moonshot/Kimi
    S1["📝 param-extract\n从自然语言/图片提取参数\nmoonshot-v1-32k"]
    S2["🔧 bom-generate\n两张牌匾 → 14行BOM\nmoonshot-v1-32k"]
    S3["📊 data-init\n提取参数组合/规则表\nmoonshot-v1-32k"]
    S4["🖼️ 视觉模型\nPDF图纸解析\nmoonshot-v1-32k-vision-preview"]
  end

  subgraph 数据层 Supabase
    DB1[("PostgreSQL\nquotes表\ndrawing_templates表")]
    ST1["Storage Bucket\ndrawings/\n*.pdf文件"]
  end

  UI --> P1 & P2 & P3 & P4
  UI --> D1 & D2 & D3 & D4 & D5 & D6
  UI <--> LS

  P2 --> A1 --> S1 & S2
  D1 --> A3 --> S4
  D3 --> A1 --> S3
  D6 --> A7

  A2 <--> DB1
  A3 --> A4 --> ST1
  A4 --> DB1
  A5 <--> DB1
  A6 --> DB1

  style 浏览器\ Browser fill:#f0f9ff,stroke:#0ea5e9
  style 核心流程页面 fill:#f0fdf4,stroke:#22c55e
  style 数据管理页面 fill:#fefce8,stroke:#eab308
  style Next.js\ API\ Routes\ 后端 fill:#faf5ff,stroke:#a855f7
  style AI\ Skills\ Moonshot/Kimi fill:#fff7ed,stroke:#f97316
  style 数据层\ Supabase fill:#fdf2f8,stroke:#ec4899
```

---

## 二、数据流图

```mermaid
flowchart LR
  subgraph 输入来源
    I1["📄 客户询价\n(文字/截图/Excel/编码)"]
    I2["📋 小样图 PDF\n(CAD图纸/扫描件)"]
    I3["📦 历史数据\n(订单/报价单/参数表)"]
  end

  subgraph 参数提取层
    E1["🤖 param-extract skill\n提取: 类型/DN/压力/主体\n阀杆/阀座/件号..."]
    E2["🤖 PDF视觉/文字解析\n提取: 阀门名称/规格\nBOM骨架/设计标准"]
    E3["🤖 data-init skill\n提取: 参数组合\n牌1/牌2规则表\n特殊要求文字"]
  end

  subgraph 本地存储 localStorage
    L1["产品库\n(28个产品 · 19单元编码)"]
    L2["参数库\n(U1-U19参数值列表)"]
    L3["规则表\n(牌1/牌2 · 可覆盖)"]
  end

  subgraph BOM生成引擎
    B1{"优先级判断"}
    B2["✅ 精确历史匹配\n(相同参数 · 已验证BOM)"]
    B3["🔄 模糊历史匹配\n(相似参数 · 标注差异字段)"]
    B4["📐 模板模式\n(小样图骨架 + AI填空)"]
    B5["🤖 AI自由生成\n(bom-generate skill\n牌1→10行 + 牌2→4行)"]
  end

  subgraph 输出
    O1["📋 报价单\n(订单号/客户/状态/台计)"]
    O2["🔩 14行BOM清单\n(零件/材质/数量/来源)"]
    O3["📁 Supabase\n持久化存储"]
  end

  I1 --> E1 --> L1
  I2 --> E2 --> L1
  I3 --> E3 --> L1 & L2 & L3

  L1 & L2 & L3 --> B1
  B1 -- "历史精确" --> B2
  B1 -- "历史相似" --> B3
  B1 -- "有小样图" --> B4
  B1 -- "无匹配" --> B5

  B2 & B3 & B4 & B5 --> O2
  O2 --> O1 --> O3

  style 输入来源 fill:#f0f9ff
  style 参数提取层 fill:#fff7ed
  style 本地存储\ localStorage fill:#fefce8
  style BOM生成引擎 fill:#f0fdf4
  style 输出 fill:#fdf4ff
```

---

## 三、日常操作流程

```mermaid
flowchart TD
  START(["👤 业务员收到询价"]) --> Q{"询价形式?"}

  Q -- "文字描述\n/截图" --> QA["✚ 新建报价\n填写客户信息"]
  Q -- "19位编码\n如Z61H-800LbC-15..." --> QB["查阀门产品库\n匹配编码"]
  Q -- "Excel文件" --> QC["初始化 → 上传Excel\nAI提取参数"]

  QA --> PARAM["录入阀门参数\n类型/DN/压力/主体/件号..."]
  QB --> PARAM
  QC --> IMPORT["参数导入产品库"] --> PARAM

  PARAM --> MATCH{"历史BOM\n匹配?"}

  MATCH -- "✅ 精确匹配\n(已有相同规格)" --> BOM_HIST["直接使用历史BOM\n标注'历史验证×N次'"]
  MATCH -- "🔄 模糊匹配\n(相似规格)" --> BOM_FUZZY["历史BOM + 差异警告\n人工核对差异字段"]
  MATCH -- "❌ 无匹配" --> DRAWING{"有小样图\n模板?"}

  DRAWING -- "✅ 有模板" --> BOM_TPL["模板骨架 + AI填材质\n'来源: 模板'"]
  DRAWING -- "❌ 无模板" --> BOM_AI["AI从零生成\n牌1+牌2两张牌匾"]

  BOM_HIST & BOM_FUZZY & BOM_TPL & BOM_AI --> REVIEW["👁️ 人工审核BOM\n查看牌1/牌2 · 核对材质"]

  REVIEW -- "❌ 有问题" --> FIX["手动修改BOM\n或重新生成"]
  FIX --> REVIEW

  REVIEW -- "✅ 确认" --> QUOTE["📋 报价单完成\n订单号: Q260528001"]
  QUOTE --> EXPORT["导出/发送\n给客户"]

  style START fill:#22c55e,color:#fff
  style EXPORT fill:#3b82f6,color:#fff
  style BOM_HIST fill:#dcfce7
  style BOM_FUZZY fill:#fef9c3
  style BOM_TPL fill:#dbeafe
  style BOM_AI fill:#fce7f3
```

---

## 四、小样图管理流程

```mermaid
flowchart LR
  subgraph 上传入口
    U1["📤 拖拽上传PDF\n新建小样图"]
    U2["🔄 重传PDF\n更新已有图纸"]
  end

  subgraph AI解析
    P1{"文字层\n字符数≥200?"}
    P2["📝 文字提取\n(CAD生成PDF)\nmoonshot-v1-32k"]
    P3["🖼️ 视觉识别\n(扫描件/图片)\nmoonshot-v1-32k-vision\n渲染scale=2.5"]
  end

  subgraph 解析结果
    R1["名称/类型/压力\nDN范围/驱动方式\nBOM骨架(14行)\n设计标准/描述"]
  end

  subgraph 人工确认
    C1["编辑基本信息"]
    C2["检查BOM模板\n修改零件/材质/数量"]
    C3["配置PDF填充字段\n(坐标/字号/遮盖)"]
  end

  subgraph 使用场景
    USE1["🔧 新建报价时\n按类型/DN/压力匹配\n→ 提供BOM骨架"]
    USE2["📊 报价详情页\n显示关联小样图\n追溯drawing_id"]
    USE3["📋 报价明细页\n预览小样图按钮\n→ 新标签打开PDF"]
  end

  U1 --> P1
  P1 -- "是" --> P2
  P1 -- "否" --> P3
  P2 & P3 --> R1 --> C1 --> C2 --> C3

  C3 --> USE1 & USE2 & USE3

  style 上传入口 fill:#f0f9ff
  style AI解析 fill:#fff7ed
  style 解析结果 fill:#f0fdf4
  style 人工确认 fill:#fefce8
  style 使用场景 fill:#fdf4ff
```

---

## 五、BOM生成决策树

```mermaid
flowchart TD
  INPUT["输入: QuoteItem\n(类型/DN/压力/主体/件号...)"]

  INPUT --> H1{"Step 1\n精确历史匹配\n5个关键字段完全相同?"}
  H1 -- "✅ 是" --> R1["✅ 返回历史BOM\n来源: exact\n标注验证次数"]

  H1 -- "❌ 否" --> H2{"Step 2\n模糊历史匹配\n类型+DN+压力+主体相同?"}
  H2 -- "✅ 是" --> R2["🔄 返回模糊BOM\n来源: fuzzy\n标注差异字段(件号等)"]

  H2 -- "❌ 否" --> H3{"Step 3\n小样图模板匹配\n类型+压力范围+DN范围?"}
  H3 -- "✅ 有模板" --> H3A["提取bom_template骨架\n替换占位符\n{{主体}}/{{阀杆轴}}/{{阀座}}..."]
  H3A --> H3B["AI填空模式\nbom-generate skill\n来源: template"]
  H3B --> R3["📐 模板BOM\n骨架稳定 · AI补材质"]

  H3 -- "❌ 无模板" --> H4["AI自由生成\nbom-generate skill"]
  H4 --> H4A{"ruleTable1/2\n覆盖?"}
  H4A -- "localStorage有自定义表" --> H4B["使用用户上传的\n牌1/牌2规则表"]
  H4A -- "无自定义" --> H4C["使用内置\n牌1/牌2规则表"]
  H4B & H4C --> R4["🤖 AI自由BOM\n来源: ai\n14行完整BOM"]

  R1 & R2 & R3 & R4 --> OUTPUT["输出: BOMResult\nbom[]\n牌1 · 牌2\n来源 · drawing_id"]

  style R1 fill:#dcfce7
  style R2 fill:#fef9c3
  style R3 fill:#dbeafe
  style R4 fill:#fce7f3
  style INPUT fill:#1e293b,color:#fff
  style OUTPUT fill:#1e293b,color:#fff
```
