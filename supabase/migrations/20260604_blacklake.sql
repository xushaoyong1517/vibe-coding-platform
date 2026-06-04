-- 黑湖小工单数据抓取：销售明细 / BOM / 库存余额 三张宽表（齐套分析用）
-- 三表均带 tenant_id，主键用业务编码 → upsert 幂等，可重复同步。

-- ① 销售订单明细宽表（订单头 + 明细行拼接，一明细一行）
CREATE TABLE IF NOT EXISTS bl_sales_order_lines (
  id            TEXT PRIMARY KEY,                 -- orderNo#seq
  tenant_id     TEXT NOT NULL DEFAULT 'yuechiang',
  order_no      TEXT,
  seq           INT,
  status        INT,                              -- 0未审批 10执行中 20已结束 30已取消
  customer_code TEXT,
  order_time    TEXT,
  arrival_plan_time TEXT,                         -- 行级交期
  product_code  TEXT,                             -- 父件（待生产产品）
  product_name  TEXT,
  product_spec  TEXT,
  unit_name     TEXT,
  qty           NUMERIC,                          -- 订单数量
  pending_qty   NUMERIC,                          -- 待排产数量
  ship_qty      NUMERIC,                          -- 发货数量
  unit_price    NUMERIC,
  amount        NUMERIC,
  raw           JSONB,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_sales_order_lines DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bl_sol_tenant_product ON bl_sales_order_lines(tenant_id, product_code);
CREATE INDEX IF NOT EXISTS idx_bl_sol_order          ON bl_sales_order_lines(tenant_id, order_no);

-- ② 物料清单 BOM（单层：父→子 + 用量）
CREATE TABLE IF NOT EXISTS bl_bom (
  id            TEXT PRIMARY KEY,                 -- parent#child#feedProcess
  tenant_id     TEXT NOT NULL DEFAULT 'yuechiang',
  parent_code   TEXT,                             -- lastProductCode
  child_code    TEXT,                             -- nextProductCode
  feed_process_code TEXT,
  unit_qty      NUMERIC,                          -- 单位用量
  remark        TEXT,
  raw           JSONB,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_bom DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bl_bom_parent ON bl_bom(tenant_id, parent_code);

-- ③ 库存余额（按产品编码总数 + 拼接产品字段）
CREATE TABLE IF NOT EXISTS bl_inventory (
  id            TEXT PRIMARY KEY,                 -- tenant#productCode
  tenant_id     TEXT NOT NULL DEFAULT 'yuechiang',
  product_code  TEXT,
  product_name  TEXT,
  product_spec  TEXT,
  unit          TEXT,
  origin_type   INT,                              -- 0自制 1外购 2委外
  stock_qty     NUMERIC,                          -- 库存总数
  safety_qty    NUMERIC,
  raw           JSONB,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_inventory DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bl_inv_product ON bl_inventory(tenant_id, product_code);
