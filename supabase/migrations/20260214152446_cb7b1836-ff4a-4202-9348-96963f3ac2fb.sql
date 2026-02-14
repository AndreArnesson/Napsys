
-- 1. Add dividend, earnings_per_share, shares_outstanding to income_statement
ALTER TABLE public.income_statement ADD COLUMN IF NOT EXISTS dividend NUMERIC;
ALTER TABLE public.income_statement ADD COLUMN IF NOT EXISTS earnings_per_share NUMERIC;
ALTER TABLE public.income_statement ADD COLUMN IF NOT EXISTS shares_outstanding BIGINT;

-- 2. Add analysis_id to income_statement and balance_sheet for per-analysis scoping
ALTER TABLE public.income_statement ADD COLUMN IF NOT EXISTS analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE;
ALTER TABLE public.balance_sheet ADD COLUMN IF NOT EXISTS analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE;

-- 3. Add name and images to analyses
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- 4. Add images to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- 5. Create quarterly_income_statement table
CREATE TABLE IF NOT EXISTS public.quarterly_income_statement (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
  revenue NUMERIC,
  ebit NUMERIC,
  ebitda NUMERIC,
  net_income NUMERIC,
  earnings_per_share NUMERIC,
  dividend NUMERIC,
  gross_margin NUMERIC,
  operating_margin NUMERIC,
  net_margin NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quarterly_income_statement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quarterly income data" ON public.quarterly_income_statement FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own quarterly income data" ON public.quarterly_income_statement FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own quarterly income data" ON public.quarterly_income_statement FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own quarterly income data" ON public.quarterly_income_statement FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can view shared quarterly income data" ON public.quarterly_income_statement FOR SELECT
  USING (is_shared_with_user(company_id, auth.uid()));

-- 6. Create quarterly_balance_sheet table
CREATE TABLE IF NOT EXISTS public.quarterly_balance_sheet (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  shareholders_equity NUMERIC,
  current_assets NUMERIC,
  current_liabilities NUMERIC,
  long_term_debt NUMERIC,
  short_term_debt NUMERIC,
  cash_equivalents NUMERIC,
  equity_ratio NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quarterly_balance_sheet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quarterly balance data" ON public.quarterly_balance_sheet FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own quarterly balance data" ON public.quarterly_balance_sheet FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own quarterly balance data" ON public.quarterly_balance_sheet FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own quarterly balance data" ON public.quarterly_balance_sheet FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can view shared quarterly balance data" ON public.quarterly_balance_sheet FOR SELECT
  USING (is_shared_with_user(company_id, auth.uid()));

-- 7. Create storage bucket for analysis images
INSERT INTO storage.buckets (id, name, public) VALUES ('analysis-images', 'analysis-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view analysis images" ON storage.objects FOR SELECT
  USING (bucket_id = 'analysis-images');
CREATE POLICY "Authenticated users can upload analysis images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'analysis-images' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update own analysis images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'analysis-images' AND auth.role() = 'authenticated');
CREATE POLICY "Users can delete own analysis images" ON storage.objects FOR DELETE
  USING (bucket_id = 'analysis-images' AND auth.role() = 'authenticated');
