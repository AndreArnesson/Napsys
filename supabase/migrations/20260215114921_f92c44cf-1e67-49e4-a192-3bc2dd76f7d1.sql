
-- Create insider_trades table
CREATE TABLE public.insider_trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date text NOT NULL,
  person text NOT NULL,
  position text NOT NULL DEFAULT '',
  type text NOT NULL,
  volume numeric NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SEK',
  instrument text,
  isin text,
  nature text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.insider_trades ENABLE ROW LEVEL SECURITY;

-- RLS policies: same pattern as other company-scoped tables
CREATE POLICY "Users can view own insider trades"
ON public.insider_trades FOR SELECT
USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own insider trades"
ON public.insider_trades FOR INSERT
WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own insider trades"
ON public.insider_trades FOR UPDATE
USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own insider trades"
ON public.insider_trades FOR DELETE
USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can view shared insider trades"
ON public.insider_trades FOR SELECT
USING (is_shared_with_user(company_id, auth.uid()));
