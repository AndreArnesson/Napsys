// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  BorsdataError, createBorsdataHandler, createInstrumentSearch, matchInstrument, readInstruments, searchTerms,
  type BorsdataInstrument, type CompanyIdentity,
} from '../../supabase/functions/borsdata-link/core';

const cheffelo: BorsdataInstrument = { name: 'Cheffelo', ticker: 'CHEF', country: 'SWE', urlName: 'lmk-group', marketId: 4 };
const warehouse: BorsdataInstrument = { name: 'The Chefs Warehouse Inc', ticker: 'CHEF', country: 'USA', urlName: 'chefs-warehouse', marketId: 33 };
const investorA: BorsdataInstrument = { name: 'Investor A', ticker: 'INVE A', country: 'SWE', urlName: 'investor-a', marketId: 1 };
const investorB: BorsdataInstrument = { name: 'Investor B', ticker: 'INVE B', country: 'SWE', urlName: 'investor', marketId: 1 };
const company: CompanyIdentity = { name: 'Cheffelo', ticker: 'CHEF', exchange: null };
const companyId = '10000000-0000-4000-8000-000000000001';
const request = (body: unknown = { companyId }) => new Request('https://example.test/borsdata-link', { method: 'POST', body: JSON.stringify(body) });

describe('Börsdata instrument matching', () => {
  it('resolves Cheffelo to the legacy lmk-group URL even when another market has the same ticker', () => {
    expect(matchInstrument(company, [warehouse, cheffelo])).toEqual(cheffelo);
    expect(matchInstrument({ ...company, name: 'Cheffelo AB (publ)' }, [warehouse, cheffelo])).toEqual(cheffelo);
  });

  it('requires a choice for ambiguous tickers, company names, and share classes', () => {
    expect(matchInstrument({ ...company, name: 'Unknown' }, [warehouse, cheffelo])).toBeNull();
    expect(matchInstrument({ name: 'Investor', ticker: null, exchange: null }, [investorA, investorB])).toBeNull();
    expect(matchInstrument({ name: 'Investor', ticker: 'INVE-B.ST', exchange: null }, [investorA, investorB])).toEqual(investorB);
  });

  it('uses the exchange or ticker suffix to distinguish identical tickers across countries', () => {
    expect(matchInstrument({ ...company, name: 'Unknown', exchange: 'stockholm' }, [warehouse, cheffelo])).toEqual(cheffelo);
    expect(matchInstrument({ ...company, name: 'Unknown', exchange: 'us' }, [warehouse, cheffelo])).toEqual(warehouse);
    expect(matchInstrument({ ...company, name: 'Unknown', ticker: 'CHEF.ST' }, [warehouse, cheffelo])).toEqual(cheffelo);
  });

  it('does not choose when the name and ticker disagree or the company is in another country', () => {
    expect(matchInstrument({ ...company, ticker: 'INVE A' }, [cheffelo, investorA])).toBeNull();
    expect(matchInstrument({ ...company, exchange: 'oslo' }, [cheffelo])).toBeNull();
    expect(matchInstrument(company, [])).toBeNull();
  });

  it('rejects unsafe URL paths and searches for the base ticker instead of a guessed slug', () => {
    expect(readInstruments([cheffelo, { ...cheffelo, urlName: '../evil' }, { ...cheffelo, urlName: 'https://evil.test' }])).toEqual([cheffelo]);
    expect(searchTerms({ ...company, ticker: 'CHEF.ST' })).toEqual(['Cheffelo', 'CHEF']);
  });
});

describe('Börsdata public search', () => {
  it('reads the real search response without credentials and caches the metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([cheffelo, warehouse]));
    const search = createInstrumentSearch(fetcher);
    expect(await search('CHEF')).toEqual([cheffelo, warehouse]);
    expect(await search('chef')).toEqual([cheffelo, warehouse]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://borsdata.se/api/terminal/instruments?name=CHEF&take=40');
    expect(options).toMatchObject({ headers: { Accept: 'application/json' }, redirect: 'error' });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not cache provider failures or fabricate a ticker-based link', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json([cheffelo]));
    const search = createInstrumentSearch(fetcher);
    await expect(search('CHEF')).rejects.toMatchObject({ code: 'provider_unavailable', status: 503 });
    expect(await search('CHEF')).toEqual([cheffelo]);
  });
});

describe('Börsdata link handler', () => {
  it('checks company access before searching and returns a deduplicated confident match', async () => {
    const loadCompany = vi.fn().mockResolvedValue(company);
    const search = vi.fn().mockResolvedValue([cheffelo, warehouse]);
    const response = await createBorsdataHandler({ loadCompany, search })(request());
    expect(loadCompany).toHaveBeenCalledWith(expect.any(Request), companyId);
    expect(loadCompany.mock.invocationCallOrder[0]).toBeLessThan(search.mock.invocationCallOrder[0]);
    expect(await response.json()).toEqual({ match: cheffelo, candidates: [cheffelo, warehouse] });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([401, 403])('does not contact Börsdata without valid user/company access (%s)', async (status) => {
    const loadCompany = vi.fn().mockRejectedValue(new BorsdataError(status === 401 ? 'unauthorized' : 'forbidden', status));
    const search = vi.fn();
    const response = await createBorsdataHandler({ loadCompany, search })(request());
    expect(response.status).toBe(status);
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects inaccessible companies, malformed payloads, and unsupported methods', async () => {
    const loadCompany = vi.fn().mockResolvedValue(null), search = vi.fn();
    const handler = createBorsdataHandler({ loadCompany, search });
    expect((await handler(request())).status).toBe(403);
    expect((await handler(request({ companyId: 'not-an-id' }))).status).toBe(400);
    expect((await handler(new Request('https://example.test', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await handler(new Request('https://example.test'))).status).toBe(405);
    expect((await handler(new Request('https://example.test', { method: 'OPTIONS' }))).status).toBe(200);
    expect(search).not.toHaveBeenCalled();
  });

  it('returns a retryable error when the upstream search is unavailable', async () => {
    const response = await createBorsdataHandler({
      loadCompany: async () => company,
      search: async () => { throw new BorsdataError('provider_unavailable', 503); },
    })(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'provider_unavailable' });
  });
});
