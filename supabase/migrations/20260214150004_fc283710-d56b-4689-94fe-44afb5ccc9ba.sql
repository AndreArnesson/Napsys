
-- Create security definer function to check shared access without recursion
CREATE OR REPLACE FUNCTION public.is_shared_with_user(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shares
    WHERE company_id = _company_id
      AND shared_with_user_id = _user_id
  )
$$;

-- Drop recursive policies
DROP POLICY IF EXISTS "Users can view shared companies" ON public.companies;
DROP POLICY IF EXISTS "Users can view shared analyses" ON public.analyses;
DROP POLICY IF EXISTS "Users can view shared income data" ON public.income_statement;
DROP POLICY IF EXISTS "Users can view shared balance data" ON public.balance_sheet;
DROP POLICY IF EXISTS "Users can view shared timeline" ON public.timeline_events;
DROP POLICY IF EXISTS "Users can view shares for own companies" ON public.shares;
DROP POLICY IF EXISTS "Users can view shares shared with them" ON public.shares;
DROP POLICY IF EXISTS "Users can create shares for own companies" ON public.shares;
DROP POLICY IF EXISTS "Users can delete shares for own companies" ON public.shares;

-- Recreate shares policies without referencing companies
CREATE POLICY "Users can view own shares" ON public.shares FOR SELECT USING (shared_with_user_id = auth.uid());
CREATE POLICY "Users can view shares they created" ON public.shares FOR SELECT USING (
  company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create shares" ON public.shares FOR INSERT WITH CHECK (
  company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete shares" ON public.shares FOR DELETE USING (
  company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
);

-- Recreate non-recursive shared policies using security definer function
CREATE POLICY "Users can view shared companies" ON public.companies FOR SELECT USING (public.is_shared_with_user(id, auth.uid()));
CREATE POLICY "Users can view shared analyses" ON public.analyses FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));
CREATE POLICY "Users can view shared income data" ON public.income_statement FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));
CREATE POLICY "Users can view shared balance data" ON public.balance_sheet FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));
CREATE POLICY "Users can view shared timeline" ON public.timeline_events FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));
