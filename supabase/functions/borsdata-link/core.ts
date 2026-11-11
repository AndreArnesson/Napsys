export interface BorsdataInstrument {
  name: string;
  ticker: string;
  country: string;
  urlName: string;
  marketId: number;
}

export interface CompanyIdentity {
  name: string;
  ticker: string | null;
  exchange: string | null;
}

export class BorsdataError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const countrySuffixes: Record<string, string> = {
  ST: 'SWE', OL: 'NOR', CO: 'DNK', HE: 'FIN', IC: 'ISL', L: 'GBR', DE: 'DEU', F: 'DEU',
  PA: 'FRA', AS: 'NLD', BR: 'BEL', SW: 'CHE', MI: 'ITA', MC: 'ESP', TO: 'CAN', AX: 'AUS',
  T: 'JPN', HK: 'HKG', SI: 'SGP', BO: 'IND', NS: 'IND', US: 'USA',
};
const exchangeCountries: Record<string, string> = {
  stockholm: 'SWE', helsinki: 'FIN', copenhagen: 'DNK', oslo: 'NOR', nasdaq: 'USA', nyse: 'USA', us: 'USA',
  london: 'GBR', frankfurt: 'DEU', paris: 'FRA', amsterdam: 'NLD', brussels: 'BEL', zurich: 'CHE',
  milan: 'ITA', madrid: 'ESP', toronto: 'CAN', sydney: 'AUS', tokyo: 'JPN', hong_kong: 'HKG', singapore: 'SGP', mumbai: 'IND',
};

function baseTicker(ticker: string) {
  const suffix = ticker.match(/\.([a-z]+)$/i)?.[1].toUpperCase();
  return suffix && countrySuffixes[suffix] ? ticker.slice(0, -(suffix.length + 1)) : ticker;
}

function normalizeTicker(ticker: string) {
  return baseTicker(ticker.trim()).toUpperCase().replace(/[\s._-]/g, '');
}

function normalizeName(name: string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\s+publ$/, '').replace(/\s+(?:ab|plc|inc|corp|corporation|ltd)$/, '').replace(/^ab\s+/, '').trim();
}

function expectedCountry(company: CompanyIdentity) {
  const suffix = company.ticker?.trim().match(/\.([a-z]+)$/i)?.[1].toUpperCase();
  if (suffix && countrySuffixes[suffix]) return countrySuffixes[suffix];
  const exchange = company.exchange?.trim().toLowerCase() ?? '';
  if (exchangeCountries[exchange]) return exchangeCountries[exchange];
  for (const [pattern, country] of [
    [/stockholm|sweden|sverige|^x?sto$/, 'SWE'],
    [/oslo|norway|norge|^x?osl$/, 'NOR'],
    [/copenhagen|denmark|danmark|^x?cse$/, 'DNK'],
    [/helsinki|finland|^x?hel$/, 'FIN'],
    [/iceland|island|reykjavik/, 'ISL'],
    [/^nasdaq$|nyse|new york/, 'USA'],
  ] as const) if (pattern.test(exchange)) return country;
  return undefined;
}

export function readInstruments(value: unknown): BorsdataInstrument[] {
  if (!Array.isArray(value)) throw new BorsdataError('provider_unavailable', 503);
  return value.slice(0, 40).filter((item): item is BorsdataInstrument => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    return typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 250
      && typeof row.ticker === 'string' && row.ticker.length <= 60
      && typeof row.country === 'string' && /^[A-Z]{3}$/.test(row.country)
      && typeof row.urlName === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,199}$/u.test(row.urlName)
      && typeof row.marketId === 'number' && Number.isInteger(row.marketId);
  }).map(({ name, ticker, country, urlName, marketId }) => ({ name, ticker, country, urlName, marketId }));
}

export function matchInstrument(company: CompanyIdentity, instruments: BorsdataInstrument[]) {
  const country = expectedCountry(company);
  const eligible = instruments.filter(item => !country || item.country === country);
  const name = normalizeName(company.name);
  const ticker = normalizeTicker(company.ticker ?? '');
  const byName = eligible.filter(item => name && normalizeName(item.name) === name);
  const byTicker = eligible.filter(item => ticker && normalizeTicker(item.ticker) === ticker);
  const both = byName.filter(item => byTicker.includes(item));
  if (both.length === 1) return both[0];
  // Conflicting names/tickers and repeated tickers across markets need a choice.
  if (byName.length === 1 && byTicker.length === 0) return byName[0];
  if (byTicker.length === 1 && byName.length === 0) return byTicker[0];
  return null;
}

export function searchTerms(company: CompanyIdentity) {
  return [...new Set([company.name.trim(), baseTicker(company.ticker?.trim() ?? '')]
    .filter(value => value.length >= 2).map(value => value.slice(0, 120)))];
}

// Only public search metadata is cached. Company access is checked on every call.
export function createInstrumentSearch(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; instruments: BorsdataInstrument[] }>();
  return async (term: string): Promise<BorsdataInstrument[]> => {
    const key = term.toLowerCase();
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.instruments;
    const url = new URL('https://borsdata.se/api/terminal/instruments');
    url.searchParams.set('name', term);
    url.searchParams.set('take', '40');
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' }, redirect: 'error' });
      if (!response.ok) throw new BorsdataError('provider_unavailable', 503);
      const instruments = readInstruments(await response.json());
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + (instruments.length ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000), instruments });
      return instruments;
    } catch { throw new BorsdataError('provider_unavailable', 503); }
  };
}

export function createBorsdataHandler({ loadCompany, search }: {
  loadCompany: (req: Request, companyId: string) => Promise<CompanyIdentity | null>;
  search: (term: string) => Promise<BorsdataInstrument[]>;
}) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return json({});
    if (req.method !== 'POST') return json({ code: 'invalid_request' }, 405);
    try {
      const text = await req.text();
      if (text.length > 2048) throw new BorsdataError('invalid_request', 400);
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new BorsdataError('invalid_request', 400); }
      const companyId = body && typeof body === 'object' && 'companyId' in body ? body.companyId : null;
      if (typeof companyId !== 'string' || !uuid.test(companyId)) throw new BorsdataError('invalid_request', 400);
      const company = await loadCompany(req, companyId);
      if (!company) throw new BorsdataError('forbidden', 403);
      const results = await Promise.all(searchTerms(company).map(search));
      const instruments = [...new Map(results.flat().map(item => [item.urlName, item])).values()];
      return json({ match: matchInstrument(company, instruments), candidates: instruments });
    } catch (error) {
      const known = error instanceof BorsdataError;
      return json({ code: known ? error.code : 'request_failed' }, known ? error.status : 503);
    }
  };
}
