import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalysisWithSnapshot } from './createAnalysis';

const mocks = vi.hoisted(() => ({
  requests: [] as { table: string; action: string; filters: unknown[][]; values?: any }[],
  readError: '', insertError: '',
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  let action = 'select';
  let values: any;
  const filters: unknown[][] = [];
  const execute = () => {
    mocks.requests.push({ table, action, filters: [...filters], values });
    if ((action === 'select' && table === mocks.readError) || (action === 'insert' && table === mocks.insertError)) {
      return { data: null, error: new Error('snapshot failed') };
    }
    if (table === 'analyses' && action === 'insert') return { data: { id: 'new-analysis' }, error: null };
    if (action === 'select') return { data: [{ id: 'source-row', company_id: 'company', analysis_id: null,
      fiscal_year: 2024, revenue: 100, created_at: '2024-01-01', ...(table.startsWith('quarterly') ? { quarter: 4 } : {}),
    }], error: null };
    return { data: null, error: null };
  };
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push(['eq', key, value]); return query; },
    is: (key: string, value: unknown) => { filters.push(['is', key, value]); return query; },
    insert: (data: unknown) => { action = 'insert'; values = data; return query; },
    update: (data: unknown) => { action = 'update'; values = data; return query; },
    delete: () => { action = 'delete'; return query; },
    single: async () => execute(),
    then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
  };
  return query;
} } }));

const options = { companyId: 'company', userId: 'owner', currentPrice: 10, sharesOutstanding: 1_000_000,
  reportingCurrency: 'EUR', tradingCurrency: 'SEK', companyType: 'operating' };

beforeEach(() => { mocks.requests = []; mocks.readError = ''; mocks.insertError = ''; });

describe('new analysis financial snapshot', () => {
  it('copies only company-level annual and quarterly data and saves all valuation metadata', async () => {
    expect(await createAnalysisWithSnapshot(options)).toBe('new-analysis');
    const reads = mocks.requests.filter(request => request.action === 'select');
    expect(reads.map(request => request.table)).toEqual(['income_statement', 'balance_sheet', 'quarterly_income_statement']);
    for (const read of reads) expect(read.filters).toEqual([['eq', 'company_id', 'company'], ['is', 'analysis_id', null]]);
    const copies = mocks.requests.filter(request => request.action === 'insert' && request.table !== 'analyses');
    expect(copies).toHaveLength(3);
    for (const copy of copies) {
      expect(copy.values[0]).toMatchObject({ company_id: 'company', analysis_id: 'new-analysis', fiscal_year: 2024 });
      expect(copy.values[0]).not.toHaveProperty('id');
      expect(copy.values[0]).not.toHaveProperty('created_at');
    }
    expect(mocks.requests.at(-1)).toMatchObject({ table: 'analyses', action: 'update',
      values: { visible_sections: { snapshot_complete: true, reporting_currency: 'EUR', trading_currency: 'SEK',
        company_type: 'operating', calculation_settings: { targetPE: 15, qGrowthMode: 'yoy' } } },
    });
  });

  it('does not create an analysis when a source dataset cannot be read', async () => {
    mocks.readError = 'quarterly_income_statement';
    await expect(createAnalysisWithSnapshot(options)).rejects.toThrow('snapshot failed');
    expect(mocks.requests.some(request => request.action !== 'select')).toBe(false);
  });

  it('removes an incomplete analysis when a snapshot copy fails', async () => {
    mocks.insertError = 'quarterly_income_statement';
    await expect(createAnalysisWithSnapshot(options)).rejects.toThrow('snapshot failed');
    expect(mocks.requests.at(-1)).toEqual({ table: 'analyses', action: 'delete', filters: [['eq', 'id', 'new-analysis']], values: undefined });
    expect(mocks.requests.some(request => request.action === 'update')).toBe(false);
  });
});
