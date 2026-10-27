/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase's fluent query API is mocked with dynamic fixtures. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { EconomyOverview } from './EconomyOverview';

const { supabaseMock, authMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    fixtures: { entries: [] as any[], portfolios: [] as any[], snapshots: [] as any[], holdings: [] as any[], mutations: [] as any[] },
  },
  authMock: vi.fn(() => ({ user: { id: 'user-1' } })),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: authMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setupSupabaseMock() {
  supabaseMock.from.mockImplementation((table: string) => {
    const state: { operation: string; filters: Record<string, unknown>; in: Record<string, unknown>; lte: Record<string, unknown>; values: unknown } = {
      operation: 'select', filters: {}, in: {}, lte: {}, values: undefined,
    };
    const query: any = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: unknown) => { state.filters[column] = value; return query; },
      in: (column: string, value: unknown) => { state.in[column] = value; return query; },
      lte: (column: string, value: unknown) => { state.lte[column] = value; return query; },
      insert: (values: unknown) => { state.operation = 'insert'; state.values = values; supabaseMock.fixtures.mutations.push({ table, operation: 'insert', values }); return query; },
      update: (values: unknown) => { state.operation = 'update'; state.values = values; supabaseMock.fixtures.mutations.push({ table, operation: 'update', values }); return query; },
      delete: () => { state.operation = 'delete'; return query; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        let data: unknown[] = [];
        if (state.operation === 'select') {
          if (table === 'economy_entries') data = supabaseMock.fixtures.entries;
          if (table === 'portfolios') data = supabaseMock.fixtures.portfolios;
          if (table === 'portfolio_snapshots') {
            const portfolioIds = state.in.portfolio_id as string[] | undefined;
            const dateLimit = state.lte.snapshot_date as string | undefined;
            data = supabaseMock.fixtures.snapshots.filter((snapshot: any) =>
              (!portfolioIds || portfolioIds.includes(snapshot.portfolio_id)) && (!dateLimit || snapshot.snapshot_date <= dateLimit),
            );
          }
          if (table === 'portfolio_holdings') {
            const snapshotIds = state.in.snapshot_id as string[] | undefined;
            data = supabaseMock.fixtures.holdings.filter((holding: any) => !snapshotIds || snapshotIds.includes(holding.snapshot_id));
          }
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
}

function renderEconomy() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage="sv"><EconomyOverview /></LanguageProvider>
    </QueryClientProvider>,
  );
}

function configureSnapshotDate(snapshotDate: string) {
  const today = format(new Date(), 'yyyy-MM-dd');
  supabaseMock.fixtures.entries = [
    { id: 'bank-1', user_id: 'user-1', category: 'bank_account', label: 'Nordea', amount: 100_000, entry_date: today, created_at: `${today}T10:00:00Z` },
  ];
  supabaseMock.fixtures.portfolios = [{ id: 'portfolio-1', name: 'Långsiktig', user_id: 'user-1' }];
  supabaseMock.fixtures.snapshots = [{ id: 'snapshot-1', portfolio_id: 'portfolio-1', snapshot_date: snapshotDate, created_at: `${snapshotDate}T10:00:00Z` }];
  supabaseMock.fixtures.holdings = [{ snapshot_id: 'snapshot-1', value_sek: 50_000 }];
}

function getSummaryValue(label: string) {
  const labelElement = screen.getByText(label);
  const card = labelElement.closest('.rounded-lg');
  return card?.querySelector('p.text-2xl')?.textContent ?? '';
}

describe('EconomyOverview workflows', () => {
  beforeEach(() => {
    localStorage.clear();
    supabaseMock.fixtures = { entries: [], portfolios: [], snapshots: [], holdings: [], mutations: [] };
    setupSupabaseMock();
  });

  it('includes a portfolio in net worth only when its latest snapshot matches the economy update date', async () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    configureSnapshotDate(yesterday);
    renderEconomy();

    await screen.findByText('Nettovärde');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ny uppdatering' })).toBeEnabled());
    expect(screen.getByText(/portföljer räknas bara med vid samma uppdateringsdatum/)).toBeInTheDocument();
    expect(getSummaryValue('Portföljvärde')).toContain('50');
    expect(getSummaryValue('Nettovärde')).toContain('100');
  });

  it('adds a same-day portfolio snapshot to total assets and net worth exactly once', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    configureSnapshotDate(today);
    renderEconomy();

    await screen.findByText('Nettovärde');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ny uppdatering' })).toBeEnabled());
    expect(screen.getByText(/inkl\. 1 portföljer uppdaterade samma dag/)).toBeInTheDocument();
    expect(getSummaryValue('Nettovärde')).toContain('150');
    expect(getSummaryValue('Tillgångar inkl. portföljer samma dag')).toContain('150');
  });

  it('updates saved balances in one dated batch and stores debts as negative values', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    supabaseMock.fixtures.entries = [
      { id: 'debt-1', user_id: 'user-1', category: 'debt', label: 'Bolån', amount: -400_000, entry_date: today, created_at: `${today}T12:00:00Z` },
      { id: 'bank-1', user_id: 'user-1', category: 'bank_account', label: 'Nordea', amount: 100_000, entry_date: today, created_at: `${today}T11:00:00Z` },
    ];
    renderEconomy();

    await screen.findByText('Nettovärde');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ny uppdatering' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Ny uppdatering' }));
    const amountInputs = await screen.findAllByLabelText('Belopp (kr)');
    expect((amountInputs[0] as HTMLInputElement).value).toBe('100000');
    expect((amountInputs[1] as HTMLInputElement).value).toBe('400000');

    fireEvent.change(amountInputs[0], { target: { value: '125000' } });
    fireEvent.change(amountInputs[1], { target: { value: '450000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara saldon' }));

    await waitFor(() => expect(supabaseMock.fixtures.mutations).toHaveLength(2));
    expect(supabaseMock.fixtures.mutations.map((mutation: any) => mutation.values)).toEqual([
      expect.objectContaining({ user_id: 'user-1', category: 'bank_account', label: 'Nordea', amount: 125_000, entry_date: today }),
      expect.objectContaining({ user_id: 'user-1', category: 'debt', label: 'Bolån', amount: -450_000, entry_date: today }),
    ]);
  });

  it('blocks a balance update with duplicate account names', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    supabaseMock.fixtures.entries = [
      { id: 'bank-1', user_id: 'user-1', category: 'bank_account', label: 'Nordea', amount: 100_000, entry_date: today, created_at: `${today}T11:00:00Z` },
    ];
    renderEconomy();

    await screen.findByText('Nettovärde');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ny uppdatering' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Ny uppdatering' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lägg till bank eller konto' }));
    const labels = await screen.findAllByLabelText('Bank eller konto');
    const amounts = await screen.findAllByLabelText('Belopp (kr)');
    fireEvent.change(labels[1], { target: { value: 'nordea' } });
    fireEvent.change(amounts[1], { target: { value: '500' } });

    expect(screen.getByRole('button', { name: 'Spara saldon' })).toBeDisabled();
    expect(supabaseMock.fixtures.mutations).toHaveLength(0);
  });
});
