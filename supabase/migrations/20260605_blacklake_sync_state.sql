-- 增量同步水位：记录每个租户上次成功同步的时刻，作为下次「有更新的同步」(updatedAt 起点)。
CREATE TABLE IF NOT EXISTS bl_sync_state (
  tenant_id      TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,                 -- 上次成功同步完成时刻 = 下次增量水位
  last_mode      TEXT,                        -- full | incremental
  last_counts    JSONB,                       -- 上次各源条数，便于排障
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bl_sync_state DISABLE ROW LEVEL SECURITY;
