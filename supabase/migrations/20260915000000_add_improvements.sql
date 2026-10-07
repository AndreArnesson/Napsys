-- Create improvements table (per-user todo list of site improvements)

CREATE TABLE IF NOT EXISTS public.improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS improvements_user_id_idx ON public.improvements (user_id);
CREATE INDEX IF NOT EXISTS improvements_created_at_idx ON public.improvements (created_at);

ALTER TABLE public.improvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own improvements" ON public.improvements;
CREATE POLICY "Users can view their own improvements"
ON public.improvements FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own improvements" ON public.improvements;
CREATE POLICY "Users can create their own improvements"
ON public.improvements FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own improvements" ON public.improvements;
CREATE POLICY "Users can update their own improvements"
ON public.improvements FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own improvements" ON public.improvements;
CREATE POLICY "Users can delete their own improvements"
ON public.improvements FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_improvements_updated_at
BEFORE UPDATE ON public.improvements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();