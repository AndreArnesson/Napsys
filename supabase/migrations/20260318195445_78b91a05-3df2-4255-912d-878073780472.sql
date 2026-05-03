ALTER TABLE public.portfolio_holdings
  ADD COLUMN IF NOT EXISTS price numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shares_count numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS future_plan text DEFAULT NULL;