// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callGemini: vi.fn(),
  getAdminClient: vi.fn(),
  requireUser: vi.fn(),
  downloadNewsFeed: vi.fn(),
  parseNewsFeed: vi.fn(),
  env: vi.fn(),
}));

vi.mock('../../supabase/functions/_shared/companyAi.ts', () => ({
  callGemini: mocks.callGemini,
  getAdminClient: mocks.getAdminClient,
  requireUser: mocks.requireUser,
  jsonResponse: (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }),
}));

vi.mock('../../supabase/functions/company-news/feed.ts', async (original) => ({
  ...await original<typeof import('../../supabase/functions/company-news/feed')>(),
  downloadNewsFeed: mocks.downloadNewsFeed,
  parseNewsFeed: mocks.parseNewsFeed,
}));

const companyId = '20000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000001';
const secret = 'test-cron-token-kept-on-the-server';
let handler: (req: Request) => Promise<Response>;

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'or', 'order', 'limit', 'update', 'is', 'lt']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = vi.fn((onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected));
  return chain;
}

function manualRequest() {
  return new Request('https://example.com/functions/v1/company-news', {
    method: 'POST', headers: { Authorization: 'Bearer example-user-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, action: 'refresh' }),
  });
}

describe('company-news endpoint authorization', () => {
  let admin: { from: ReturnType<typeof vi.fn> };
  let userClient: { from: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    vi.stubGlobal('Deno', {
      env: { get: mocks.env },
      serve: (callback: typeof handler) => { handler = callback; },
    });
    // Keep the Deno entrypoint outside the browser TypeScript compilation.
    const endpointPath = '../../supabase/functions/company-news/index.ts';
    await import(/* @vite-ignore */ endpointPath);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.mockImplementation(name => name === 'COMPANY_NEWS_CRON_TOKEN' ? secret : undefined);
    admin = { from: vi.fn(() => query([])) };
    userClient = { from: vi.fn() };
    mocks.getAdminClient.mockReturnValue(admin);
    mocks.requireUser.mockResolvedValue({ adminClient: admin, userClient, user: { id: userId } });
  });

  afterAll(() => { vi.unstubAllGlobals(); });

  it.each([undefined, 'forged-cron-token'])('does not grant cron access for token %s', async token => {
    mocks.requireUser.mockRejectedValue({ code: 'unauthorized', status: 401 });
    const response = await handler(new Request('https://example.com/functions/v1/company-news', {
      method: 'POST', headers: token ? { 'x-company-news-token': token } : {},
    }));
    expect(response.status).toBe(401);
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.getAdminClient).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.downloadNewsFeed).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it('rejects a shared reader before downloading, saving or generating news', async () => {
    const companies = query(null, { code: 'PGRST116' });
    userClient.from.mockReturnValue(companies);
    const response = await handler(manualRequest());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'forbidden' });
    expect(companies.eq).toHaveBeenCalledWith('user_id', userId);
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.downloadNewsFeed).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it('respects an owner disabling news and does not generate anything', async () => {
    userClient.from.mockReturnValueOnce(query({ id: companyId, user_id: userId }))
      .mockReturnValueOnce(query({ company_id: companyId, news_enabled: false }));
    const response = await handler(manualRequest());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'news_disabled' });
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.downloadNewsFeed).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it('honors an existing per-company pause without downloading or calling Gemini', async () => {
    userClient.from.mockReturnValueOnce(query({ id: companyId, user_id: userId }))
      .mockReturnValueOnce(query({
        company_id: companyId, news_enabled: true, feed_urls: [], last_news_checked_at: null,
        last_news_error: 'quota_exhausted', news_paused_until: new Date(Date.now() + 3600000).toISOString(),
      }));
    const response = await handler(manualRequest());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'news_refresh_limited' });
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.downloadNewsFeed).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it('does not call Gemini for a valid cron request with no opted-in companies', async () => {
    const dueSettings = query([]);
    admin.from.mockReturnValue(dueSettings);
    const response = await handler(new Request('https://example.com/functions/v1/company-news', {
      method: 'POST', headers: { 'x-company-news-token': secret },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 0, results: [] });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(admin.from).toHaveBeenCalledWith('company_ai_settings');
    expect(dueSettings.eq).toHaveBeenCalledWith('news_enabled', true);
    expect(dueSettings.or).toHaveBeenCalledOnce();
    const filter = dueSettings.or.mock.calls[0][0] as string;
    // Each nullable due-date branch includes a pause condition before LIMIT.
    expect(filter.match(/and\(/g)).toHaveLength(4);
    expect(filter.match(/news_paused_until\./g)).toHaveLength(4);
    expect(dueSettings.limit).toHaveBeenCalledWith(20);
    expect(mocks.downloadNewsFeed).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it('requires explicit ownership even if the bearer caller attempts to supply the cron header', async () => {
    userClient.from.mockReturnValue(query(null, { code: 'PGRST116' }));
    const request = manualRequest();
    request.headers.set('x-company-news-token', 'wrong');
    const response = await handler(request);
    expect(response.status).toBe(403);
    expect(mocks.getAdminClient).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });
});
