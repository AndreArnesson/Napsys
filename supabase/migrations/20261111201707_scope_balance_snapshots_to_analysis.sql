BEGIN;

SET LOCAL lock_timeout = '5s';

-- Keep one company-level balance sheet per year, while allowing each analysis
-- to preserve its own copy of the same fiscal year (as income_statement does).
ALTER TABLE public.balance_sheet
  DROP CONSTRAINT IF EXISTS balance_sheet_company_id_fiscal_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS balance_sheet_company_year_no_analysis_idx
  ON public.balance_sheet (company_id, fiscal_year)
  WHERE analysis_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS balance_sheet_company_year_analysis_idx
  ON public.balance_sheet (company_id, analysis_id, fiscal_year)
  WHERE analysis_id IS NOT NULL;

COMMIT;
