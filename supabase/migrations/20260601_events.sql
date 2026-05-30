-- 事件流：不可变、只追加的事实日志（飞轮的底座）
-- 核心：把「系统提议(bom_generated)」与「人工修正(bom_confirmed·含行级delta)」分开记录。
-- 租户隔离同其它表。

CREATE TABLE IF NOT EXISTS events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL,
  event_type     TEXT NOT NULL,                 -- bom_generated | bom_confirmed | quote_confirmed | ...
  actor          TEXT NOT NULL DEFAULT 'system',-- system | 业务员姓名 | customer
  correlation_id TEXT,                          -- 一次报价会话，串起整条闭环
  quote_id       TEXT,                          -- 保存后关联的报价单
  valve_spec     TEXT,                          -- 阀型分组键：类型·主体·件号（BOM材质身份）
  refs           JSONB NOT NULL DEFAULT '{}',   -- { full_code?, DN?, customer_id? }
  payload        JSONB NOT NULL DEFAULT '{}',   -- 类型相关，含 deltas 行级修正
  provenance     JSONB,                         -- { source, confidence?, rule_id? } 仅提议类
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE events DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS events_tenant_type_idx  ON events (tenant_id, event_type);
CREATE INDEX IF NOT EXISTS events_tenant_spec_idx  ON events (tenant_id, valve_spec);
CREATE INDEX IF NOT EXISTS events_corr_idx         ON events (correlation_id);
