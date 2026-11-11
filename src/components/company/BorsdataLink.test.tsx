import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { BorsdataLink } from './BorsdataLink';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/lib/borsdata', async original => ({ ...await original<typeof import('@/lib/borsdata')>(), loadBorsdataLink: mocks.load }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const cheffelo = { name: 'Cheffelo', ticker: 'CHEF', country: 'SWE', urlName: 'lmk-group', marketId: 4 };
const warehouse = { name: 'The Chefs Warehouse Inc', ticker: 'CHEF', country: 'USA', urlName: 'chefs-warehouse', marketId: 33 };

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><LanguageProvider defaultLanguage="sv">
    <BorsdataLink companyId="company-1" name="Cheffelo" ticker="CHEF" />
  </LanguageProvider></QueryClientProvider>);
  return client;
}

beforeEach(() => { localStorage.clear(); mocks.load.mockReset(); });
afterEach(cleanup);

describe('automatic Börsdata link', () => {
  it('waits for the real result and opens the returned legacy URL', async () => {
    mocks.load.mockResolvedValue({ match: cheffelo, candidates: [cheffelo] });
    mount();
    expect(screen.queryByRole('link', { name: 'Börsdata' })).not.toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Börsdata' });
    expect(link).toHaveAttribute('href', 'https://borsdata.se/terminal/se/lmk-group/export');
    expect(link).toHaveAttribute('target', '_blank');
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith('company-1', expect.any(AbortSignal));
  });

  it('offers a choice for ambiguous tickers and remembers the selected result in the session', async () => {
    mocks.load.mockResolvedValue({ match: null, candidates: [cheffelo, warehouse] });
    const client = mount();
    await screen.findByRole('button', { name: 'Börsdata' });
    // The initial button is disabled until its lookup finishes.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Börsdata' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Börsdata' }));
    const choice = await screen.findByRole('link', { name: /Cheffelo CHEF · SWE/ });
    expect(screen.getByRole('link', { name: /The Chefs Warehouse Inc CHEF · USA/ })).toBeInTheDocument();
    fireEvent.click(choice);
    expect(await screen.findByRole('link', { name: 'Börsdata' })).toHaveAttribute('href', 'https://borsdata.se/terminal/se/lmk-group/export');
    expect(client.getQueryData(['borsdata-link', 'user-1', 'company-1', 'Cheffelo', 'CHEF', undefined])).toMatchObject({ match: cheffelo });
  });

  it('shows a retry and terminal fallback instead of a fabricated link when the search fails', async () => {
    mocks.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ match: cheffelo, candidates: [cheffelo] });
    mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Börsdata' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Börsdata' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kunde inte söka hos Börsdata just nu.');
    expect(screen.getByRole('link', { name: 'Öppna Börsdata' })).toHaveAttribute('href', 'https://borsdata.se/terminal');
    fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }));
    fireEvent.click(await screen.findByRole('link', { name: /Cheffelo CHEF · SWE/ }));
    expect(await screen.findByRole('link', { name: 'Börsdata' })).toHaveAttribute('href', 'https://borsdata.se/terminal/se/lmk-group/export');
  });
});
