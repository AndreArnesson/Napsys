
-- Companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  ticker TEXT,
  current_price NUMERIC,
  shares_outstanding BIGINT,
  trading_currency TEXT DEFAULT 'SEK',
  reporting_currency TEXT DEFAULT 'SEK',
  description TEXT,
  moats TEXT,
  management JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Analyses table
CREATE TABLE public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating TEXT,
  summary_comment TEXT,
  margin_of_safety NUMERIC,
  is_draft BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Income statement table
CREATE TABLE public.income_statement (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  revenue NUMERIC,
  ebit NUMERIC,
  ebitda NUMERIC,
  net_income NUMERIC,
  gross_margin NUMERIC,
  operating_margin NUMERIC,
  net_margin NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Balance sheet table
CREATE TABLE public.balance_sheet (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  shareholders_equity NUMERIC,
  current_assets NUMERIC,
  current_liabilities NUMERIC,
  long_term_debt NUMERIC,
  cash_equivalents NUMERIC,
  equity_ratio NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Timeline events table
CREATE TABLE public.timeline_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_date DATE,
  rating TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shares table (for sharing companies between users)
CREATE TABLE public.shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_statement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_sheet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- Companies: owner can CRUD, shared users can read
CREATE POLICY "Users can view own companies" ON public.companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view shared companies" ON public.companies FOR SELECT USING (id IN (SELECT company_id FROM public.shares WHERE shared_with_user_id = auth.uid()));
CREATE POLICY "Users can create companies" ON public.companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own companies" ON public.companies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own companies" ON public.companies FOR DELETE USING (auth.uid() = user_id);

-- Analyses: owner can CRUD
CREATE POLICY "Users can view own analyses" ON public.analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view shared analyses" ON public.analyses FOR SELECT USING (company_id IN (SELECT company_id FROM public.shares WHERE shared_with_user_id = auth.uid()));
CREATE POLICY "Users can create analyses" ON public.analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own analyses" ON public.analyses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON public.analyses FOR DELETE USING (auth.uid() = user_id);

-- Income statement: accessible by company owner or shared users
CREATE POLICY "Users can view own income data" ON public.income_statement FOR SELECT USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can view shared income data" ON public.income_statement FOR SELECT USING (company_id IN (SELECT company_id FROM public.shares WHERE shared_with_user_id = auth.uid()));
CREATE POLICY "Users can manage own income data" ON public.income_statement FOR INSERT WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own income data" ON public.income_statement FOR UPDATE USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own income data" ON public.income_statement FOR DELETE USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

-- Balance sheet: same pattern
CREATE POLICY "Users can view own balance data" ON public.balance_sheet FOR SELECT USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can view shared balance data" ON public.balance_sheet FOR SELECT USING (company_id IN (SELECT company_id FROM public.shares WHERE shared_with_user_id = auth.uid()));
CREATE POLICY "Users can manage own balance data" ON public.balance_sheet FOR INSERT WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own balance data" ON public.balance_sheet FOR UPDATE USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own balance data" ON public.balance_sheet FOR DELETE USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

-- Timeline events: same pattern
CREATE POLICY "Users can view own timeline" ON public.timeline_events FOR SELECT USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can view shared timeline" ON public.timeline_events FOR SELECT USING (company_id IN (SELECT company_id FROM public.shares WHERE shared_with_user_id = auth.uid()));
CREATE POLICY "Users can manage own timeline" ON public.timeline_events FOR INSERT WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own timeline" ON public.timeline_events FOR DELETE USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

-- Shares: owner can manage shares
CREATE POLICY "Users can view shares for own companies" ON public.shares FOR SELECT USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can view shares shared with them" ON public.shares FOR SELECT USING (shared_with_user_id = auth.uid());
CREATE POLICY "Users can create shares for own companies" ON public.shares FOR INSERT WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete shares for own companies" ON public.shares FOR DELETE USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_analyses_updated_at BEFORE UPDATE ON public.analyses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
