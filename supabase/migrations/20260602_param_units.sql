-- 阀门参数库（19单元 U1–U19）· 取值词典 + 别名 · 租户可覆盖
-- 角色：参数归一化 & 校验的权威来源（"这个值对不对、标准码是什么"）。
-- 加载：GLOBAL 基线 19 单元 + 租户 active 同名单元逐 unit 覆盖（仿 factory_rulesets）。

CREATE TABLE IF NOT EXISTS valve_param_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,            -- 'GLOBAL' 基线 / 'yuechiang' 覆盖
  unit        TEXT NOT NULL,            -- 'U1'..'U19'
  name_cn     TEXT,
  name_en     TEXT,
  tier        TEXT,                     -- core | structure | material | addon
  is_core6    BOOLEAN NOT NULL DEFAULT FALSE,  -- U2/U5/U6/U7/U8/U9
  entries     JSONB NOT NULL,           -- [{code, cn, en, note?, aliases:[...]}]
  version     INT  NOT NULL DEFAULT 1,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, unit, version)
);
ALTER TABLE valve_param_units DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS valve_param_units_active_idx
  ON valve_param_units (tenant_id, unit) WHERE is_active;
