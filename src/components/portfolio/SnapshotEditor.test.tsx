/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase's fluent query API is mocked with dynamic fixtures. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { SnapshotEditor } from './SnapshotEditor';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    fixtures: { snapshots: [] as any[], holdings: [] as any[], inserts: [] as any[] },
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setupSupabaseMock() {
  supabaseMock.from.mockImplementation((table: string) => {
    const state: { operation: string; filters: Record<string, unknown>; values?: any } = { operation: 'select', filters: {} };
    const query: any = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: unknown) => { state.filters[column] = value; return query; },
      insert: (values: any) => {
        state.operation = 'insert';
        state.values = values;
        supabaseMock.fixtures.inserts.push({ table, values });
        if (table === 'portfolio_snapshots') {
          supabaseMock.fixtures.snapshots.push({ id: 'snapshot-1', ...values });
        }
        if (table === 'portfolio_holdings') supabaseMock.fixtures.holdings.push(...values);
        return query;
      },
      delete: () => { state.operation = 'delete'; return query; },
      single: async () => ({ data: { id: 'snapshot-1', ...state.values }, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        let data: any[] = [];
        if (state.operation === 'select') {
          if (table === 'portfolio_snapshots') {
            data = supabaseMock.fixtures.snapshots.filter((snapshot: any) =>
              state.filters.portfolio_id === undefined || snapshot.portfolio_id === state.filters.portfolio_id,
            );
          }
          if (table === 'portfolio_holdings') {
            data = supabaseMock.fixtures.holdings.filter((holding: any) =>
              state.filters.snapshot_id === undefined || holding.snapshot_id === state.filters.snapshot_id,
            );
          }
        }
        if (state.operation === 'delete' && table === 'portfolio_holdings') {
          supabaseMock.fixtures.holdings = supabaseMock.fixtures.holdings.filter(
            (holding: any) => holding.snapshot_id !== state.filters.snapshot_id,
          );
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
}

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage="en">
        <SnapshotEditor portfolioId="portfolio-1" portfolioName="Long term" />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe('SnapshotEditor portfolio update workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    supabaseMock.fixtures = { snapshots: [], holdings: [], inserts: [] };
    setupSupabaseMock();
  });

  it('creates a dated update and saves the entered holdings to that snapshot', async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'New portfolio update' }));
    fireEvent.change(screen.getByPlaceholderText('Overall comment about the portfolio...'), {
      target: { value: 'October review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('button', { name: 'Add holding' });
    expect(supabaseMock.fixtures.inserts[0]).toEqual({
      table: 'portfolio_snapshots',
      values: expect.objectContaining({ portfolio_id: 'portfolio-1', comment: 'October review' }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add holding' }));
    const holdingRow = screen.getAllByRole('row')[1];
    const fields = within(holdingRow).getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(fields[0], { target: { value: 'Volvo' } });
    fireEvent.change(fields[1], { target: { value: 'VOLV B' } });
    fireEvent.change(fields[2], { target: { value: '40' } });
    fireEvent.change(fields[3], { target: { value: '60000' } });
    fireEvent.change(fields[4], { target: { value: '300' } });
    fireEvent.change(fields[5], { target: { value: '200' } });

    const editorSave = screen.getAllByRole('button', { name: 'Save' }).at(-1)!;
    fireEvent.click(editorSave);

    await waitFor(() => expect(supabaseMock.fixtures.inserts.some(insert => insert.table === 'portfolio_holdings')).toBe(true));
    const savedHolding = supabaseMock.fixtures.inserts.find(insert => insert.table === 'portfolio_holdings').values[0];
    expect(savedHolding).toEqual(expect.objectContaining({
      snapshot_id: 'snapshot-1',
      company_name: 'Volvo',
      ticker: 'VOLV B',
      weight_percent: 40,
      value_sek: 60_000,
      price: 300,
      shares_count: 200,
    }));
  });
});
