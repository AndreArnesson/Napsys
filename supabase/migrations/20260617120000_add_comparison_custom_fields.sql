ALTER TABLE fund_comparisons
  ADD COLUMN IF NOT EXISTS custom_row_defs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE comparison_fund_items
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
