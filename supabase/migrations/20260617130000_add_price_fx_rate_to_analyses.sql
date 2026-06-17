ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS price_fx_rate numeric NOT NULL DEFAULT 1;
