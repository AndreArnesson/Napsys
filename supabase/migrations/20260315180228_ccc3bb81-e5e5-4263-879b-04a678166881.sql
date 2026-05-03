
-- Create portfolios table
CREATE TABLE IF NOT EXISTS public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own portfolios" ON public.portfolios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own portfolios" ON public.portfolios FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolios" ON public.portfolios FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolios" ON public.portfolios FOR DELETE USING (auth.uid() = user_id);

-- Create portfolio_snapshots table
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots" ON public.portfolio_snapshots FOR SELECT USING (
  portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create own snapshots" ON public.portfolio_snapshots FOR INSERT WITH CHECK (
  portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own snapshots" ON public.portfolio_snapshots FOR UPDATE USING (
  portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own snapshots" ON public.portfolio_snapshots FOR DELETE USING (
  portfolio_id IN (SELECT id FROM public.portfolios WHERE user_id = auth.uid())
);

-- Create portfolio_holdings table
CREATE TABLE IF NOT EXISTS public.portfolio_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.portfolio_snapshots(id) ON DELETE CASCADE,
  company_name text,
  ticker text,
  weight_percent numeric,
  value_sek numeric,
  conviction text,
  rationale text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own holdings" ON public.portfolio_holdings FOR SELECT USING (
  snapshot_id IN (SELECT ps.id FROM public.portfolio_snapshots ps JOIN public.portfolios p ON ps.portfolio_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "Users can create own holdings" ON public.portfolio_holdings FOR INSERT WITH CHECK (
  snapshot_id IN (SELECT ps.id FROM public.portfolio_snapshots ps JOIN public.portfolios p ON ps.portfolio_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "Users can update own holdings" ON public.portfolio_holdings FOR UPDATE USING (
  snapshot_id IN (SELECT ps.id FROM public.portfolio_snapshots ps JOIN public.portfolios p ON ps.portfolio_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "Users can delete own holdings" ON public.portfolio_holdings FOR DELETE USING (
  snapshot_id IN (SELECT ps.id FROM public.portfolio_snapshots ps JOIN public.portfolios p ON ps.portfolio_id = p.id WHERE p.user_id = auth.uid())
);
