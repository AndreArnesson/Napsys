// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const owner = '10000000-0000-0000-0000-000000000001';
const recipient = '10000000-0000-0000-0000-000000000002';
const outsider = '10000000-0000-0000-0000-000000000003';
const company = '20000000-0000-0000-0000-000000000001';
const migration = readFileSync(new URL('../../supabase/migrations/20261105205426_add_company_sharing.sql', import.meta.url), 'utf8');

describe.each(['original', 'export'] as const)('company sharing with the %s schema', (schema) => {
  let db: PGlite;

  async function asUser(id: string | null) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
    await db.exec(`SET ROLE ${id ? 'authenticated' : 'anon'}`);
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, deleted_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
      CREATE TABLE public.companies (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text);
      CREATE TABLE public.analyses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES public.companies, user_id uuid NOT NULL, name text);
      CREATE TABLE public.shares (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES public.companies ON DELETE CASCADE,
        shared_with_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
        ${schema === 'original' ? `, owner_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
          shared_with_email text NOT NULL, permission text NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'comment'))` : ''}
      );
      CREATE FUNCTION public.is_shared_with_user(_company_id uuid, _user_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT EXISTS (SELECT 1 FROM public.shares WHERE company_id = _company_id AND shared_with_user_id = _user_id)
      $$;
      ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_company ON public.companies FOR ALL USING (user_id = auth.uid());
      CREATE POLICY shared_company ON public.companies FOR SELECT USING (public.is_shared_with_user(id, auth.uid()));
      CREATE POLICY own_analysis ON public.analyses FOR ALL USING (user_id = auth.uid());
      CREATE POLICY shared_analysis ON public.analyses FOR SELECT USING (public.is_shared_with_user(company_id, auth.uid()));
      CREATE POLICY legacy_shares ON public.shares FOR ALL USING (true) WITH CHECK (true);
      GRANT ALL ON public.companies, public.analyses, public.shares TO authenticated, anon;
      INSERT INTO auth.users (id, email) VALUES ('${owner}', 'owner@example.com'), ('${recipient}', 'Reader@Example.com'), ('${outsider}', 'outsider@example.com');
      INSERT INTO public.companies VALUES ('${company}', '${owner}', 'Example');
      INSERT INTO public.analyses (company_id, user_id, name) VALUES ('${company}', '${owner}', 'Original');
      INSERT INTO public.shares (company_id, shared_with_user_id ${schema === 'original' ? ', owner_id, shared_with_email' : ''})
      VALUES ('${company}', '${recipient}' ${schema === 'original' ? `, '${outsider}', 'Reader@Example.com'` : ''}),
        ('${company}', '${recipient}' ${schema === 'original' ? `, '${outsider}', 'Reader@Example.com'` : ''});
    `);
    await db.exec(migration);
    // Upgrade both historical schema shapes without losing existing access.
    expect((await db.query('SELECT owner_id, shared_with_email FROM public.shares')).rows)
      .toEqual([{ owner_id: owner, shared_with_email: 'Reader@Example.com' }]);
    await db.exec('DELETE FROM public.shares');
  }, 30_000);

  afterAll(async () => { await db?.close(); });

  it('denies anonymous RPC calls', async () => {
    await asUser(null);
    await expect(db.query('SELECT public.share_company_with_email($1, $2)', [company, 'Reader@Example.com']))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('checks ownership before resolving the recipient, including direct private calls', async () => {
    await asUser(outsider);
    for (const fn of ['public', 'private']) {
      await expect(db.query(`SELECT ${fn}.share_company_with_email($1, $2)`, [company, 'missing@example.com']))
        .rejects.toMatchObject({ code: '42501' });
    }
  });

  it('rejects unknown recipients and self sharing', async () => {
    await asUser(owner);
    await expect(db.query('SELECT public.share_company_with_email($1, $2)', [company, 'missing@example.com']))
      .rejects.toMatchObject({ code: 'P0002' });
    await expect(db.query('SELECT public.share_company_with_email($1, $2)', [company, 'owner@example.com']))
      .rejects.toMatchObject({ code: '22023' });
  });

  it('normalizes email, creates a read grant, and makes duplicate requests idempotent', async () => {
    await asUser(owner);
    const first = await db.query('SELECT public.share_company_with_email($1, $2) AS id', [company, '  reader@EXAMPLE.COM  ']);
    const second = await db.query('SELECT public.share_company_with_email($1, $2) AS id', [company, 'reader@example.com']);
    expect(second.rows).toEqual(first.rows);
    expect((await db.query('SELECT owner_id, shared_with_user_id, shared_with_email, permission FROM public.shares')).rows)
      .toEqual([{ owner_id: owner, shared_with_user_id: recipient, shared_with_email: 'Reader@Example.com', permission: 'read' }]);
  });

  it('allows the recipient to read the shared company and analyses, while outsiders see neither', async () => {
    await asUser(recipient);
    expect((await db.query('SELECT name FROM public.companies')).rows).toEqual([{ name: 'Example' }]);
    expect((await db.query('SELECT name FROM public.analyses')).rows).toEqual([{ name: 'Original' }]);
    await asUser(outsider);
    expect((await db.query('SELECT * FROM public.companies')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.analyses')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.shares')).rows).toEqual([]);
  });

  it('blocks recipient writes, new analyses, re-sharing, forged grants, and revocation', async () => {
    await asUser(recipient);
    expect((await db.query("UPDATE public.analyses SET name = 'Changed' RETURNING id")).rows).toEqual([]);
    expect((await db.query('DELETE FROM public.analyses RETURNING id')).rows).toEqual([]);
    await expect(db.query('INSERT INTO public.analyses (company_id, user_id) VALUES ($1, $2)', [company, recipient]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('SELECT public.share_company_with_email($1, $2)', [company, 'outsider@example.com']))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('INSERT INTO public.shares (company_id, shared_with_user_id) VALUES ($1, $2)', [company, outsider]))
      .rejects.toMatchObject({ code: '42501' });
    expect((await db.query('DELETE FROM public.shares RETURNING id')).rows).toEqual([]);
  });

  it('lets the owner revoke access and immediately removes recipient visibility', async () => {
    await asUser(owner);
    expect((await db.query('DELETE FROM public.shares RETURNING id')).rows).toHaveLength(1);
    await asUser(recipient);
    expect((await db.query('SELECT * FROM public.companies')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.analyses')).rows).toEqual([]);
  });

  it('prevents moving an owned analysis into another user’s company', async () => {
    await db.exec('RESET ROLE');
    const ownCompany = '20000000-0000-0000-0000-000000000002';
    await db.query('INSERT INTO public.companies VALUES ($1, $2, $3)', [ownCompany, recipient, 'Recipient company']);
    await asUser(recipient);
    await db.query('INSERT INTO public.analyses (company_id, user_id) VALUES ($1, $2)', [ownCompany, recipient]);
    await expect(db.query('UPDATE public.analyses SET company_id = $1 WHERE user_id = $2', [company, recipient]))
      .rejects.toMatchObject({ code: '42501' });
  });
});
