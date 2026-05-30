-- 多租户改造：租户表 + 租户用户表 + 业务表加 tenant_id
-- 说明：factory_rulesets 已有 factory_id（语义即 tenant_id，值相同），本迁移不动它。

-- 1) 租户
CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,            -- 'yuechiang' / 'zhedong'
  name        TEXT NOT NULL,               -- '越强阀门' / '浙东阀门'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;

-- 2) 租户用户（每租户一个系统管理员；初始密码为空 = password_hash NULL）
CREATE TABLE IF NOT EXISTS tenant_users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  username       TEXT NOT NULL DEFAULT 'admin',
  role           TEXT NOT NULL DEFAULT '系统管理员',
  password_hash  TEXT,                      -- NULL = 空密码，首次登录直接进
  must_change_pw BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, username)
);
ALTER TABLE tenant_users DISABLE ROW LEVEL SECURITY;

-- 3) 业务表加 tenant_id（现有数据靠 default 回填为 yuechiang）
ALTER TABLE valve_products    ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'yuechiang';
ALTER TABLE drawing_templates ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'yuechiang';
ALTER TABLE quotes            ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'yuechiang';
ALTER TABLE params            ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'yuechiang';

CREATE INDEX IF NOT EXISTS valve_products_tenant_idx    ON valve_products (tenant_id);
CREATE INDEX IF NOT EXISTS drawing_templates_tenant_idx ON drawing_templates (tenant_id);
CREATE INDEX IF NOT EXISTS quotes_tenant_idx            ON quotes (tenant_id);
CREATE INDEX IF NOT EXISTS params_tenant_idx            ON params (tenant_id);

-- 4) 种子：越强租户 + admin（空密码）
INSERT INTO tenants (id, name) VALUES ('yuechiang', '越强阀门')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO tenant_users (tenant_id, username, role) VALUES ('yuechiang', 'admin', '系统管理员')
  ON CONFLICT (tenant_id, username) DO NOTHING;
