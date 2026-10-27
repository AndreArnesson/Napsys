/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase's fluent query API is mocked with dynamic fixtures. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, parseISO, subDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { EconomySnapshotHistory } from './EconomySnapshotHistory';

const { supabaseMock, authMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    fixtures: {
      snapshots: [] as any[],
      portfolioSnapshots: [] as any[],
      portfolios: [] as any[],
      holdings: [] as any[],
      writes: [] as any[],
      calls: [] as any[],
    },
  },
  authMock: vi.fn(() => ({ user: { id: 'user-1' } })),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: authMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setupSupabaseMock() {
  supabaseMock.from.mockImplementation((table: string) => {
    const state: { operation: string; filters: Record<string, unknown>; values?: unknown } = {
      operation: 'select', filters: {},
    };
    const query: any = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: unknown) => { state.filters[column] = value; return query; },
      in: (column: string, value: unknown) => { state.filters[column] = value; return query; },
      upsert: (values: unknown, options?: unknown) => {
        state.operation = 'upsert';
        state.values = values;
        supabaseMock.fixtures.writes.push({ table, values, options });
        return query;
      },
      update: (values: unknown) => { state.operation = 'update'; state.values = values; return query; },
      delete: () => { state.operation = 'delete'; return query; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        supabaseMock.fixtures.calls.push({ table, operation: state.operation, filters: state.filters });
        let data: any[] = [];
        if (state.operation === 'select') {
          if (table === 'economy_snapshots') data = supabaseMock.fixtures.snapshots;
          if (table === 'portfolio_snapshots') {
            data = supabaseMock.fixtures.portfolioSnapshots.filter((snapshot: any) =>
              (state.filters.id === undefined || (state.filters.id as string[]).includes(snapshot.id))
              && (state.filters.snapshot_date === undefined || state.filters.snapshot_date === snapshot.snapshot_date),
            );
          }
          if (table === 'portfolios') {
            data = supabaseMock.fixtures.portfolios.filter((portfolio: any) =>
              state.filters.id === undefined || (state.filters.id as string[]).includes(portfolio.id),
            );
          }
          if (table === 'portfolio_holdings') {
            data = supabaseMock.fixtures.holdings.filter((holding: any) =>
              state.filters.snapshot_id === undefined || (state.filters.snapshot_id as string[]).includes(holding.snapshot_id),
            );
          }
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
}

const today = format(new Date(), 'yyyy-MM-dd');
const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const account = (entryDate: string) => ({
  id: `bank-${entryDate}`,
  category: 'bank_account',
  label: 'Nordea',
  amount: 100_000,
  entry_date: entryDate,
  created_at: `${entryDate}T12:00:00Z`,
});

function renderHistory(currentEntries: ReturnType<typeof account>[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage="sv">
        <EconomySnapshotHistory currentEntries={currentEntries} />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

function openSnapshot(date: string) {
  const label = format(parseISO(date), 'd MMM yyyy');
  const button = screen.getAllByRole('button').find(candidate => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Could not find saved snapshot ${label}. Buttons: ${screen.getAllByRole('button').map(candidate => candidate.textContent).join(' | ')}`);
  fireEvent.click(button);
}

describe('EconomySnapshotHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    supabaseMock.fixtures = { snapshots: [], portfolioSnapshots: [], portfolios: [], holdings: [], writes: [], calls: [] };
    setupSupabaseMock();
  });

  it('does not display a portfolio in history when its snapshot date differs', async () => {
    supabaseMock.fixtures.snapshots = [{
      id: 'economy-1', snapshot_date: today, note: null,
      entries: [{ category: 'bank_account', label: 'Nordea', amount: 100_000 }],
      portfolio_data: [{ portfolio_name: 'ISK', snapshot_id: 'portfolio-old', holdings: [{ company_name: 'Volvo', value_sek: 50_000 }] }],
    }];
    supabaseMock.fixtures.portfolioSnapshots = [{ id: 'portfolio-old', snapshot_date: yesterday }];
    renderHistory([account(today)]);

    await screen.findByText('Sparade uppdateringar');
    await waitFor(() => expect(supabaseMock.fixtures.calls.some(call => call.table === 'economy_snapshots')).toBe(true));
    openSnapshot(today);

    expect(await screen.findByText(/1 portfölj visas inte eftersom uppdateringsdatumet inte matchar ekonomibilden/)).toBeInTheDocument();
    expect(screen.queryByText('Portföljinnehav')).not.toBeInTheDocument();
    expect(screen.queryByText('Volvo')).not.toBeInTheDocument();
  });

  it('shows same-day holdings and includes their value in historical net worth', async () => {
    supabaseMock.fixtures.snapshots = [{
      id: 'economy-1', snapshot_date: today, note: null,
      entries: [{ category: 'bank_account', label: 'Nordea', amount: 100_000 }],
      portfolio_data: [{ portfolio_name: 'Långsiktig', snapshot_id: 'portfolio-today', holdings: [
        { company_name: 'Volvo', value_sek: 60_000, ticker: 'VOLV B', shares_count: 100 },
        { company_name: 'Investor', value_sek: 40_000, ticker: 'INVE B', shares_count: 50 },
      ] }],
    }];
    supabaseMock.fixtures.portfolioSnapshots = [{ id: 'portfolio-today', snapshot_date: today }];
    renderHistory([account(today)]);

    await screen.findByText('Sparade uppdateringar');
    await waitFor(() => expect(supabaseMock.fixtures.calls.some(call => call.table === 'economy_snapshots')).toBe(true));
    openSnapshot(today);
    expect(await screen.findByText(/200\s*000 kr/)).toBeInTheDocument();
    expect(screen.queryByText(/visas inte eftersom/)).not.toBeInTheDocument();
    const portfolioButton = screen.getAllByRole('button').find(button => button.textContent?.includes('Långsiktig'));
    expect(portfolioButton).toBeDefined();
    fireEvent.click(portfolioButton!);
    expect(await screen.findByText('Volvo')).toBeInTheDocument();
    expect(screen.getByText('Investor')).toBeInTheDocument();
  });

  it('saves portfolio holdings only when every latest economy balance has the selected date', async () => {
    supabaseMock.fixtures.portfolioSnapshots = [{ id: 'portfolio-today', portfolio_id: 'portfolio-1', snapshot_date: today }];
    supabaseMock.fixtures.portfolios = [{ id: 'portfolio-1', name: 'Långsiktig' }];
    supabaseMock.fixtures.holdings = [{ snapshot_id: 'portfolio-today', company_name: 'Volvo', ticker: 'VOLV B', shares_count: 100, value_sek: 60_000, conviction: 'high' }];
    const matchingView = renderHistory([account(today)]);

    fireEvent.click(await screen.findByRole('button', { name: 'Spara uppdatering' }));
    await waitFor(() => expect(supabaseMock.fixtures.writes).toHaveLength(1));
    const matchedWrite = supabaseMock.fixtures.writes[0].values;
    expect(matchedWrite.portfolio_data).toEqual([expect.objectContaining({
      portfolio_name: 'Långsiktig',
      snapshot_id: 'portfolio-today',
      snapshot_date: today,
      holdings: [expect.objectContaining({ company_name: 'Volvo', value_sek: 60_000 })],
    })]);
    expect(supabaseMock.fixtures.calls).toContainEqual(expect.objectContaining({ table: 'portfolio_snapshots', operation: 'select' }));
    matchingView.unmount();

    supabaseMock.fixtures.writes.length = 0;
    supabaseMock.fixtures.calls.length = 0;
    renderHistory([account(yesterday)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Spara uppdatering' }));
    await waitFor(() => expect(supabaseMock.fixtures.writes).toHaveLength(1));
    const mismatchedWrite = supabaseMock.fixtures.writes[0].values;
    expect(mismatchedWrite.portfolio_data).toEqual([]);
    expect(supabaseMock.fixtures.calls).not.toContainEqual(expect.objectContaining({ table: 'portfolio_snapshots', operation: 'select' }));
  });
});
