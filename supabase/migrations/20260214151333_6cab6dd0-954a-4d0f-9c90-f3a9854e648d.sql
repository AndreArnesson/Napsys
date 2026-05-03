
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS current_price NUMERIC;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS shares_outstanding BIGINT;
ALTER TABLE public.balance_sheet ADD COLUMN IF NOT EXISTS short_term_debt NUMERIC;
