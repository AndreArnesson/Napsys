import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import AnalysisEditor from './AnalysisEditor';

const mocks = vi.hoisted(() => ({ update: vi.fn(), spreadsheet: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'recipient' } }) }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }) => children }));
vi.mock('@/components/analysis/HistoricalDataTable', () => ({ HistoricalDataTable: () => null }));
vi.mock('@/components/analysis/SpreadsheetAnalysis', () => ({ SpreadsheetAnalysis: (props) => { mocks.spreadsheet(props); return null; } }));
vi.mock('@/components/analysis/DebtSection', () => ({ DebtSection: () => null }));
vi.mock('@/components/analysis/AdjustmentsEditor', () => ({ AdjustmentsEditor: () => null }));
vi.mock('@/components/company/ImageUpload', () => ({ ImageUpload: () => null }));
vi.mock('@/components/analysis/ReportAnalyzer', () => ({ ReportAnalyzer: () => null }));
vi.mock('@/components/analysis/InvestmentHoldings', () => ({ InvestmentHoldings: () => null }));
vi.mock('@/components/analysis/NapkinCalculation', () => ({ NapkinCalculation: () => null }));
vi.mock('@/components/company/FileImportDialog', () => ({ FileImportDialog: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: async () => ({ data: [], error: null }),
        single: async () => ({ data: table === 'companies'
          ? { id: 'company', user_id: 'owner', name: 'Example', reporting_currency: 'SEK', trading_currency: 'SEK' }
          : { id: 'analysis', company_id: 'company', user_id: 'owner', name: 'Shared analysis', created_at: '2026-11-05', projections: [], visible_sections: {} }, error: null }),
        update: mocks.update,
      };
      return query;
    },
  },
}));

afterEach(cleanup);

describe('shared analysis reader', () => {
  it('disables editing and never autosaves, including when leaving the analysis', async () => {
    localStorage.clear();
    mocks.update.mockClear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={queryClient}><LanguageProvider defaultLanguage="en">
      <MemoryRouter initialEntries={['/company/company/analysis/analysis']}>
        <Routes><Route path="/company/:id/analysis/:analysisId" element={<AnalysisEditor />} /></Routes>
      </MemoryRouter>
    </LanguageProvider></QueryClientProvider>);

    expect(await screen.findByText('Shared with you – read only')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Shared analysis')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Analysis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lås' })).not.toBeInTheDocument();
    expect(mocks.spreadsheet.mock.lastCall?.[0]).toMatchObject({ readOnly: true });

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1600)); });
    view.unmount();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
