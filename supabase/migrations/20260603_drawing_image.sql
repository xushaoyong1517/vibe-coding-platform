-- 小样图首页缩略图：打印时作为版式底图（HTML 重建小样图：阀门图 + 填充明细表 + 标题栏）
ALTER TABLE drawing_templates ADD COLUMN IF NOT EXISTS image_url TEXT;
