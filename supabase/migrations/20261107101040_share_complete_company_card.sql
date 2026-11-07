BEGIN;

-- Older estimates are stored separately from the analysis projections JSON.
-- Reading an entire shared company card includes estimates for every analysis.
CREATE POLICY "Users can view shared quarterly estimates"
ON public.quarterly_estimates FOR SELECT TO authenticated
USING (analysis_id IN (
  SELECT a.id FROM public.analyses a
  WHERE public.is_shared_with_user(a.company_id, (SELECT auth.uid()))
));

-- Ownership history belongs to the company card; it is visible to its owner
-- and recipients, rather than every signed-in account.
DROP POLICY IF EXISTS "Authenticated users can read insider ownership history"
ON public.insider_ownership_history;
CREATE POLICY "Owners and recipients can read ownership history"
ON public.insider_ownership_history FOR SELECT TO authenticated
USING (
  company_id IN (SELECT c.id FROM public.companies c WHERE c.user_id = (SELECT auth.uid()))
  OR public.is_shared_with_user(company_id, (SELECT auth.uid()))
);

-- The UI stores reports as <company_id>/<file> and images as
-- company/<company_id>/<file> or analysis/<analysis_id>/<file>.
CREATE FUNCTION private.can_manage_company_file(_bucket text, _name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.companies c WHERE c.user_id = (SELECT auth.uid()) AND (
      (_bucket = 'reports' AND c.id::text = split_part(_name, '/', 1))
      OR (_bucket = 'analysis-images' AND split_part(_name, '/', 1) = 'company' AND c.id::text = split_part(_name, '/', 2))
      OR (_bucket = 'analysis-images' AND split_part(_name, '/', 1) = 'analysis' AND EXISTS (
        SELECT 1 FROM public.analyses a WHERE a.company_id = c.id AND a.id::text = split_part(_name, '/', 2)
      ))
    )
  );
$$;
CREATE FUNCTION private.can_read_company_report(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id::text = split_part(_name, '/', 1)
    AND (c.user_id = (SELECT auth.uid()) OR private.has_shared_company_access(c.id, (SELECT auth.uid())))
  );
$$;
REVOKE ALL ON FUNCTION private.can_manage_company_file(text, text), private.can_read_company_report(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_company_file(text, text), private.can_read_company_report(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can upload analysis images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own analysis images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own analysis images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own reports" ON storage.objects;

CREATE POLICY "Owners can upload company card files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('reports', 'analysis-images') AND private.can_manage_company_file(bucket_id, name));
CREATE POLICY "Owners can update company card files" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('reports', 'analysis-images') AND private.can_manage_company_file(bucket_id, name))
WITH CHECK (bucket_id IN ('reports', 'analysis-images') AND private.can_manage_company_file(bucket_id, name));
CREATE POLICY "Owners can delete company card files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('reports', 'analysis-images') AND private.can_manage_company_file(bucket_id, name));
CREATE POLICY "Owners and recipients can read company reports" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reports' AND private.can_read_company_report(name));

COMMIT;
