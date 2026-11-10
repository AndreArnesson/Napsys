import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import AnalysisEditor from './AnalysisEditor';

const mocks = vi.hoisted(() => ({
  update: vi.fn(), missingPrice: false, missingIncome: false,
  reads: [] as { table: string; filters: unknown[][] }[],
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }) => children }));
vi.mock('@/components/company/ShareCompanyDialog', () => ({ ShareCompanyDialog: () => null }));
vi.mock('@/components/analysis/HistoricalDataTable', () => ({ HistoricalDataTable: () => null }));
vi.mock('@/components/analysis/DebtSection', () => ({ DebtSection: () => null }));
vi.mock('@/components/analysis/AdjustmentsEditor', () => ({ AdjustmentsEditor: () => null }));
vi.mock('@/components/company/ImageUpload', () => ({ ImageUpload: () => null }));
vi.mock('@/components/analysis/ReportAnalyzer', () => ({ ReportAnalyzer: () => null }));
vi.mock('@/components/analysis/InvestmentHoldings', () => ({ InvestmentHoldings: () => null }));
vi.mock('@/components/analysis/AnalysisChatBubble', () => ({ AnalysisChatBubble: () => null }));
vi.mock('@/components/company/FileImportDialog', () => ({ FileImportDialog: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const filters: unknown[][] = [];
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push(['eq', key, value]); return query; },
    is: (key: string, value: unknown) => { filters.push(['is', key, value]); return query; },
    order: async () => {
      mocks.reads.push({ table, filters: [...filters] });
      const current = filters.some(filter => filter[0] === 'is' && filter[1] === 'analysis_id');
      return { error: null, data: table === 'income_statement'
        ? current ? [{ fiscal_year: 2025, revenue: 200, net_income: 20 }]
          : mocks.missingIncome ? [] : [{ fiscal_year: 2024, revenue: 100, net_income: 10 }]
        : table === 'balance_sheet' ? [{ fiscal_year: 2024, cash_equivalents: 5, long_term_debt: 10 }]
          : current ? [{ fiscal_year: 2025, quarter: 1, revenue: 50 }]
            : [{ fiscal_year: 2024, quarter: 4, revenue: 25, net_income: 2.5 }],
      };
    },
    single: async () => ({ error: null, data: table === 'companies'
      ? { id: 'company', user_id: 'owner', name: 'Example', current_price: 999, shares_outstanding: 999,
        reporting_currency: 'SEK', trading_currency: 'GBP' }
      : { id: 'analysis', company_id: 'company', user_id: 'owner', name: '2024 review',
        created_at: '2024-11-10T12:00:00Z', current_price: mocks.missingPrice ? null : 10,
        shares_outstanding: mocks.missingPrice ? null : 1_000_000,
        margin_of_safety: 35,
        visible_sections: { snapshot_complete: true, reporting_currency: 'SEK', trading_currency: 'SEK',
          calculation_settings: { targetPE: 12, qGrowthMode: 'yoy' } },
        projections: [
          { year: 2025, revenueGrowth: 10, netMargin: 10 },
          { year: 2026, revenue: 132, netMargin: 10 },
          { year: 2027, revenue: 150, netMargin: 10, mos: 35 },
        ],
      },
    }),
    update: (values: unknown) => {
      mocks.update(table, values);
      return { eq: async () => ({ data: null, error: null }) };
    },
  };
  return query;
} } }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><LanguageProvider defaultLanguage="en">
    <MemoryRouter initialEntries={['/company/company/analysis/analysis']}>
      <Routes><Route path="/company/:id/analysis/:analysisId" element={<AnalysisEditor />} /></Routes>
    </MemoryRouter>
  </LanguageProvider></QueryClientProvider>);
  return { ...view, client };
}
async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
}
function revenue() {
  const row = within(screen.getAllByRole('table')[0]).getByText('Omsättning (MSEK)').closest('tr')!;
  return Number((within(row).getAllByRole('textbox')[0] as HTMLInputElement).value);
}

describe('opening an old analysis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    localStorage.clear();
    mocks.update.mockClear(); mocks.reads = []; mocks.missingPrice = false; mocks.missingIncome = false;
  });
  afterEach(async () => { await act(async () => { cleanup(); }); vi.useRealTimers(); });

  it('loads the original years and snapshots, and never autosaves merely from opening or leaving', async () => {
    const view = mount();
    await settle();
    expect(screen.getByDisplayValue('2024 review')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^2025/ })).toHaveTextContent('Year 1');
    expect(screen.getByRole('columnheader', { name: /^2026/ })).toHaveTextContent('Year 2');
    expect(revenue()).toBeCloseTo(110);
    expect(screen.getByLabelText('Kurs (SEK)')).toHaveValue('10');
    expect(screen.queryByText('Kurs (GBP)')).not.toBeInTheDocument();
    for (const read of mocks.reads) expect(read.filters).toContainEqual(['eq', 'analysis_id', 'analysis']);
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    view.unmount();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('loads company-current actuals only for the separate comparison and leaves estimates untouched', async () => {
    mount(); await settle();
    fireEvent.click(screen.getByRole('switch', { name: 'Compare with actuals' }));
    await settle();
    expect(revenue()).toBeCloseTo(110);
    const comparison = screen.getByRole('heading', { name: 'Compare with actuals' }).closest<HTMLElement>('[class*="rounded"]')!;
    expect(within(comparison).getByText('110')).toBeInTheDocument();
    expect(within(comparison).getByText('200')).toBeInTheDocument();
    expect(mocks.reads.filter(read => read.filters.some(filter => filter[0] === 'is'))).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not substitute current price, shares, or income when original values are missing', async () => {
    mocks.missingPrice = true; mocks.missingIncome = true;
    mount(); await settle();
    expect(screen.getByText(/Parts of the original analysis data are missing/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('999')).not.toBeInTheDocument();
    expect(mocks.reads.some(read => read.filters.some(filter => filter[0] === 'is'))).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('autosaves explicit edits using the analysis year for its summary MOS', async () => {
    mount(); await settle();
    fireEvent.change(screen.getByDisplayValue('2024 review'), { target: { value: 'Edited 2024 review' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(mocks.update).toHaveBeenCalledWith('analyses', expect.objectContaining({
      name: 'Edited 2024 review', margin_of_safety: 35, current_price: 10, shares_outstanding: 1_000_000,
      visible_sections: expect.objectContaining({ reporting_currency: 'SEK', trading_currency: 'SEK',
        calculation_settings: { targetPE: 12, qGrowthMode: 'yoy' } }),
    }));
  });

  it('flushes a pending explicit edit when leaving before the autosave delay', async () => {
    const view = mount(); await settle();
    fireEvent.change(screen.getByDisplayValue('2024 review'), { target: { value: 'Saved on leaving' } });
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(mocks.update).toHaveBeenCalledWith('analyses', expect.objectContaining({ name: 'Saved on leaving' }));
  });

  it('does not mix actuals in a changed reporting currency into the old analysis', async () => {
    const { client } = mount(); await settle();
    await act(async () => { client.setQueryData(['company', 'company'], (old: any) => ({ ...old, reporting_currency: 'EUR' })); });
    fireEvent.click(screen.getByRole('switch', { name: 'Compare with actuals' }));
    await settle();
    expect(screen.getByText(/current company reporting currency differs/)).toBeInTheDocument();
    expect(mocks.reads.some(read => read.filters.some(filter => filter[0] === 'is'))).toBe(false);
    expect(revenue()).toBeCloseTo(110);
    expect(screen.getByLabelText('Kurs (SEK)')).toHaveValue('10');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
