
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS competition text;

-- Update default for visible_sections to include new keys
ALTER TABLE public.companies ALTER COLUMN visible_sections SET DEFAULT '{"description":true,"moats":true,"ceo":true,"pilotskolan":true,"insiderOwnership":true,"images":true,"foundedYear":false,"businessModel":false,"competition":false,"management":true}'::jsonb;
