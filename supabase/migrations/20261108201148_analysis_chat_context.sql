BEGIN;

-- A NULL analysis_id keeps the existing private company conversation intact.
-- Non-NULL IDs create a separate private conversation for one analysis.
ALTER TABLE public.analyses
  ADD CONSTRAINT analyses_id_company_id_key UNIQUE (id, company_id);

ALTER TABLE public.company_chat_turns ADD COLUMN analysis_id uuid;
ALTER TABLE public.company_chat_turns
  ADD CONSTRAINT company_chat_turns_analysis_company_fkey
  FOREIGN KEY (analysis_id, company_id)
  REFERENCES public.analyses (id, company_id)
  ON DELETE CASCADE;

CREATE INDEX company_chat_turns_company_user_analysis_created_idx
  ON public.company_chat_turns (company_id, user_id, analysis_id, created_at DESC);
CREATE INDEX company_chat_turns_analysis_id_idx
  ON public.company_chat_turns (analysis_id) WHERE analysis_id IS NOT NULL;

-- Existing permissive policies still require the caller's own history and
-- current company access. These additional guards also require current access
-- to the selected analysis, including when its own RLS is more restrictive.
CREATE POLICY "Analysis conversations require current analysis read access"
ON public.company_chat_turns AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  analysis_id IS NULL OR EXISTS (
    SELECT 1 FROM public.analyses a
    WHERE a.id = company_chat_turns.analysis_id
      AND a.company_id = company_chat_turns.company_id
  )
);
CREATE POLICY "Deleting analysis conversations requires current analysis access"
ON public.company_chat_turns AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  analysis_id IS NULL OR EXISTS (
    SELECT 1 FROM public.analyses a
    WHERE a.id = company_chat_turns.analysis_id
      AND a.company_id = company_chat_turns.company_id
  )
);

COMMENT ON COLUMN public.company_chat_turns.analysis_id IS
  'NULL for private company chat; otherwise private chat scoped to this analysis in the same company.';

COMMIT;
