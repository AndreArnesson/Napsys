// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '10000000-0000-0000-0000-000000000001';
const reader = '10000000-0000-0000-0000-000000000002';
const outsider = '10000000-0000-0000-0000-000000000003';
const company = '20000000-0000-0000-0000-000000000001';
const first = '30000000-0000-0000-0000-000000000001';
const second = '30000000-0000-0000-0000-000000000002';
const migration = readFileSync(new URL('../../supabase/migrations/20261111201707_scope_balance_snapshots_to_analysis.sql', import.meta.url), 'utf8');

describe('analysis balance-sheet snapshots', () => {
  let db: PGlite;
  async function asUser(user: string) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec('SET ROLE authenticated');
  }
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      CREATE TABLE public.companies (id uuid PRIMARY KEY, user_id uuid NOT NULL);
      CREATE TABLE public.analyses (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies);
      CREATE TABLE public.balance_sheet (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES public.companies,
        analysis_id uuid REFERENCES public.analyses ON DELETE CASCADE,
        fiscal_year integer NOT NULL,
        cash_equivalents numeric,
        CONSTRAINT balance_sheet_company_id_fiscal_year_key UNIQUE (company_id, fiscal_year)
      );
      ALTER TABLE public.balance_sheet ENABLE ROW LEVEL SECURITY;
      CREATE POLICY owner_write ON public.balance_sheet FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
      CREATE POLICY shared_read ON public.balance_sheet FOR SELECT TO authenticated USING (auth.uid() = '${reader}');
      GRANT SELECT ON public.companies, public.analyses TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_sheet TO authenticated;
      INSERT INTO public.companies VALUES ('${company}', '${owner}');
      INSERT INTO public.analyses VALUES ('${first}', '${company}'), ('${second}', '${company}');
      INSERT INTO public.balance_sheet (company_id, fiscal_year, cash_equivalents) VALUES ('${company}', 2025, 100);
    `);
    // Reproduce the production failure before applying the real migration.
    await expect(db.query('INSERT INTO public.balance_sheet (company_id, analysis_id, fiscal_year) VALUES ($1, $2, 2025)',
      [company, first])).rejects.toMatchObject({ code: '23505' });
    const before = await db.query("SELECT policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'balance_sheet' ORDER BY policyname");
    await db.exec(migration);
    const after = await db.query("SELECT policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'balance_sheet' ORDER BY policyname");
    expect(after.rows).toEqual(before.rows);
  });
  beforeEach(async () => { await db.exec('RESET ROLE'); });
  afterAll(async () => { await db?.close(); });

  it('preserves independent copies for two analyses without allowing duplicate periods within a copy', async () => {
    await asUser(owner);
    for (const analysis of [first, second]) {
      await db.query(`INSERT INTO public.balance_sheet (company_id, analysis_id, fiscal_year, cash_equivalents)
        SELECT company_id, $1, fiscal_year, cash_equivalents FROM public.balance_sheet
        WHERE company_id = $2 AND analysis_id IS NULL`, [analysis, company]);
    }
    await expect(db.query('INSERT INTO public.balance_sheet (company_id, fiscal_year) VALUES ($1, 2025)', [company]))
      .rejects.toMatchObject({ code: '23505' });
    await expect(db.query('INSERT INTO public.balance_sheet (company_id, analysis_id, fiscal_year) VALUES ($1, $2, 2025)', [company, first]))
      .rejects.toMatchObject({ code: '23505' });
    await db.query('UPDATE public.balance_sheet SET cash_equivalents = 999 WHERE company_id = $1 AND analysis_id IS NULL', [company]);
    const copies = await db.query('SELECT analysis_id, cash_equivalents FROM public.balance_sheet WHERE analysis_id IS NOT NULL ORDER BY analysis_id');
    expect(copies.rows).toEqual([{ analysis_id: first, cash_equivalents: '100' }, { analysis_id: second, cash_equivalents: '100' }]);
  });

  it('keeps shared recipients read only and unrelated users unable to read or write', async () => {
    await asUser(reader);
    expect((await db.query('SELECT id FROM public.balance_sheet')).rows.length).toBeGreaterThan(0);
    expect((await db.query('UPDATE public.balance_sheet SET cash_equivalents = 0 RETURNING id')).rows).toEqual([]);
    await expect(db.query('INSERT INTO public.balance_sheet (company_id, analysis_id, fiscal_year) VALUES ($1, $2, 2026)', [company, first]))
      .rejects.toMatchObject({ code: '42501' });
    await asUser(outsider);
    expect((await db.query('SELECT id FROM public.balance_sheet')).rows).toEqual([]);
    await expect(db.query('INSERT INTO public.balance_sheet (company_id, analysis_id, fiscal_year) VALUES ($1, $2, 2027)', [company, second]))
      .rejects.toMatchObject({ code: '42501' });
  });
});
