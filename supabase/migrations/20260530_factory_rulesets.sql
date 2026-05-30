-- 工厂规则库 · 牌1(主体材质)/牌2(API600件号) 按工厂存储
-- 设计要点：
--   1. 规则是「工厂私有数据」，不是代码、更不是 prompt。
--   2. 每家工厂只存自己的子集（family 少几个、件号少几行都没关系）。
--   3. 版本化 = 新增一行；切换正本用 is_active。
--   4. data 直接存 JSON 文档（与导入的 JSON/CSV 同构），便于导入导出与 diff。

CREATE TABLE IF NOT EXISTS factory_rulesets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  TEXT NOT NULL,                 -- 工厂/租户标识，如 'yuechiang'；'GLOBAL' 作为基线
  kind        TEXT NOT NULL,                 -- 'pai1_body_material' | 'pai2_internals'
  data        JSONB NOT NULL,                -- 牌1=families 对象 / 牌2=map 对象
  version     INT  NOT NULL DEFAULT 1,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (factory_id, kind, version)
);

-- 按 (工厂, 种类) 取当前生效版本
CREATE INDEX IF NOT EXISTS factory_rulesets_active_idx
  ON factory_rulesets (factory_id, kind) WHERE is_active;
