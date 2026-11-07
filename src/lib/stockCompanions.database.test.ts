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
    await db.exec(base);
    await db.exec(migration);
  }, 30_000);

  beforeEach(async () => {
    await db.exec('RESET ROLE; TRUNCATE public.stock_companions, public.companion_all_shares, public.shares, public.income_statement, public.analyses, public.companies CASCADE;');
    await db.exec(`
      INSERT INTO public.companies VALUES ('${first}', '${owner}', 'First'), ('${second}', '${owner}', 'Second'), ('${readerCompany}', '${reader}', 'Reader company');
      INSERT INTO public.analyses (company_id, user_id, name) VALUES ('${first}', '${owner}', 'First analysis'), ('${second}', '${owner}', 'Second analysis');
      INSERT INTO public.income_statement VALUES ('${first}', 100), ('${second}', 200);
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
});
