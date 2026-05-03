
CREATE TABLE IF NOT EXISTS public.economy_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'bank_account',
  label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.economy_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own economy entries" ON public.economy_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own economy entries" ON public.economy_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own economy entries" ON public.economy_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own economy entries" ON public.economy_entries FOR DELETE USING (auth.uid() = user_id);
