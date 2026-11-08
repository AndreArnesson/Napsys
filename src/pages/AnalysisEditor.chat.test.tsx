import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import type { AnalysisChatBubbleProps } from '@/components/analysis/AnalysisChatBubble';
import AnalysisEditor from './AnalysisEditor';

const mocks = vi.hoisted(() => ({
  userId: 'owner',
  locked: false,
  missingAnalysis: false,
  update: vi.fn(),
  bubble: vi.fn(),
  openChat: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }) => children }));
vi.mock('@/components/company/ShareCompanyDialog', () => ({ ShareCompanyDialog: () => null }));
vi.mock('@/components/analysis/HistoricalDataTable', () => ({ HistoricalDataTable: () => null }));
vi.mock('@/components/analysis/DebtSection', () => ({ DebtSection: () => null }));
vi.mock('@/components/analysis/AdjustmentsEditor', () => ({ AdjustmentsEditor: () => null }));
vi.mock('@/components/company/ImageUpload', () => ({ ImageUpload: () => null }));
vi.mock('@/components/analysis/ReportAnalyzer', () => ({ ReportAnalyzer: () => null }));
vi.mock('@/components/analysis/InvestmentHoldings', () => ({ InvestmentHoldings: () => null }));
vi.mock('@/components/analysis/NapkinCalculation', () => ({ NapkinCalculation: () => null }));
vi.mock('@/components/company/FileImportDialog', () => ({ FileImportDialog: () => null }));
vi.mock('@/components/analysis/SpreadsheetAnalysis', () => ({
  SpreadsheetAnalysis: ({ notes, onNotesChange, projections, onProjectionsChange, onValuationContext, readOnly }) => <div>
    <label>Analysis notes<textarea value={notes} readOnly={readOnly} onChange={event => onNotesChange(event.target.value)} /></label>
    <label>Projected revenue<input type="number" value={projections[0]?.revenue ?? ''} disabled={readOnly}
      onChange={event => onProjectionsChange([{ ...projections[0], revenue: Number(event.target.value) }])} /></label>
    <button type="button" onClick={() => onValuationContext({ mode: 'yearly', targetPE: 12, currentPrice: 15,
      sharesOutstanding: 1000, priceFxRate: 2, reportingCurrency: 'EUR', tradingCurrency: 'SEK',
      rows: [{ year: 2027, mos: 25, estimatedPrice: 18.75 }] })}>Calculate table</button>
  </div>,
}));
vi.mock('@/components/analysis/AnalysisChatBubble', () => ({
  AnalysisChatBubble: (props: AnalysisChatBubbleProps) => {
    mocks.bubble(props);
    return <button type="button" onClick={() => mocks.openChat(props)}>Open analysis chat</button>;
  },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: async () => ({ data: [], error: null }),
        single: async () => ({ data: table === 'companies' ? {
          id: 'company', user_id: 'owner', name: 'Example', reporting_currency: 'SEK', trading_currency: 'SEK',
        } : mocks.missingAnalysis ? null : {
          id: 'analysis', company_id: 'company', user_id: 'owner', name: 'Stored analysis',
          created_at: '2026-11-08', locked: mocks.locked, summary_comment: 'Stored notes',
          current_price: 15, shares_outstanding: 1000, price_fx_rate: 2, employees: 100,
          projections: [{ year: 2028, revenue: 100, ebit: 20 }], adjustments: [],
          visible_sections: { debt: false, images: false, napkin_mode: false, napkin_assumptions: [{ year: 2028, growthRate: 10 }] },
        }, error: null }),
        update: (values: unknown) => {
          mocks.update(table, values);
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
      return query;
    },
  },
}));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><LanguageProvider defaultLanguage="en">
    <MemoryRouter initialEntries={['/company/company/analysis/analysis']}>
      <Routes><Route path="/company/:id/analysis/:analysisId" element={<AnalysisEditor />} /></Routes>
    </MemoryRouter>
  </LanguageProvider></QueryClientProvider>);
  return { ...result, client };
}

async function finishLoading() {
  // Let read queries and state initialization settle, staying before the editor's normal autosave debounce.
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}

describe('AnalysisEditor chat context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    mocks.userId = 'owner';
    mocks.locked = false;
    mocks.missingAnalysis = false;
  });
  afterEach(async () => {
    // Editable owners retain the existing autosave-on-leave behavior.
    await act(async () => { cleanup(); await Promise.resolve(); });
    vi.useRealTimers();
  });

  it('passes current edited notes and projections to the active analysis chat without forcing an immediate save', async () => {
    const { client } = mount();
    await finishLoading();
    expect(mocks.bubble.mock.lastCall?.[0]).toMatchObject({
      companyId: 'company', analysisId: 'analysis', analysisName: 'Stored analysis',
      draft: {
        summary_comment: 'Stored notes', projections: [{ year: 2028, revenue: 100, ebit: 20 }],
        current_price: 15, shares_outstanding: 1000, price_fx_rate: 2, employees: 100,
        napkin_mode: false, napkin_assumptions: [{ year: 2028, growthRate: 10 }],
      },
    });

    fireEvent.change(screen.getByLabelText('Analysis notes'), { target: { value: 'Unsaved margin concern' } });
    fireEvent.change(screen.getByLabelText('Projected revenue'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open analysis chat' }));

    expect(mocks.openChat).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      companyId: 'company', analysisId: 'analysis',
      draft: expect.objectContaining({ summary_comment: 'Unsaved margin concern', projections: [{ year: 2028, revenue: 250, ebit: 20 }] }),
    }));
    // The editor, rather than the persisted query record, is supplying the chat context.
    expect(client.getQueryData<{ summary_comment: string }>(['analysis', 'analysis'])?.summary_comment).toBe('Stored notes');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    { state: 'locked owner', userId: 'owner', locked: true },
    { state: 'shared recipient', userId: 'recipient', locked: false },
  ])('uses saved context only for a $state', async ({ userId, locked }) => {
    mocks.userId = userId;
    mocks.locked = locked;
    mount();
    await finishLoading();

    expect(screen.getByLabelText('Analysis notes')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Projected revenue')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open analysis chat' }));
    const props = mocks.openChat.mock.lastCall?.[0] as AnalysisChatBubbleProps;
    expect(props).toMatchObject({ companyId: 'company', analysisId: 'analysis', analysisName: 'Stored analysis' });
    expect(props.draft).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate table' }));
    expect(props.getValuationContext?.()).toMatchObject({ rows: [{ year: 2027, mos: 25, estimatedPrice: 18.75 }] });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not offer chat when the requested analysis is missing', async () => {
    mocks.missingAnalysis = true;
    mount();
    await finishLoading();
    expect(screen.getByText('Analysis not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open analysis chat' })).not.toBeInTheDocument();
    expect(mocks.bubble).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
