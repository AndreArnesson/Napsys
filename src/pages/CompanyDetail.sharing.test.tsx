import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import CompanyDetail from './CompanyDetail';

const mocks = vi.hoisted(() => ({ write: vi.fn(), invoke: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'recipient' } }) }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }) => children }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, is: () => query,
      order: async () => ({ data: table === 'analyses' ? [
        { id: 'first', name: 'First Avtech analysis', created_at: '2026-11-05T12:00:00Z' },
        { id: 'second', name: 'Second Avtech analysis', created_at: '2026-11-06T12:00:00Z' },
      ] : [], error: null }),
      single: async () => ({ data: {
        id: 'avtech', user_id: 'owner', name: 'Avtech', ticker: 'AVTECH', company_type: 'stock',
        reporting_currency: 'SEK', trading_currency: 'SEK', description: 'Shared company description',
        moats: 'Shared company moats', management: { name: 'Company CEO' }, images: [],
      }, error: null }),
      update: mocks.write, insert: mocks.write, delete: mocks.write, upsert: mocks.write,
    };
    return query;
  },
} }));

afterEach(cleanup);

it('opens the full company card read only and lets the recipient browse every analysis without saving drafts', async () => {
  localStorage.clear(); mocks.write.mockClear(); mocks.invoke.mockClear();
  mocks.invoke.mockResolvedValue({ data: { match: null, candidates: [] }, error: null });
  localStorage.setItem('company-draft-avtech', JSON.stringify({ description: 'Private local draft' }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><LanguageProvider defaultLanguage="en">
    <MemoryRouter initialEntries={['/company/avtech']}>
      <Routes><Route path="/company/:id" element={<CompanyDetail />} /></Routes>
    </MemoryRouter>
  </LanguageProvider></QueryClientProvider>);
  expect(await screen.findByRole('heading', { name: 'Avtech', level: 1 })).toBeInTheDocument();
  expect(await screen.findByText('Shared company description')).toBeInTheDocument();
  expect(screen.queryByText('Private local draft')).not.toBeInTheDocument();
  expect(screen.getByText('Shared with you – read only')).toBeInTheDocument();
  expect(screen.getByDisplayValue('AVTECH')).toBeDisabled();
  expect(screen.getByDisplayValue('Company CEO')).toBeDisabled();
  fireEvent.change(screen.getByDisplayValue('Company CEO'), { target: { value: 'Changed' } });
  expect(screen.getByDisplayValue('Company CEO')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  for (const editor of view.container.querySelectorAll('[contenteditable]')) expect(editor).toHaveAttribute('contenteditable', 'false');

  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Analysis' }), { button: 0, ctrlKey: false });
  const analyses = screen.getByRole('tabpanel');
  expect(within(analyses).getByRole('link', { name: /First Avtech analysis/ })).toHaveAttribute('href', '/company/avtech/analysis/first');
  expect(within(analyses).getByRole('link', { name: /Second Avtech analysis/ })).toHaveAttribute('href', '/company/avtech/analysis/second');
  expect(within(analyses).queryByRole('button')).not.toBeInTheDocument();
  view.unmount();
  expect(mocks.write).not.toHaveBeenCalled();
  // Resolving the external link is read-only; no write or import function runs.
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('borsdata-link', {
    body: { companyId: 'avtech' }, signal: expect.any(AbortSignal),
  });
});
