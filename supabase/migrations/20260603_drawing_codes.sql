-- 小样图加归一码：与明细行/历史行同一套键，用于 BOM 骨架匹配
ALTER TABLE drawing_templates ADD COLUMN IF NOT EXISTS codes JSONB;  -- {U2,U3,U4,U5,U6,U7}
