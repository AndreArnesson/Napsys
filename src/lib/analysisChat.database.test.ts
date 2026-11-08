// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '10000000-0000-0000-0000-000000000001';
const reader = '10000000-0000-0000-0000-000000000002';
const outsider = '10000000-0000-0000-0000-000000000003';
const company = '20000000-0000-0000-0000-000000000001';
const otherCompany = '20000000-0000-0000-0000-000000000002';
const analysis0 = '30000000-0000-0000-0000-000000000001';
const analysis1 = '30000000-0000-0000-0000-000000000002';
const otherAnalysis = '30000000-0000-0000-0000-000000000003';
const assistantMigration = readFileSync(new URL('../../supabase/migrations/20261108081520_company_assistant.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261108201148_analysis_chat_context.sql', import.meta.url), 'utf8');

describe('analysis-specific private chat history', () => {
  let db: PGlite;
  let legacyBefore: unknown[];
  let legacyAfter: unknown[];

  async function asUser(id: string | null) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
    await db.exec(`SET ROLE ${id ? 'authenticated' : 'anon'}`);
  }
  async function asServer() {
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE service_role');
  }
  async function history(userId: string, analysisId: string | null) {
    await asUser(userId);
    const scope = analysisId === null ? 'analysis_id IS NULL' : 'analysis_id = $2';
    return (await db.query(`SELECT question FROM public.company_chat_turns WHERE company_id = $1 AND ${scope} ORDER BY question`,
      analysisId === null ? [company] : [company, analysisId])).rows;
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      CREATE TABLE public.companies (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users);
      CREATE TABLE public.analyses (id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE);
      CREATE TABLE public.analysis_chat_test_shares (company_id uuid, recipient_id uuid);
      CREATE TABLE public.analysis_chat_test_hidden (analysis_id uuid, user_id uuid);
      GRANT SELECT ON public.analysis_chat_test_shares, public.analysis_chat_test_hidden TO authenticated;
      ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
      CREATE POLICY analysis_chat_test_company ON public.companies FOR SELECT TO authenticated USING (
        user_id = (SELECT auth.uid()) OR id IN (
          SELECT company_id FROM public.analysis_chat_test_shares WHERE recipient_id = (SELECT auth.uid())
        )
      );
      ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
      CREATE POLICY analysis_chat_test_analysis ON public.analyses FOR SELECT TO authenticated USING (
        company_id IN (SELECT id FROM public.companies)
        AND id NOT IN (SELECT analysis_id FROM public.analysis_chat_test_hidden WHERE user_id = (SELECT auth.uid()))
      );
      GRANT SELECT ON public.companies, public.analyses TO authenticated;
      GRANT ALL ON public.companies, public.analyses, auth.users TO service_role;
      INSERT INTO auth.users VALUES ('${owner}'), ('${reader}'), ('${outsider}');
      INSERT INTO public.companies VALUES ('${company}', '${owner}'), ('${otherCompany}', '${outsider}');
      INSERT INTO public.analyses VALUES ('${analysis0}', '${company}'), ('${analysis1}', '${company}'), ('${otherAnalysis}', '${otherCompany}');
    `);
    await db.exec(assistantMigration);
    await db.exec(`INSERT INTO public.company_chat_turns (company_id, user_id, question, answer, sources)
      VALUES ('${company}', '${owner}', 'Existing company history', 'Existing answer', '[{"id":"C1","label":"Company"}]');`);
    legacyBefore = (await db.query('SELECT id, company_id, user_id, question, answer, sources, created_at FROM public.company_chat_turns')).rows;
    await db.exec(migration);
    legacyAfter = (await db.query('SELECT id, company_id, user_id, question, answer, sources, created_at FROM public.company_chat_turns WHERE analysis_id IS NULL')).rows;
  }, 30_000);

  beforeEach(async () => {
    await db.exec('RESET ROLE');
    await db.exec(`
      TRUNCATE public.company_chat_turns, public.analysis_chat_test_shares, public.analysis_chat_test_hidden;
      DELETE FROM public.analyses;
      INSERT INTO public.analyses VALUES ('${analysis0}', '${company}'), ('${analysis1}', '${company}'), ('${otherAnalysis}', '${otherCompany}');
      INSERT INTO public.analysis_chat_test_shares VALUES ('${company}', '${reader}');
      INSERT INTO public.company_chat_turns (company_id, analysis_id, user_id, question, answer) VALUES
        ('${company}', NULL, '${owner}', 'Owner company', 'Answer'),
        ('${company}', '${analysis0}', '${owner}', 'Owner analysis zero', 'Answer'),
        ('${company}', '${analysis1}', '${owner}', 'Owner analysis one', 'Answer'),
        ('${company}', NULL, '${reader}', 'Reader company', 'Answer'),
        ('${company}', '${analysis0}', '${reader}', 'Reader analysis zero', 'Answer'),
        ('${company}', '${analysis1}', '${reader}', 'Reader analysis one', 'Answer'),
        ('${otherCompany}', '${otherAnalysis}', '${outsider}', 'Outsider analysis', 'Answer');
    `);
  });
  afterAll(async () => { await db?.close(); });

  it('preserves existing company history exactly with a NULL analysis scope', () => {
    expect(legacyBefore).toHaveLength(1);
    expect(legacyAfter).toEqual(legacyBefore);
  });

  it('keeps company, first analysis and second analysis histories separate for each person', async () => {
    expect(await history(owner, null)).toEqual([{ question: 'Owner company' }]);
    expect(await history(owner, analysis0)).toEqual([{ question: 'Owner analysis zero' }]);
    expect(await history(owner, analysis1)).toEqual([{ question: 'Owner analysis one' }]);
    expect(await history(reader, null)).toEqual([{ question: 'Reader company' }]);
    expect(await history(reader, analysis0)).toEqual([{ question: 'Reader analysis zero' }]);
    expect(await history(reader, analysis1)).toEqual([{ question: 'Reader analysis one' }]);
  });

  it('uses a composite foreign key to reject nonexistent or different-company analyses even for the server', async () => {
    await asServer();
    for (const analysis of [otherAnalysis, '30000000-0000-0000-0000-000000000099']) {
      await expect(db.query(`INSERT INTO public.company_chat_turns (company_id, analysis_id, user_id, question, answer)
        VALUES ($1, $2, $3, 'Forged scope', 'Answer')`, [company, analysis, reader]))
        .rejects.toMatchObject({ code: '23503' });
    }
    await expect(db.query('UPDATE public.company_chat_turns SET analysis_id = $1 WHERE company_id = $2', [otherAnalysis, company]))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('blocks browser inserts and changing an existing turn’s analysis scope or answer', async () => {
    for (const user of [owner, reader]) {
      await asUser(user);
      await expect(db.query(`INSERT INTO public.company_chat_turns (company_id, analysis_id, user_id, question, answer)
        VALUES ($1, $2, $3, 'Forged', 'Answer')`, [company, analysis0, user]))
        .rejects.toMatchObject({ code: '42501' });
      await expect(db.query('UPDATE public.company_chat_turns SET analysis_id = $1', [analysis1]))
        .rejects.toMatchObject({ code: '42501' });
      await expect(db.query("UPDATE public.company_chat_turns SET answer = 'Forged'"))
        .rejects.toMatchObject({ code: '42501' });
    }
  });

  it('denies outsiders and anonymous callers, including when they know an analysis ID', async () => {
    expect(await history(outsider, analysis0)).toEqual([]);
    await asUser(null);
    await expect(db.query('SELECT * FROM public.company_chat_turns WHERE analysis_id = $1', [analysis0]))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('removes analysis and company conversation access immediately when sharing is revoked', async () => {
    await db.exec('DELETE FROM public.analysis_chat_test_shares');
    for (const scope of [null, analysis0, analysis1]) expect(await history(reader, scope)).toEqual([]);
    expect((await db.query('DELETE FROM public.company_chat_turns RETURNING id')).rows).toEqual([]);
    expect(await history(owner, analysis0)).toEqual([{ question: 'Owner analysis zero' }]);
  });

  it('checks actual analysis RLS in addition to company access for reads and deletes', async () => {
    await db.query('INSERT INTO public.analysis_chat_test_hidden VALUES ($1, $2)', [analysis0, reader]);
    expect(await history(reader, analysis0)).toEqual([]);
    expect(await history(reader, analysis1)).toEqual([{ question: 'Reader analysis one' }]);
    expect(await history(reader, null)).toEqual([{ question: 'Reader company' }]);
    expect((await db.query('DELETE FROM public.company_chat_turns WHERE analysis_id = $1 RETURNING id', [analysis0])).rows).toEqual([]);
    await asServer();
    expect((await db.query('SELECT id FROM public.company_chat_turns WHERE analysis_id = $1 AND user_id = $2', [analysis0, reader])).rows).toHaveLength(1);
  });

  it('cascades deletion of only the selected analysis’s conversations', async () => {
    await asServer();
    await db.query('DELETE FROM public.analyses WHERE id = $1', [analysis0]);
    expect((await db.query('SELECT * FROM public.company_chat_turns WHERE analysis_id = $1', [analysis0])).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.company_chat_turns WHERE analysis_id = $1', [analysis1])).rows).toHaveLength(2);
    expect((await db.query('SELECT * FROM public.company_chat_turns WHERE company_id = $1 AND analysis_id IS NULL', [company])).rows).toHaveLength(2);
    expect((await db.query('SELECT * FROM public.company_chat_turns WHERE analysis_id = $1', [otherAnalysis])).rows).toHaveLength(1);
  });

  it('lets a person delete one analysis’s own history without deleting anyone else’s turns', async () => {
    await asUser(reader);
    expect((await db.query('DELETE FROM public.company_chat_turns WHERE analysis_id = $1 RETURNING question', [analysis0])).rows)
      .toEqual([{ question: 'Reader analysis zero' }]);
    expect(await history(reader, analysis1)).toEqual([{ question: 'Reader analysis one' }]);
    expect(await history(reader, null)).toEqual([{ question: 'Reader company' }]);
    expect(await history(owner, analysis0)).toEqual([{ question: 'Owner analysis zero' }]);
  });
});
