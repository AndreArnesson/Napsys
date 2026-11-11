BEGIN;

-- Reading ownership history is already limited to owners and share recipients.
-- Snapshot upserts also need INSERT and UPDATE policies, including the conflict
-- path when the owner saves another snapshot for the same date.
REVOKE ALL ON TABLE public.insider_ownership_history FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.insider_ownership_history TO authenticated;

CREATE POLICY "Owners can insert ownership history"
ON public.insider_ownership_history FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (
    SELECT c.id FROM public.companies c WHERE c.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners can update ownership history"
ON public.insider_ownership_history FOR UPDATE TO authenticated
USING (
  company_id IN (
    SELECT c.id FROM public.companies c WHERE c.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  company_id IN (
    SELECT c.id FROM public.companies c WHERE c.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners can delete ownership history"
ON public.insider_ownership_history FOR DELETE TO authenticated
USING (
  company_id IN (
    SELECT c.id FROM public.companies c WHERE c.user_id = (SELECT auth.uid())
  )
);

COMMIT;
