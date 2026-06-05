-- 黑湖数据表重构：废弃旧的 3 张派生宽表，改为与接口 1:1 的 5 张「贴源」表。
-- 原则：① 系统字段(每租户都有) → 强类型列；② 租户级自定义字段 → custom JSONB(字段名→值，加字段零 DDL)。
-- 五表：销售订单 / 客户 / 产品 / 物料清单 / 库存余额。raw 存整条原始返回，便于排障。

-- ── 删除旧表（含上一版 custom 列与字段元数据表）──
DROP TABLE IF EXISTS bl_sales_order_lines;
DROP TABLE IF EXISTS bl_bom;
DROP TABLE IF EXISTS bl_inventory;
DROP TABLE IF EXISTS bl_field_meta;

-- ── ① 销售订单（saleOrder/queryList，一明细行一行：订单头 + 明细行系统字段）──
CREATE TABLE IF NOT EXISTS bl_sale_orders (
  id                TEXT PRIMARY KEY,                 -- tenant#orderNo#seq
  tenant_id         TEXT NOT NULL DEFAULT 'yuechiang',
  order_no          TEXT,
  status            INT,                              -- 0未审批 10执行中 20已结束 30已取消
  customer_code     TEXT,
  customer_name     TEXT,
  contract_no       TEXT,
  order_time        TEXT,
  approved_time     TEXT,
  end_time          TEXT,
  seq               INT,
  product_code      TEXT,
  product_name      TEXT,
  product_spec      TEXT,
  unit_name         TEXT,
  qty               NUMERIC,
  pending_qty       NUMERIC,                          -- 待排产数量
  ship_qty          NUMERIC,
  unit_price        NUMERIC,
  amount            NUMERIC,
  arrival_plan_time TEXT,
  custom            JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw               JSONB,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_sale_orders DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bl_so_tenant_product ON bl_sale_orders(tenant_id, product_code);
CREATE INDEX IF NOT EXISTS idx_bl_so_order          ON bl_sale_orders(tenant_id, order_no);

-- ── ② 客户（customer/queryList）──
CREATE TABLE IF NOT EXISTS bl_customers (
  id                TEXT PRIMARY KEY,                 -- tenant#code
  tenant_id         TEXT NOT NULL DEFAULT 'yuechiang',
  bl_id             NUMERIC,                          -- 黑湖客户 id
  code              TEXT,
  name              TEXT,
  full_name         TEXT,
  contact           TEXT,
  phone             TEXT,
  address           TEXT,
  receivable_days   INT,
  responsible_users  JSONB,                           -- 负责人(用户) 数组
  responsible_groups JSONB,                           -- 负责人(部门) 数组
  custom            JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw               JSONB,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_customers DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bl_cust_code ON bl_customers(tenant_id, code);

-- ── ③ 产品（product/queryList）──
CREATE TABLE IF NOT EXISTS bl_products (
  id                TEXT PRIMARY KEY,                 -- tenant#productCode
  tenant_id         TEXT NOT NULL DEFAULT 'yuechiang',
  product_code      TEXT,
  product_name      TEXT,
  product_spec      TEXT,                             -- productSpecification
  unit              TEXT,
  origin_type       INT,                              -- 0自制 1外购 2委外
  stock_qty         NUMERIC,
  cost_price        NUMERIC,
  sales_price       NUMERIC,
  safety_qty        NUMERIC,
  max_qty           NUMERIC,
  min_qty           NUMERIC,
  process_routing_code TEXT,
  vendor_code       TEXT,
  warehouse_code    TEXT,
  custom            JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw               JSONB,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_products DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bl_prod_code ON bl_products(tenant_id, product_code);

-- ── ④ 物料清单 BOM（materials/queryList，单层 父→子 + 用量）──
CREATE TABLE IF NOT EXISTS bl_materials (
  id                TEXT PRIMARY KEY,                 -- tenant#last#next#feedProcess
  tenant_id         TEXT NOT NULL DEFAULT 'yuechiang',
  last_product_code TEXT,                             -- 父项
  next_product_code TEXT,                             -- 子项
  feed_process_code TEXT,
  unit_qty          NUMERIC,                          -- 单位用量
  remark            TEXT,
  created_at        TEXT,
  updated_at        TEXT,
  custom            JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw               JSONB,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_materials DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bl_mat_parent ON bl_materials(tenant_id, last_product_code);

-- ── ⑤ 库存余额（stock/queryStockInfoDetail，产品×仓库一行）──
CREATE TABLE IF NOT EXISTS bl_stock (
  id                TEXT PRIMARY KEY,                 -- tenant#productCode#warehouseCode
  tenant_id         TEXT NOT NULL DEFAULT 'yuechiang',
  product_id        NUMERIC,
  product_code      TEXT,
  product_name      TEXT,
  warehouse_id      NUMERIC,
  warehouse_code    TEXT,
  warehouse_name    TEXT,
  qty_in_warehouse  NUMERIC,
  unit_name         TEXT,
  custom            JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw               JSONB,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_stock DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bl_stock_product ON bl_stock(tenant_id, product_code);
