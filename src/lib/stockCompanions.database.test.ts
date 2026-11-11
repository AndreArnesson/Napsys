// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '10000000-0000-0000-0000-000000000001';
const reader = '10000000-0000-0000-0000-000000000002';
const outsider = '10000000-0000-0000-0000-000000000003';
const first = '20000000-0000-0000-0000-000000000001';
const second = '20000000-0000-0000-0000-000000000002';
const readerCompany = '20000000-0000-0000-0000-000000000003';
const base = readFileSync(new URL('../../supabase/migrations/20261105205426_add_company_sharing.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261105211843_add_stock_companions.sql', import.meta.url), 'utf8');
const cardMigration = readFileSync(new URL('../../supabase/migrations/20261107101040_share_complete_company_card.sql', import.meta.url), 'utf8');
const ownershipMigration = readFileSync(new URL('../../supabase/migrations/20261110204115_fix_insider_ownership_snapshot_writes.sql', import.meta.url), 'utf8');
const cardTables = ['balance_sheet', 'quarterly_income_statement', 'quarterly_balance_sheet', 'timeline_events', 'insider_trades', 'report_documents'];

describe('stock companion requests and sharing permissions', () => {
  let db: PGlite;

  async function asUser(id: string | null) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
    await db.exec(`SET ROLE ${id ? 'authenticated' : 'anon'}`);
  }
  async function request() {
    await asUser(owner);
    const result = await db.query<{ id: string }>("SELECT public.request_stock_companion('reader@example.com') AS id");
    return result.rows[0].id;
  }
  async function accept() {
    const id = await request();
    await asUser(reader);
    await db.query('SELECT public.respond_stock_companion($1, true)', [id]);
    return id;
  }
  async function all(enabled: boolean) {
    await asUser(owner);
    await db.query('SELECT public.set_companion_share_all($1, $2)', [reader, enabled]);
  }
  async function visibleCompanies(userId: string) {
    await asUser(userId);
    return (await db.query<{ id: string }>('SELECT id FROM public.companies ORDER BY id')).rows.map(row => row.id);
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, deleted_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
      CREATE TABLE public.profiles (user_id uuid UNIQUE, display_name text);
      CREATE TABLE public.companies (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text);
      CREATE TABLE public.analyses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES public.companies, user_id uuid NOT NULL, name text);
      CREATE TABLE public.income_statement (company_id uuid REFERENCES public.companies, revenue numeric);
      CREATE TABLE public.shares (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
        shared_with_user_id uuid REFERENCES auth.users ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE FUNCTION public.is_shared_with_user(_company_id uuid, _user_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT EXISTS (SELECT 1 FROM public.shares WHERE company_id = _company_id AND shared_with_user_id = _user_id)
      $$;
      ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.income_statement ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_company ON public.companies FOR ALL USING (user_id = auth.uid());
      CREATE POLICY shared_company ON public.companies FOR SELECT USING (public.is_shared_with_user(id, auth.uid()));
      CREATE POLICY own_analysis ON public.analyses FOR ALL USING (user_id = auth.uid());
      CREATE POLICY shared_analysis ON public.analyses FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));
      CREATE POLICY shared_income ON public.income_statement FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));
      GRANT ALL ON public.companies, public.analyses, public.income_statement, public.shares TO authenticated, anon;
      INSERT INTO auth.users VALUES ('${owner}', 'owner@example.com', null), ('${reader}', 'Reader@Example.com', null), ('${outsider}', 'outsider@example.com', null);
      INSERT INTO public.profiles VALUES ('${reader}', 'Reader Name');
    `);
    await db.exec(`
      CREATE SCHEMA storage;
      CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO authenticated;
      GRANT ALL ON storage.objects TO authenticated;
      CREATE POLICY "Anyone can view analysis images" ON storage.objects FOR SELECT USING (bucket_id = 'analysis-images');
      CREATE POLICY "Authenticated users can upload analysis images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'analysis-images');
      CREATE POLICY "Users can update own analysis images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'analysis-images');
      CREATE POLICY "Users can delete own analysis images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'analysis-images');
      CREATE POLICY "Users can upload reports" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reports');
      CREATE POLICY "Users can read own reports" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'reports');
      CREATE POLICY "Users can delete own reports" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'reports');
      CREATE TABLE public.quarterly_estimates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), analysis_id uuid REFERENCES public.analyses, note text);
      ALTER TABLE public.quarterly_estimates ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_estimates ON public.quarterly_estimates FOR ALL TO authenticated
        USING (analysis_id IN (SELECT id FROM public.analyses WHERE user_id = auth.uid()));
      GRANT ALL ON public.quarterly_estimates TO authenticated;
      CREATE TABLE public.insider_ownership_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
        recorded_date date NOT NULL,
        entries jsonb NOT NULL DEFAULT '[]'::jsonb,
        note text,
        created_at timestamptz DEFAULT now(),
        UNIQUE (company_id, recorded_date)
      );
      ALTER TABLE public.insider_ownership_history ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Authenticated users can read insider ownership history" ON public.insider_ownership_history FOR SELECT TO authenticated USING (true);
      GRANT ALL ON public.insider_ownership_history TO authenticated, anon;
      ${cardTables.map(table => `
        CREATE TABLE public.${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES public.companies, note text);
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY own_data ON public.${table} FOR ALL TO authenticated
          USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));
        CREATE POLICY shared_data ON public.${table} FOR SELECT TO authenticated
          USING (public.is_shared_with_user(company_id, auth.uid()));
        GRANT ALL ON public.${table} TO authenticated;
      `).join('\n')}
    `);
    await db.exec(base);
    await db.exec(migration);
    await db.exec(cardMigration);
    await db.exec(ownershipMigration);
  }, 30_000);

  beforeEach(async () => {
    await db.exec('RESET ROLE; TRUNCATE storage.objects; TRUNCATE public.stock_companions, public.companion_all_shares, public.shares, public.income_statement, public.analyses, public.companies CASCADE;');
    await db.exec(`
      INSERT INTO public.companies VALUES ('${first}', '${owner}', 'First'), ('${second}', '${owner}', 'Second'), ('${readerCompany}', '${reader}', 'Reader company');
      INSERT INTO public.analyses (company_id, user_id, name) VALUES ('${first}', '${owner}', 'First analysis'), ('${second}', '${owner}', 'Second analysis');
      INSERT INTO public.income_statement VALUES ('${first}', 100), ('${second}', 200);
      INSERT INTO public.quarterly_estimates (analysis_id, note) SELECT id, name FROM public.analyses;
      ${cardTables.map(table => `INSERT INTO public.${table} (company_id, note) VALUES ('${first}', 'First card'), ('${second}', 'Second card');`).join('\n')}
      INSERT INTO public.insider_ownership_history (company_id, recorded_date, note)
      VALUES ('${first}', '2026-11-01', 'First card'), ('${second}', '2026-11-01', 'Second card');
      INSERT INTO storage.objects (bucket_id, name) VALUES ('reports', '${first}/report.pdf'), ('reports', '${second}/report.pdf'), ('analysis-images', 'company/${first}/image.png');
      INSERT INTO storage.objects (bucket_id, name) SELECT 'analysis-images', 'analysis/' || id::text || '/image.png' FROM public.analyses;
    `);
  });
  afterAll(async () => { await db?.close(); });

  it('denies anonymous calls to public and private companion APIs', async () => {
    await asUser(null);
    for (const schema of ['public', 'private']) {
      for (const call of ['list_stock_companions()', "request_stock_companion('reader@example.com')", `set_companion_share_all('${reader}', true)`]) {
        await expect(db.query(`SELECT ${schema}.${call}`)).rejects.toMatchObject({ code: '42501' });
      }
    }
  });

  it('only lists the current user’s connections and the exact counterpart’s profile', async () => {
    await request();
    const mine = await db.query('SELECT email, display_name, status, incoming, sharing_all FROM public.list_stock_companions()');
    expect(mine.rows).toEqual([{ email: 'Reader@Example.com', display_name: 'Reader Name', status: 'pending', incoming: false, sharing_all: false }]);
    await asUser(reader);
    expect((await db.query('SELECT email, incoming FROM public.list_stock_companions()')).rows)
      .toEqual([{ email: 'owner@example.com', incoming: true }]);
    await asUser(outsider);
    expect((await db.query('SELECT * FROM public.list_stock_companions()')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.stock_companions')).rows).toEqual([]);
    await expect(db.query('SELECT email FROM auth.users')).rejects.toMatchObject({ code: '42501' });
  });

  it('normalizes email and rejects unknown users, self requests, and duplicates in either direction', async () => {
    await asUser(owner);
    await expect(db.query("SELECT public.request_stock_companion('missing@example.com')")).rejects.toMatchObject({ code: 'P0002' });
    await expect(db.query("SELECT public.request_stock_companion('owner@example.com')")).rejects.toMatchObject({ code: '22023' });
    await db.query("SELECT public.request_stock_companion(' Reader@EXAMPLE.COM ')");
    await expect(db.query("SELECT public.request_stock_companion('reader@example.com')")).rejects.toMatchObject({ code: '23505' });
    await asUser(reader);
    await expect(db.query("SELECT public.request_stock_companion('owner@example.com')")).rejects.toMatchObject({ code: '23505' });
    expect((await db.query('SELECT status FROM public.stock_companions')).rows).toEqual([{ status: 'pending' }]);
  });

  it('lets only the recipient accept a pending request, and friendship grants no analysis access', async () => {
    const id = await request();
    await expect(db.query('SELECT public.respond_stock_companion($1, true)', [id])).rejects.toMatchObject({ code: '42501' });
    await asUser(outsider);
    await expect(db.query('SELECT public.respond_stock_companion($1, true)', [id])).rejects.toMatchObject({ code: '42501' });
    await asUser(reader);
    await db.query('SELECT public.respond_stock_companion($1, true)', [id]);
    expect(await visibleCompanies(reader)).toEqual([readerCompany]);
    expect((await db.query('SELECT * FROM public.analyses')).rows).toEqual([]);
    await expect(db.query('SELECT public.respond_stock_companion($1, false)', [id])).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects per-company and all-analysis sharing before the request is accepted', async () => {
    await request();
    for (const sql of [
      `SELECT public.share_company_with_companion('${first}', '${reader}')`,
      `SELECT public.share_company_with_email('${first}', 'reader@example.com')`,
      `SELECT public.set_companion_share_all('${reader}', true)`,
    ]) await expect(db.query(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('shares one company with an accepted companion, without sharing the other company', async () => {
    await accept();
    await asUser(owner);
    const a = await db.query('SELECT public.share_company_with_companion($1, $2) AS id', [first, reader]);
    const b = await db.query('SELECT public.share_company_with_email($1, $2) AS id', [first, 'reader@example.com']);
    expect(a.rows).toEqual(b.rows);
    expect(await visibleCompanies(reader)).toEqual([first, readerCompany]);
    expect((await db.query('SELECT name FROM public.analyses')).rows).toEqual([{ name: 'First analysis' }]);
    expect((await db.query('SELECT revenue FROM public.income_statement')).rows).toEqual([{ revenue: '100' }]);
  });

  it('grants all current and future companies and analyses in only the chosen direction', async () => {
    await accept();
    await all(true);
    await all(true);
    const future = '20000000-0000-0000-0000-000000000004';
    await db.query('INSERT INTO public.companies VALUES ($1, $2, $3)', [future, owner, 'Future']);
    await db.query("INSERT INTO public.analyses (company_id, user_id, name) VALUES ($1, $2, 'Future analysis')", [future, owner]);
    expect((await db.query('SELECT sharing_all, receiving_all FROM public.list_stock_companions()')).rows)
      .toEqual([{ sharing_all: true, receiving_all: false }]);
    expect(await visibleCompanies(reader)).toEqual([first, second, readerCompany, future]);
    expect((await db.query('SELECT name FROM public.analyses ORDER BY name')).rows)
      .toEqual([{ name: 'First analysis' }, { name: 'Future analysis' }, { name: 'Second analysis' }]);
    expect((await db.query('SELECT sharing_all, receiving_all FROM public.list_stock_companions()')).rows)
      .toEqual([{ sharing_all: false, receiving_all: true }]);
    expect(await visibleCompanies(owner)).toEqual([first, second, future]);
  });

  it('keeps global access read only and prevents creating or moving analyses into the shared company', async () => {
    await accept(); await all(true); await asUser(reader);
    expect((await db.query("UPDATE public.companies SET name = 'Changed' WHERE id = $1 RETURNING id", [first])).rows).toEqual([]);
    expect((await db.query("UPDATE public.analyses SET name = 'Changed' RETURNING id")).rows).toEqual([]);
    expect((await db.query('DELETE FROM public.analyses RETURNING id')).rows).toEqual([]);
    await expect(db.query('INSERT INTO public.analyses (company_id, user_id) VALUES ($1, $2)', [first, reader])).rejects.toMatchObject({ code: '42501' });
    await db.query('INSERT INTO public.analyses (company_id, user_id) VALUES ($1, $2)', [readerCompany, reader]);
    await expect(db.query('UPDATE public.analyses SET company_id = $1 WHERE user_id = $2', [first, reader])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('SELECT public.share_company_with_companion($1, $2)', [first, outsider])).rejects.toMatchObject({ code: '42501' });
  });

  it('turning off global access preserves explicit shares and does not affect the reverse direction', async () => {
    await accept(); await all(true);
    await db.query('SELECT public.share_company_with_companion($1, $2)', [first, reader]);
    await asUser(reader);
    await db.query('SELECT public.set_companion_share_all($1, true)', [owner]);
    await all(false);
    expect(await visibleCompanies(reader)).toEqual([first, readerCompany]);
    expect(await visibleCompanies(owner)).toEqual([first, second, readerCompany]);
    await db.query('DELETE FROM public.shares WHERE company_id = $1', [first]);
    expect(await visibleCompanies(reader)).toEqual([readerCompany]);
  });

  it('removing a companion revokes explicit and global grants in both directions', async () => {
    const id = await accept(); await all(true);
    await db.query('SELECT public.share_company_with_companion($1, $2)', [first, reader]);
    await asUser(reader);
    await db.query('SELECT public.share_company_with_companion($1, $2)', [readerCompany, owner]);
    await db.query('SELECT public.set_companion_share_all($1, true)', [owner]);
    await db.query('SELECT public.remove_stock_companion($1)', [id]);
    expect((await db.query('SELECT * FROM public.stock_companions')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.companion_all_shares')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.shares')).rows).toEqual([]);
    expect(await visibleCompanies(owner)).toEqual([first, second]);
    expect(await visibleCompanies(reader)).toEqual([readerCompany]);
    await asUser(owner);
    await expect(db.query('SELECT public.share_company_with_email($1, $2)', [first, 'reader@example.com'])).rejects.toMatchObject({ code: '42501' });
  });

  it('blocks forged connections, global grants, responses, and access probes about another user', async () => {
    const id = await accept(); await all(true); await asUser(outsider);
    expect((await db.query('SELECT * FROM public.companion_all_shares')).rows).toEqual([]);
    for (const sql of [
      `INSERT INTO public.stock_companions (requester_id, recipient_id, status, accepted_at) VALUES ('${outsider}', '${owner}', 'accepted', now())`,
      `INSERT INTO public.companion_all_shares (owner_id, companion_id, connection_id) VALUES ('${owner}', '${outsider}', '${id}')`,
      `UPDATE public.stock_companions SET status = 'accepted'`,
      `DELETE FROM public.stock_companions`,
      `SELECT public.remove_stock_companion('${id}')`,
    ]) await expect(db.query(sql)).rejects.toMatchObject({ code: '42501' });
    expect((await db.query('SELECT public.is_shared_with_user($1, $2) AS allowed', [first, reader])).rows).toEqual([{ allowed: false }]);
  });

  it('supports declining incoming requests and canceling outgoing requests', async () => {
    let id = await request();
    await asUser(reader);
    await db.query('SELECT public.respond_stock_companion($1, false)', [id]);
    expect((await db.query('SELECT * FROM public.list_stock_companions()')).rows).toEqual([]);
    id = await request();
    await db.query('SELECT public.remove_stock_companion($1)', [id]);
    expect((await db.query('SELECT * FROM public.list_stock_companions()')).rows).toEqual([]);
  });

  it('preserves legacy individual shares without an accepted companion', async () => {
    await db.query("INSERT INTO public.shares (company_id, owner_id, shared_with_user_id, shared_with_email) VALUES ($1, $2, $3, 'Reader@Example.com')", [first, owner, reader]);
    expect(await visibleCompanies(reader)).toEqual([first, readerCompany]);
    const id = await request();
    await db.query('SELECT public.remove_stock_companion($1)', [id]);
    expect(await visibleCompanies(reader)).toEqual([first, readerCompany]);
  });

  it('shares the complete company card and every current and future analysis with read-only access', async () => {
    await accept(); await asUser(owner);
    await db.query('SELECT public.share_company_with_companion($1, $2)', [first, reader]);
    const later = await db.query<{ id: string }>("INSERT INTO public.analyses (company_id, user_id, name) VALUES ($1, $2, 'Later analysis') RETURNING id", [first, owner]);
    await db.query("INSERT INTO public.quarterly_estimates (analysis_id, note) VALUES ($1, 'Later estimates')", [later.rows[0].id]);
    await asUser(reader);
    expect((await db.query('SELECT name FROM public.analyses ORDER BY name')).rows).toEqual([{ name: 'First analysis' }, { name: 'Later analysis' }]);
    expect((await db.query('SELECT note FROM public.quarterly_estimates ORDER BY note')).rows).toEqual([{ note: 'First analysis' }, { note: 'Later estimates' }]);
    for (const table of [...cardTables, 'insider_ownership_history']) {
      expect((await db.query(`SELECT note FROM public.${table}`)).rows).toEqual([{ note: 'First card' }]);
      expect((await db.query(`UPDATE public.${table} SET note = 'Changed' RETURNING id`)).rows).toEqual([]);
      expect((await db.query(`DELETE FROM public.${table} RETURNING id`)).rows).toEqual([]);
      const dateColumn = table === 'insider_ownership_history' ? ', recorded_date' : '';
      const dateValue = table === 'insider_ownership_history' ? ", '2026-11-10'" : '';
      await expect(db.query(`INSERT INTO public.${table} (company_id, note${dateColumn}) VALUES ($1, 'Forged'${dateValue})`, [first])).rejects.toMatchObject({ code: '42501' });
    }
    expect((await db.query("UPDATE public.quarterly_estimates SET note = 'Changed' RETURNING id")).rows).toEqual([]);
    expect((await db.query('DELETE FROM public.quarterly_estimates RETURNING id')).rows).toEqual([]);
    await expect(db.query("INSERT INTO public.quarterly_estimates (analysis_id, note) VALUES ($1, 'Forged')", [later.rows[0].id])).rejects.toMatchObject({ code: '42501' });
  });

  it('protects legacy estimates and ownership history when access is absent or revoked', async () => {
    await accept(); await asUser(owner);
    await db.query('SELECT public.share_company_with_companion($1, $2)', [first, reader]);
    await asUser(outsider);
    for (const table of ['quarterly_estimates', 'insider_ownership_history']) expect((await db.query(`SELECT * FROM public.${table}`)).rows).toEqual([]);
    await asUser(owner);
    await db.query('DELETE FROM public.shares WHERE company_id = $1', [first]);
    await asUser(reader);
    for (const table of [...cardTables, 'quarterly_estimates', 'insider_ownership_history']) expect((await db.query(`SELECT * FROM public.${table}`)).rows).toEqual([]);
  });

  it('includes legacy estimates and ownership history when sharing all company cards', async () => {
    await accept(); await all(true); await asUser(reader);
    expect((await db.query('SELECT note FROM public.quarterly_estimates ORDER BY note')).rows).toEqual([{ note: 'First analysis' }, { note: 'Second analysis' }]);
    expect((await db.query('SELECT note FROM public.insider_ownership_history ORDER BY note')).rows).toEqual([{ note: 'First card' }, { note: 'Second card' }]);
    expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id = 'reports'")).rows).toHaveLength(2);
    await all(false); await asUser(reader);
    expect((await db.query('SELECT * FROM public.quarterly_estimates')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.insider_ownership_history')).rows).toEqual([]);
    expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id = 'reports'")).rows).toEqual([]);
  });

  it('lets the owner create, overwrite, edit, and delete ownership snapshots', async () => {
    await asUser(owner);
    const entries = [{ name: 'CEO', role: 'CEO', shares: 1000, percentage: 0.1 }];
    const upsert = `INSERT INTO public.insider_ownership_history (company_id, recorded_date, entries, note)
      VALUES ($1, '2026-11-10', $2, $3)
      ON CONFLICT (company_id, recorded_date) DO UPDATE SET entries = EXCLUDED.entries, note = EXCLUDED.note
      RETURNING id, entries, note`;
    const created = await db.query<{ id: string }>(upsert, [first, JSON.stringify(entries), 'Original']);
    const revised = [{ ...entries[0], shares: 2000, percentage: 0.2 }];
    expect((await db.query(upsert, [first, JSON.stringify(revised), 'Revised'])).rows)
      .toEqual([{ id: created.rows[0].id, entries: revised, note: 'Revised' }]);
    expect((await db.query('SELECT id FROM public.insider_ownership_history WHERE company_id = $1', [first])).rows).toHaveLength(2);
    expect((await db.query(`UPDATE public.insider_ownership_history
      SET recorded_date = '2026-11-09', entries = $2, note = 'Edited' WHERE id = $1 RETURNING note, entries`,
    [created.rows[0].id, JSON.stringify(entries)])).rows).toEqual([{ note: 'Edited', entries }]);
    expect((await db.query('DELETE FROM public.insider_ownership_history WHERE id = $1 RETURNING id', [created.rows[0].id])).rows).toHaveLength(1);
    expect((await db.query('SELECT note FROM public.insider_ownership_history WHERE company_id = $1', [first])).rows)
      .toEqual([{ note: 'First card' }]);
  });

  it.each(['individual', 'all'])('keeps ownership snapshots read-only with %s sharing', async (sharing) => {
    await accept();
    if (sharing === 'all') {
      await all(true);
    } else {
      await asUser(owner);
      await db.query('SELECT public.share_company_with_companion($1, $2)', [first, reader]);
    }
    await asUser(reader);
    expect((await db.query('SELECT note FROM public.insider_ownership_history WHERE company_id = $1', [first])).rows)
      .toEqual([{ note: 'First card' }]);
    for (const date of ['2026-11-01', '2026-11-10']) {
      await expect(db.query(`INSERT INTO public.insider_ownership_history (company_id, recorded_date, note)
        VALUES ($1, $2, 'Forged') ON CONFLICT (company_id, recorded_date) DO UPDATE SET note = EXCLUDED.note`,
      [first, date])).rejects.toMatchObject({ code: '42501' });
    }
    expect((await db.query("UPDATE public.insider_ownership_history SET note = 'Forged' WHERE company_id = $1 RETURNING id", [first])).rows).toEqual([]);
    expect((await db.query('DELETE FROM public.insider_ownership_history WHERE company_id = $1 RETURNING id', [first])).rows).toEqual([]);
    expect((await db.query('UPDATE public.insider_ownership_history SET company_id = $2 WHERE company_id = $1 RETURNING id', [first, readerCompany])).rows).toEqual([]);
    // The same recipient can still save snapshots for a company they own.
    expect((await db.query(`INSERT INTO public.insider_ownership_history (company_id, recorded_date)
      VALUES ($1, '2026-11-10') RETURNING id`, [readerCompany])).rows).toHaveLength(1);
    await asUser(owner);
    expect((await db.query('SELECT note FROM public.insider_ownership_history WHERE company_id = $1', [first])).rows)
      .toEqual([{ note: 'First card' }]);
  });

  it('rejects moving an owned ownership snapshot to another person’s company', async () => {
    await asUser(owner);
    await expect(db.query('UPDATE public.insider_ownership_history SET company_id = $2 WHERE company_id = $1', [first, readerCompany]))
      .rejects.toMatchObject({ code: '42501' });
    expect((await db.query('SELECT note FROM public.insider_ownership_history WHERE company_id = $1', [first])).rows)
      .toEqual([{ note: 'First card' }]);
  });

  it('denies outsiders and anonymous users ownership snapshot writes', async () => {
    await asUser(outsider);
    await expect(db.query(`INSERT INTO public.insider_ownership_history (company_id, recorded_date)
      VALUES ($1, '2026-11-10')`, [first])).rejects.toMatchObject({ code: '42501' });
    expect((await db.query("UPDATE public.insider_ownership_history SET note = 'Forged' RETURNING id")).rows).toEqual([]);
    expect((await db.query('DELETE FROM public.insider_ownership_history RETURNING id')).rows).toEqual([]);
    await asUser(null);
    for (const sql of [
      'SELECT * FROM public.insider_ownership_history',
      `INSERT INTO public.insider_ownership_history (company_id, recorded_date) VALUES ('${first}', '2026-11-10')`,
      "UPDATE public.insider_ownership_history SET note = 'Forged'",
      'DELETE FROM public.insider_ownership_history',
    ]) {
      await expect(db.query(sql)).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('allows recipients to read shared reports but not replace, delete, upload, or move card files', async () => {
    await accept(); await asUser(owner);
    await db.query('SELECT public.share_company_with_companion($1, $2)', [first, reader]);
    await asUser(reader);
    expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id = 'reports'")).rows).toEqual([{ name: `${first}/report.pdf` }]);
    expect((await db.query("UPDATE storage.objects SET name = 'Changed' RETURNING id")).rows).toEqual([]);
    expect((await db.query('DELETE FROM storage.objects RETURNING id')).rows).toEqual([]);
    await expect(db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('reports', $1)", [`${first}/forged.pdf`])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('analysis-images', $1)", [`company/${first}/forged.png`])).rejects.toMatchObject({ code: '42501' });
    await asUser(owner);
    expect((await db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('reports', $1) RETURNING id", [`${first}/new.pdf`])).rows).toHaveLength(1);
    expect((await db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('analysis-images', $1) RETURNING id", [`company/${first}/new.png`])).rows).toHaveLength(1);
    await expect(db.query("UPDATE storage.objects SET name = $1 WHERE bucket_id = 'reports' AND name = $2", [`${readerCompany}/moved.pdf`, `${first}/report.pdf`])).rejects.toMatchObject({ code: '42501' });
    expect((await db.query("UPDATE storage.objects SET name = $1 WHERE bucket_id = 'reports' AND name = $2 RETURNING id", [`${first}/renamed.pdf`, `${first}/report.pdf`])).rows).toHaveLength(1);
    expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'analysis-images' RETURNING id")).rows).toHaveLength(4);
    await asUser(outsider);
    expect((await db.query("SELECT * FROM storage.objects WHERE bucket_id = 'reports'")).rows).toEqual([]);
  });
});
