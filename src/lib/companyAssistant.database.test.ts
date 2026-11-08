// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '10000000-0000-0000-0000-000000000001';
const reader = '10000000-0000-0000-0000-000000000002';
const outsider = '10000000-0000-0000-0000-000000000003';
const company = '20000000-0000-0000-0000-000000000001';
const otherCompany = '20000000-0000-0000-0000-000000000002';
const migration = readFileSync(new URL('../../supabase/migrations/20261108081520_company_assistant.sql', import.meta.url), 'utf8');
type Reservation = { allowed: boolean; reason: string | null; retryAfterSeconds: number };

describe('company assistant permissions and shared Gemini allowance', () => {
  let db: PGlite;

  async function asUser(id: string | null) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
    await db.exec(`SET ROLE ${id ? 'authenticated' : 'anon'}`);
  }
  async function asServer() {
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE service_role');
  }
  async function configure(user = owner) {
    await asUser(user);
    return db.query(`SELECT (public.set_company_ai_settings($1, true, true, ARRAY['https://example.com/feed.xml'])).*`, [company]);
  }
  async function claim(user: string | null = reader, purpose = 'chat') {
    return (await db.query<{ result: Reservation }>(
      'SELECT public.claim_company_ai_request($1, $2, $3) AS result', [company, user, purpose],
    )).rows[0].result;
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
      CREATE TABLE public.assistant_test_shares (company_id uuid, recipient_id uuid);
      CREATE TABLE public.assistant_test_share_all (owner_id uuid, recipient_id uuid);
      CREATE FUNCTION public.assistant_test_shared(_company uuid, _user uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
        SELECT EXISTS (SELECT 1 FROM public.assistant_test_shares WHERE company_id = _company AND recipient_id = _user)
        OR EXISTS (SELECT 1 FROM public.assistant_test_share_all s JOIN public.companies c ON c.user_id = s.owner_id
          WHERE c.id = _company AND s.recipient_id = _user)
      $$;
      ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
      CREATE POLICY assistant_test_own ON public.companies FOR ALL TO authenticated
        USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
      CREATE POLICY assistant_test_read_shared ON public.companies FOR SELECT TO authenticated
        USING (public.assistant_test_shared(id, (SELECT auth.uid())));
      GRANT SELECT ON public.companies TO authenticated;
      GRANT ALL ON public.companies, auth.users TO service_role;
      INSERT INTO auth.users VALUES ('${owner}'), ('${reader}'), ('${outsider}');
      INSERT INTO public.companies VALUES ('${company}', '${owner}'), ('${otherCompany}', '${outsider}');
    `);
    await db.exec(migration);
  }, 30_000);

  beforeEach(async () => {
    await db.exec('RESET ROLE');
    await db.exec(`
      TRUNCATE public.company_ai_settings, public.company_news_items, public.company_chat_turns,
        private.company_ai_usage, public.assistant_test_shares, public.assistant_test_share_all;
      UPDATE private.company_ai_state SET paused_until = NULL;
      INSERT INTO public.assistant_test_shares VALUES ('${company}', '${reader}');
      INSERT INTO public.company_ai_settings (company_id) VALUES ('${company}');
      INSERT INTO public.company_news_items (company_id, url, title, source)
        VALUES ('${company}', 'https://example.com/release', 'A new release', 'Example');
      INSERT INTO public.company_chat_turns (company_id, user_id, question, answer)
        VALUES ('${company}', '${owner}', 'Owner question', 'Owner answer'),
          ('${company}', '${reader}', 'Reader question', 'Reader answer');
    `);
  });
  afterAll(async () => { await db?.close(); });

  it('lets only the owner configure the feature, including its first settings row', async () => {
    expect((await configure()).rows[0]).toMatchObject({ company_id: company, news_enabled: true });
    await db.exec('RESET ROLE');
    await db.exec('DELETE FROM public.company_ai_settings');
    await expect(configure(reader)).rejects.toMatchObject({ code: '42501' });
    await expect(configure(outsider)).rejects.toMatchObject({ code: '42501' });
    expect((await configure()).rows[0]).toMatchObject({ feed_urls: ['https://example.com/feed.xml'] });
  });

  it('validates bounded HTTPS feeds and rejects anonymous settings calls', async () => {
    await asUser(owner);
    for (const feeds of [['http://example.com/feed'], ['file:///etc/passwd'], Array(6).fill('https://example.com/feed'), [null]]) {
      await expect(db.query('SELECT public.set_company_ai_settings($1, true, true, $2)', [company, feeds]))
        .rejects.toMatchObject({ code: '22023' });
    }
    await asUser(null);
    await expect(db.query('SELECT public.set_company_ai_settings($1, true, true, ARRAY[]::text[])', [company]))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('shares news and settings but keeps each person’s conversation private, including from the owner', async () => {
    await asUser(reader);
    expect((await db.query('SELECT company_id FROM public.company_ai_settings')).rows).toHaveLength(1);
    expect((await db.query('SELECT title FROM public.company_news_items')).rows).toEqual([{ title: 'A new release' }]);
    expect((await db.query('SELECT question FROM public.company_chat_turns')).rows).toEqual([{ question: 'Reader question' }]);
    await asUser(owner);
    expect((await db.query('SELECT question FROM public.company_chat_turns')).rows).toEqual([{ question: 'Owner question' }]);
    await asUser(outsider);
    for (const table of ['company_ai_settings', 'company_news_items', 'company_chat_turns']) {
      expect((await db.query(`SELECT * FROM public.${table}`)).rows).toEqual([]);
    }
    await asUser(null);
    await expect(db.query('SELECT * FROM public.company_news_items')).rejects.toMatchObject({ code: '42501' });
  });

  it('immediately removes settings, news and private context after direct sharing is revoked', async () => {
    await db.exec('DELETE FROM public.assistant_test_shares');
    await asUser(reader);
    for (const table of ['company_ai_settings', 'company_news_items', 'company_chat_turns']) {
      expect((await db.query(`SELECT * FROM public.${table}`)).rows).toEqual([]);
    }
    expect((await db.query('DELETE FROM public.company_chat_turns RETURNING id')).rows).toEqual([]);
  });

  it('uses current company RLS for share-all access and its revocation', async () => {
    await db.exec(`DELETE FROM public.assistant_test_shares;
      INSERT INTO public.assistant_test_share_all VALUES ('${owner}', '${reader}');`);
    await asUser(reader);
    expect((await db.query('SELECT * FROM public.company_news_items')).rows).toHaveLength(1);
    await db.exec('RESET ROLE');
    await db.exec('DELETE FROM public.assistant_test_share_all');
    await asUser(reader);
    expect((await db.query('SELECT * FROM public.company_news_items')).rows).toEqual([]);
  });

  it('prevents forged AI answers, news and backend status even for the owner', async () => {
    await asUser(owner);
    await expect(db.query(`INSERT INTO public.company_chat_turns (company_id, user_id, question, answer)
      VALUES ($1, $2, 'forged', 'forged')`, [company, owner])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query(`INSERT INTO public.company_news_items (company_id, url, title, source)
      VALUES ($1, 'https://forged.example', 'Forged news', 'Forged')`, [company])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query("UPDATE public.company_ai_settings SET news_summary = 'Forged'")).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('UPDATE public.company_ai_settings SET news_paused_until = now()')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('UPDATE public.company_ai_settings SET company_id = $1', [otherCompany])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('SELECT * FROM private.company_ai_usage')).rejects.toMatchObject({ code: '42501' });
  });

  it('allows deleting only the caller’s private conversation', async () => {
    await asUser(reader);
    expect((await db.query('DELETE FROM public.company_chat_turns RETURNING question')).rows).toEqual([{ question: 'Reader question' }]);
    await asUser(owner);
    expect((await db.query('SELECT question FROM public.company_chat_turns')).rows).toEqual([{ question: 'Owner question' }]);
  });

  it('restricts quota and pause RPCs to the server role', async () => {
    for (const user of [owner, reader, null]) {
      await asUser(user);
      await expect(claim()).rejects.toMatchObject({ code: '42501' });
      await expect(db.query('SELECT public.pause_company_ai(60)')).rejects.toMatchObject({ code: '42501' });
    }
    await asServer();
    expect(await claim()).toEqual({ allowed: true, reason: null, retryAfterSeconds: 0 });
  });

  it('reserves before requests and blocks per-user minute bursts without recording denied calls', async () => {
    await asServer();
    expect((await claim()).allowed).toBe(true);
    expect((await claim()).allowed).toBe(true);
    expect(await claim()).toMatchObject({ allowed: false, reason: 'user_rate_limit' });
    expect((await db.query('SELECT count(*)::integer AS count FROM private.company_ai_usage')).rows).toEqual([{ count: 2 }]);
  });

  it('shares the global minute budget between news and chat', async () => {
    await asServer();
    const reservations = await Promise.all(Array.from({ length: 6 }, () => claim(null, 'news')));
    expect(reservations.filter(result => result.allowed)).toHaveLength(5);
    expect(reservations.filter(result => !result.allowed)).toEqual([
      expect.objectContaining({ reason: 'project_rate_limit', retryAfterSeconds: expect.any(Number) }),
    ]);
  });

  it('caps daily usage using the provider’s Pacific calendar day', async () => {
    await db.exec(`INSERT INTO private.company_ai_usage (company_id, purpose, created_at)
      SELECT '${company}', 'news',
        ((now() AT TIME ZONE 'America/Los_Angeles')::date::timestamp AT TIME ZONE 'America/Los_Angeles') + interval '1 millisecond'
      FROM generate_series(1, 50)`);
    await asServer();
    const result = await claim(null, 'news');
    expect(result).toMatchObject({ allowed: false, reason: 'project_daily_limit' });
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(90000);
  });

  it('caps each user’s daily chat allocation independently of news', async () => {
    await db.exec(`INSERT INTO private.company_ai_usage (company_id, user_id, purpose, created_at)
      SELECT '${company}', '${reader}', 'chat',
        ((now() AT TIME ZONE 'America/Los_Angeles')::date::timestamp AT TIME ZONE 'America/Los_Angeles') + interval '1 millisecond'
      FROM generate_series(1, 20)`);
    await asServer();
    expect(await claim()).toMatchObject({ allowed: false, reason: 'user_daily_limit' });
    expect((await claim(owner)).allowed).toBe(true);
  });

  it('pauses all AI requests on provider quota exhaustion and never shortens an existing pause', async () => {
    await asServer();
    await db.query('SELECT public.pause_company_ai(3600)');
    await db.query('SELECT public.pause_company_ai(60)');
    const result = await claim(null, 'news');
    expect(result).toMatchObject({ allowed: false, reason: 'quota_exhausted' });
    expect(result.retryAfterSeconds).toBeGreaterThan(3500);
    expect((await db.query('SELECT count(*)::integer AS count FROM private.company_ai_usage')).rows).toEqual([{ count: 0 }]);
  });

  it('can preserve the 25-hour Pacific DST reset and clamps excessive pauses to 26 hours', async () => {
    await asServer();
    await db.query('SELECT public.pause_company_ai(90001)');
    const dstPause = await claim(null, 'news');
    expect(dstPause.retryAfterSeconds).toBeGreaterThanOrEqual(90000);
    expect(dstPause.retryAfterSeconds).toBeLessThanOrEqual(90001);
    await db.query('SELECT public.pause_company_ai(999999)');
    const boundedPause = await claim(null, 'news');
    expect(boundedPause.retryAfterSeconds).toBeGreaterThanOrEqual(93599);
    expect(boundedPause.retryAfterSeconds).toBeLessThanOrEqual(93600);
  });
});
