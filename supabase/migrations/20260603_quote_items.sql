-- 报价明细行提为真表（投影/读模型）：codes 建索引，支持行级状态 + DB 侧历史骨架匹配
-- 注：quotes.data.items[] 仍是 UI 读取的权威源；本表是每次保存时重投影的查询优化副本。
CREATE TABLE IF NOT EXISTS quote_items (
  id          TEXT PRIMARY KEY,                       -- `${quote_id}#${line_no}`
  quote_id    TEXT NOT NULL,
  tenant_id   TEXT NOT NULL DEFAULT 'yuechiang',
  line_no     INT  NOT NULL,                          -- 行序（0 起）
  codes       JSONB,                                  -- 归一码 {U2..U9}
  code        TEXT,                                   -- 归一后重拼工厂编号
  status      TEXT NOT NULL DEFAULT '待确认',          -- 待确认 | 已确认 | BOM已生成 | BOM已确认
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,      -- 整行 QuoteItem
  bom         JSONB,                                  -- 该行物料清单（BOMResult，含 bom/牌1/牌2）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE quote_items DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_quote_items_quote  ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_tenant ON quote_items(tenant_id);
-- 历史骨架匹配：类型U2 + 结构U5（替代内存扫 300 块 JSON）
CREATE INDEX IF NOT EXISTS idx_quote_items_codes
  ON quote_items(tenant_id, (codes->>'U2'), (codes->>'U5'));

-- 回填：把现有 quotes.data.items[] / bomData[] 炸开成行
INSERT INTO quote_items (id, quote_id, tenant_id, line_no, codes, code, status, data, bom)
SELECT
  q.id || '#' || (it.ord - 1),
  q.id,
  q.tenant_id,
  (it.ord - 1)::int,
  it.val->'codes',
  it.val->>'code',
  CASE WHEN (q.data->'bomData'->((it.ord - 1)::int)) IS NOT NULL THEN 'BOM已生成' ELSE '待确认' END,
  it.val,
  q.data->'bomData'->((it.ord - 1)::int)
FROM quotes q
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(q.data->'items', '[]'::jsonb))
  WITH ORDINALITY AS it(val, ord)
ON CONFLICT (id) DO NOTHING;
