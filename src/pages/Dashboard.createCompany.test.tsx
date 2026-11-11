import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import Dashboard from './Dashboard';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), invoke: vi.fn(), error: null as Error | null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }) => children }));
vi.mock('@/components/watchlist/WatchlistSection', () => ({ WatchlistSection: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: () => {
    const query = {
      select: () => query, eq: () => query, neq: () => query, order: () => query, limit: () => query,
      insert: (values: unknown) => { mocks.insert(values); return query; },
      update: () => query,
      single: async () => ({ data: mocks.error ? null : { id: 'new-company' }, error: mocks.error }),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return query;
  },
} }));

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); mocks.error = null;
  mocks.invoke.mockResolvedValue({ data: { price: 42 }, error: null });
});
afterEach(cleanup);

function openForm(language: 'en' | 'sv' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><LanguageProvider defaultLanguage={language}>
    <MemoryRouter><Dashboard /></MemoryRouter>
  </LanguageProvider></QueryClientProvider>);
  fireEvent.click(screen.getAllByRole('button', { name: language === 'en' ? 'Add Company' : 'Lägg till bolag' })[0]);
  return within(screen.getByRole('dialog'));
}
function choose(label: RegExp, option: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('creating a company with explicit market settings', () => {
  it('requires an explicit choice for each currency and the exchange, including direct form submission', () => {
    const form = openForm();
    fireEvent.change(form.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Example' } });
    const add = form.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    expect(form.getAllByText('Choose currency')).toHaveLength(2);
    expect(form.getByText('Choose exchange')).toBeInTheDocument();
    fireEvent.submit(add.closest('form')!);
    expect(mocks.insert).not.toHaveBeenCalled();
    choose(/Reporting Currency/, 'EUR');
    expect(add).toBeDisabled();
    choose(/Trading Currency/, 'SEK');
    expect(add).toBeDisabled();
    choose(/^Exchange/, 'Stockholm (.ST)');
    expect(add).toBeEnabled();
  });

  it('saves different currencies and fetches the price from the selected exchange', async () => {
    const form = openForm();
    fireEvent.change(form.getByRole('textbox', { name: /^Name/ }), { target: { value: '  Example  ' } });
    fireEvent.change(form.getByRole('textbox', { name: 'Ticker' }), { target: { value: 'aapl' } });
    choose(/Reporting Currency/, 'EUR');
    choose(/Trading Currency/, 'USD');
    choose(/^Exchange/, 'Nasdaq (USA)');
    fireEvent.click(form.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('fetch-stock-price', {
      body: { ticker: 'AAPL', exchange: 'nasdaq' },
    }));
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
      user_id: 'owner', name: 'Example', ticker: 'AAPL', reporting_currency: 'EUR', trading_currency: 'USD', exchange: 'nasdaq',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Company' })[0]);
    const next = within(screen.getByRole('dialog'));
    expect(next.getAllByText('Choose currency')).toHaveLength(2);
    expect(next.getByText('Choose exchange')).toBeInTheDocument();
    expect(next.getByRole('textbox', { name: /^Name/ })).toHaveValue('');
    expect(next.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('allows an optional ticker without making a price request', async () => {
    const form = openForm();
    fireEvent.change(form.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Canadian company' } });
    choose(/Reporting Currency/, 'CAD');
    choose(/Trading Currency/, 'CAD');
    choose(/^Exchange/, 'Toronto (.TO)');
    fireEvent.click(form.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ ticker: null, reporting_currency: 'CAD', trading_currency: 'CAD', exchange: 'toronto' }));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('retains the selected values after a failed save so the user can retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.error = new Error('Save failed');
    const form = openForm();
    fireEvent.change(form.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Retry company' } });
    choose(/Reporting Currency/, 'EUR');
    choose(/Trading Currency/, 'SEK');
    choose(/^Exchange/, 'Stockholm (.ST)');
    fireEvent.click(form.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(form.getByRole('button', { name: 'Add' })).toBeEnabled());
    expect(form.getByRole('textbox', { name: /^Name/ })).toHaveValue('Retry company');
    expect(form.getByRole('combobox', { name: /Reporting Currency/ })).toHaveTextContent('EUR');
    expect(form.getByRole('combobox', { name: /Trading Currency/ })).toHaveTextContent('SEK');
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.error = null;
    fireEvent.click(form.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('shows the required market fields in Swedish', () => {
    const form = openForm('sv');
    expect(form.getByRole('combobox', { name: /Rapportvaluta/ })).toHaveAttribute('aria-required', 'true');
    expect(form.getByRole('combobox', { name: /Handelsvaluta/ })).toHaveAttribute('aria-required', 'true');
    expect(form.getByRole('combobox', { name: /^Börs/ })).toHaveAttribute('aria-required', 'true');
  });
});
