import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import News from './News';

const mocks = vi.hoisted(() => ({ companies: vi.fn(), page: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user' }, loading: false }) }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }) => children }));
vi.mock('@/lib/newsFeed', async original => ({
  ...await original<typeof import('@/lib/newsFeed')>(), loadMonitoredCompanies: mocks.companies, loadNewsPage: mocks.page,
}));
const company = { id: 'hacksaw', name: 'Hacksaw', ticker: 'HACK' };
const article = { id: 'article', company_id: company.id, companies: company, title: 'New quarterly report',
  source: 'MFN', url: 'https://mfn.se/report', summary: 'Revenue increased.', published_at: '2026-11-08T09:00:00Z', fetched_at: '2026-11-08T10:00:00Z' };
function mount(path = '/news') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><LanguageProvider defaultLanguage="en">
    <MemoryRouter initialEntries={[path]}><News /></MemoryRouter>
  </LanguageProvider></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.companies.mockResolvedValue([company]); mocks.page.mockResolvedValue([article]);
});
afterEach(cleanup);
describe('monitored company news', () => {
  it('shows the combined feed and keeps unmonitored cached entries out of the view', async () => {
    mocks.page.mockResolvedValue([article, { ...article, id: 'hidden', company_id: 'disabled', title: 'Disabled company news' }]);
    mount();
    expect(await screen.findByRole('link', { name: 'New quarterly report' })).toHaveAttribute('href', article.url);
    expect(screen.getByText('Revenue increased.')).toBeInTheDocument();
    expect(screen.queryByText('Disabled company news')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hacksaw' })).toHaveAttribute('href', '/company/hacksaw?tab=assistant');
    expect(mocks.page).toHaveBeenCalledWith(null, 0, expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'hacksaw' } });
    await waitFor(() => expect(mocks.page).toHaveBeenCalledWith('hacksaw', 0, expect.any(AbortSignal)));
  });
  it('opens latest X search links for monitored companies without importing posts', async () => {
    mount('/news?tab=x');
    const link = await screen.findByRole('link', { name: 'Search latest posts on X' });
    const url = new URL(link.getAttribute('href')!);
    expect(url.origin).toBe('https://x.com');
    expect(url.searchParams.get('q')).toBe('("Hacksaw" OR $HACK)');
    expect(url.searchParams.get('f')).toBe('live');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/not automatically imported or summarized/)).toBeInTheDocument();
    expect(mocks.page).not.toHaveBeenCalled();
  });
  it('offers monitoring setup and does not fetch articles when no companies are monitored', async () => {
    mocks.companies.mockResolvedValue([]);
    mount();
    expect(await screen.findByText('No companies have news monitoring enabled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open my companies' })).toHaveAttribute('href', '/');
    expect(mocks.page).not.toHaveBeenCalled();
  });
  it('reports a read error without presenting an empty feed as a successful result', async () => {
    mocks.page.mockRejectedValue(new Error('network unavailable'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load news');
    expect(screen.queryByText('No news has been fetched for this selection yet.')).not.toBeInTheDocument();
  });
  it('loads further pages and keeps previously displayed articles', async () => {
    mocks.page.mockImplementation(async (_company, page) => page === 0
      ? Array.from({ length: 40 }, (_, id) => ({ ...article, id: String(id), title: `Headline ${id}` }))
      : [{ ...article, id: 'next', title: 'An older headline' }]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('An older headline')).toBeInTheDocument();
    expect(screen.getByText('Headline 0')).toBeInTheDocument();
    expect(mocks.page).toHaveBeenCalledWith(null, 1, expect.any(AbortSignal));
  });
});
