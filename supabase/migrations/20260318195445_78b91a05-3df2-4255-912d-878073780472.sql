ALTER TABLE public.portfolio_holdings
  ADD COLUMN price numeric DEFAULT NULL,
  ADD COLUMN shares_count numeric DEFAULT NULL,
  ADD COLUMN future_plan text DEFAULT NULL;