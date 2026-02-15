
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS financial_summary text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS insider_summary text;
