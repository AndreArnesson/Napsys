import { beforeEach, describe, expect, it, vi } from 'vitest';
import { companyXSearch, loadMonitoredCompanies, loadNewsPage } from './newsFeed';
const mocks = vi.hoisted(() => ({ calls: [] as unknown[][], data: [] as unknown[], error: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: table => {
  mocks.calls.push(['from', table]);
  const query = { then: resolve => resolve({ data: mocks.data, error: mocks.error }) };
  for (const key of ['select', 'eq', 'order', 'range', 'abortSignal']) query[key] = (...args) => { mocks.calls.push([key, ...args]); return query; };
  return query;
} } }));
beforeEach(() => { mocks.calls = []; mocks.data = []; mocks.error = null; });
describe('news source queries', () => {
  it('requires enabled monitoring in nested inner joins and scopes filtered pages on the server', async () => {
    await loadNewsPage('company', 2);
    expect(mocks.calls).toContainEqual(['eq', 'companies.company_ai_settings.news_enabled', true]);
    expect(mocks.calls).toContainEqual(['eq', 'company_id', 'company']);
    expect(mocks.calls).toContainEqual(['range', 80, 119]);
    expect(String(mocks.calls.find(call => call[0] === 'select')?.[1])).toContain('company_ai_settings!inner');
  });
  it('reads only enabled company settings, sorting names for the selector', async () => {
    mocks.data = [{ companies: { id: 'z', name: 'Zebra', ticker: null } }, { companies: { id: 'a', name: 'Alpha', ticker: 'A' } }];
    expect((await loadMonitoredCompanies()).map(company => company.id)).toEqual(['a', 'z']);
    expect(mocks.calls).toContainEqual(['eq', 'news_enabled', true]);
  });
  it('does not interpret company names or tickers as X search operators', () => {
    const url = new URL(companyXSearch({ name: 'A " OR from:other\nB', ticker: 'ABC OR from:other' }));
    expect(url.searchParams.get('q')).toBe('("A   OR from:other B")');
    expect(url.searchParams.get('f')).toBe('live');
  });
});
