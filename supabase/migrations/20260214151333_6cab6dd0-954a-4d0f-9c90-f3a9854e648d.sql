
ALTER TABLE public.analyses ADD COLUMN current_price NUMERIC;
ALTER TABLE public.analyses ADD COLUMN shares_outstanding BIGINT;
ALTER TABLE public.balance_sheet ADD COLUMN short_term_debt NUMERIC;
