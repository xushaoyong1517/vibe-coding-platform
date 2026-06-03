-- 报价单状态升级为真列：全生命周期状态机 + 可过滤/出报表/RLS
-- 状态集：草稿 / 已发送 / 已确认 / 已下单 / 已失单 / 作废
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT '草稿';

-- 从历史 data JSON 回填已有状态
UPDATE quotes SET status = COALESCE(NULLIF(data->>'状态', ''), '草稿')
  WHERE status = '草稿';
-- 旧值归并：报价中 → 已发送（已过草稿、尚未确认）
UPDATE quotes SET status = '已发送' WHERE status = '报价中';

-- 按租户+状态过滤（工作台草稿队列、赢单率报表）
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(tenant_id, status);
