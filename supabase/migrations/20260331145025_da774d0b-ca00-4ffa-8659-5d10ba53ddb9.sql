CREATE TABLE public.price_fetch_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false
);

ALTER TABLE public.price_fetch_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own price fetch errors"
ON public.price_fetch_errors FOR SELECT
USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own price fetch errors"
ON public.price_fetch_errors FOR UPDATE
USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE POLICY "Service role can insert price fetch errors"
ON public.price_fetch_errors FOR INSERT
WITH CHECK (true);

CREATE INDEX idx_price_fetch_errors_unresolved ON public.price_fetch_errors (resolved, created_at DESC) WHERE resolved = false;