-- 阀门产品库 · 19位编码
CREATE TABLE IF NOT EXISTS valve_products (
  id          TEXT PRIMARY KEY,       -- 序号/组别 e.g. '103030380'
  U1          TEXT NOT NULL DEFAULT '',   -- 特殊功能前缀
  U2          TEXT NOT NULL DEFAULT 'Z',  -- 阀门类型
  U3          TEXT NOT NULL DEFAULT '',   -- 驱动方式
  U4          TEXT NOT NULL DEFAULT '4',  -- 连接方式
  U5          TEXT NOT NULL DEFAULT '1',  -- 结构形式
  U6          TEXT NOT NULL DEFAULT 'W',  -- 密封面材料
  U7          TEXT NOT NULL DEFAULT '150Lb', -- 压力等级
  U8          TEXT NOT NULL DEFAULT 'C',  -- 阀体材料
  U9          INTEGER NOT NULL DEFAULT 50, -- 口径 DN
  U10         TEXT NOT NULL DEFAULT 'R',  -- 端面形式
  U11         TEXT NOT NULL DEFAULT '0',  -- 阀盖连接
  U12         TEXT NOT NULL DEFAULT 'A',  -- 流道直径
  U13         TEXT NOT NULL DEFAULT '00', -- 阀杆材质
  U14         TEXT NOT NULL DEFAULT '00', -- 阀芯材质
  U15         TEXT NOT NULL DEFAULT 'A',  -- 波纹管
  U16         TEXT NOT NULL DEFAULT '00', -- 垫片
  U17         TEXT NOT NULL DEFAULT 'A',  -- 填料
  U18         TEXT NOT NULL DEFAULT '00', -- 螺柱
  U19         TEXT NOT NULL DEFAULT '00', -- 特殊要求
  full_code   TEXT,                       -- 完整19位编码
  name        TEXT,                       -- 阀门名称（可读规格）
  note        TEXT,                       -- 备注
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS valve_products_u8_idx ON valve_products (U8);
CREATE INDEX IF NOT EXISTS valve_products_u7_idx ON valve_products (U7);
CREATE INDEX IF NOT EXISTS valve_products_u9_idx ON valve_products (U9);
