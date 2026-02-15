
-- Add new optional fields to companies table
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS founded_year integer;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS business_model text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS visible_sections jsonb DEFAULT '{"description":true,"moats":true,"ceo":true,"pilotskolan":true,"insiderOwnership":true,"images":true,"foundedYear":false,"businessModel":false}'::jsonb;

-- Add new optional fields to analyses table
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS employees integer;
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS visible_sections jsonb DEFAULT '{"debt":true,"images":true,"employees":false}'::jsonb;
