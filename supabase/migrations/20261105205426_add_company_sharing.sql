-- Older schema exports omitted these columns, though the original schema has them.
ALTER TABLE public.shares ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.shares ADD COLUMN IF NOT EXISTS shared_with_email text;
ALTER TABLE public.shares ADD COLUMN IF NOT EXISTS permission text NOT NULL DEFAULT 'read';

UPDATE public.shares s SET owner_id = c.user_id
FROM public.companies c WHERE c.id = s.company_id AND s.owner_id IS DISTINCT FROM c.user_id;
UPDATE public.shares s SET shared_with_email = u.email
FROM auth.users u WHERE u.id = s.shared_with_user_id AND s.shared_with_email IS NULL;

-- Preserve the earliest grant when consolidating existing duplicate recipients.
DELETE FROM public.shares s USING public.shares earlier
WHERE s.company_id = earlier.company_id
  AND s.shared_with_user_id = earlier.shared_with_user_id
  AND (s.created_at, s.id) > (earlier.created_at, earlier.id);
CREATE UNIQUE INDEX shares_company_recipient_key ON public.shares (company_id, shared_with_user_id);
CREATE INDEX shares_recipient_idx ON public.shares (shared_with_user_id, company_id);

-- Replace legacy permissive policies: owner_id alone did not prove company ownership.
DO $$
DECLARE policy record;
BEGIN
  FOR policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'shares'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.shares', policy.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners and recipients can view shares" ON public.shares FOR SELECT TO authenticated
USING (
  shared_with_user_id = (SELECT auth.uid())
  OR company_id IN (SELECT id FROM public.companies WHERE user_id = (SELECT auth.uid()))
);
CREATE POLICY "Company owners can revoke shares" ON public.shares FOR DELETE TO authenticated
USING (company_id IN (SELECT id FROM public.companies WHERE user_id = (SELECT auth.uid())));

-- Only the RPC may create grants, so the email and recipient ID cannot be forged.
REVOKE ALL ON public.shares FROM anon, authenticated;
GRANT SELECT, DELETE ON public.shares TO authenticated;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Resolving an exact email needs access to auth.users. Keep this privileged code
-- outside the exposed API schema and check ownership before looking up a user.
CREATE FUNCTION private.share_company_with_email(_company_id uuid, _email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  recipient_id uuid;
  recipient_email text;
  share_id uuid;
BEGIN
  IF caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies WHERE id = _company_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Only the company owner can share' USING ERRCODE = '42501';
  END IF;

  SELECT id, email INTO recipient_id, recipient_email FROM auth.users
  WHERE lower(email) = lower(btrim(_email)) AND deleted_at IS NULL;
  IF recipient_id IS NULL THEN
    RAISE EXCEPTION 'Recipient not found' USING ERRCODE = 'P0002';
  END IF;
  IF recipient_id = caller_id THEN
    RAISE EXCEPTION 'Cannot share with yourself' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.shares (company_id, owner_id, shared_with_email, shared_with_user_id, permission)
  VALUES (_company_id, caller_id, recipient_email, recipient_id, 'read')
  ON CONFLICT (company_id, shared_with_user_id) DO NOTHING
  RETURNING id INTO share_id;

  IF share_id IS NULL THEN
    SELECT id INTO share_id FROM public.shares
    WHERE company_id = _company_id AND shared_with_user_id = recipient_id;
  END IF;
  RETURN share_id;
END;
$$;
REVOKE ALL ON FUNCTION private.share_company_with_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.share_company_with_email(uuid, text) TO authenticated;

CREATE FUNCTION public.share_company_with_email(_company_id uuid, _email text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.share_company_with_email(_company_id, _email); $$;
REVOKE ALL ON FUNCTION public.share_company_with_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_company_with_email(uuid, text) TO authenticated;

-- Recipients must not create their own analyses inside another user's company.
-- A restrictive policy also covers duplicate permissive policies in older installs.
CREATE POLICY "Analyses must belong to an owned company" ON public.analyses AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND company_id IN (SELECT id FROM public.companies WHERE user_id = (SELECT auth.uid()))
);
CREATE POLICY "Analysis updates must stay in an owned company" ON public.analyses AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND company_id IN (SELECT id FROM public.companies WHERE user_id = (SELECT auth.uid()))
);
