-- Add pilotskolan text field to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS pilotskolan text;
