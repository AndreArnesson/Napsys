import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { CompanySearch } from './CompanySearch';

const mocks = vi.hoisted(() => ({ search: vi.fn(), select: vi.fn(), submit: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/lib/borsdata', () => ({ searchBorsdataCompanies: mocks.search }));
const investorA = { name: 'Investor A', ticker: 'INVE A', country: 'SWE', urlName: 'investor-a', marketId: 1 };
const investorB = { name: 'Investor B', ticker: 'INVE B', country: 'SWE', urlName: 'investor', marketId: 1 };
const cheffelo = { name: 'Cheffelo', ticker: 'CHEF', country: 'SWE', urlName: 'lmk-group', marketId: 4 };

function mount(language: 'sv' | 'en' = 'sv') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><LanguageProvider defaultLanguage={language}>
    <form onSubmit={event => { event.preventDefault(); mocks.submit(); }}><CompanySearch onSelect={mocks.select} /></form>
  </LanguageProvider></QueryClientProvider>);
  return screen.getByRole('combobox');
}
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); mocks.search.mockResolvedValue([]); });
afterEach(cleanup);

describe('company name search', () => {
  it('debounces typing and lets the user choose the correct share class with the keyboard', async () => {
    mocks.search.mockResolvedValue([investorA, investorB]);
    const input = mount();
    fireEvent.change(input, { target: { value: 'I' } });
    expect(mocks.search).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Investor' } });
    expect(mocks.search).not.toHaveBeenCalled();
    expect(await screen.findByRole('option', { name: /Investor B/ })).toHaveTextContent('INVE B · SWE');
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith('Investor', expect.any(AbortSignal));
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Investor B/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(investorB);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ignores a late response after the user changes the company name', async () => {
    let finishOld: (results: typeof investorA[]) => void;
    mocks.search.mockImplementation(query => query === 'Investor' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve([cheffelo]));
    const input = mount();
    fireEvent.change(input, { target: { value: 'Investor' } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith('Investor', expect.any(AbortSignal)));
    fireEvent.change(input, { target: { value: 'Cheffelo' } });
    expect(await screen.findByRole('option', { name: /Cheffelo/ })).toBeInTheDocument();
    await act(async () => { finishOld([investorA]); });
    expect(screen.queryByRole('option', { name: /Investor/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Cheffelo/ }));
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(cheffelo);
  });

  it('offers retry after failure and recovers without submitting the creation form', async () => {
    mocks.search.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([cheffelo]);
    const input = mount('en');
    fireEvent.change(input, { target: { value: 'Cheffelo' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not search Börsdata right now.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(await screen.findByRole('option', { name: /Cheffelo/ }));
    expect(mocks.select).toHaveBeenCalledWith(cheffelo);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('offers manual entry when no company matches', async () => {
    fireEvent.change(mount(), { target: { value: 'Unlisted company' } });
    expect(await screen.findByText(/Inga träffar/)).toHaveTextContent('fyll i uppgifterna manuellt');
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
