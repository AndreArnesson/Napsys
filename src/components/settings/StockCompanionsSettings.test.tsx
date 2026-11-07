import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import type { StockCompanion } from '@/hooks/useStockCompanions';
import { StockCompanionsSettings } from './StockCompanionsSettings';

const mocks = vi.hoisted(() => ({
  friends: [] as StockCompanion[],
  incoming: [] as { id: string; name: string; user_id: string; analyses: { id: string; name: string; created_at: string }[] }[],
  own: [] as { id: string; name: string; user_id: string; analyses: { id: string; name: string; created_at: string }[] }[],
  grants: [] as { company_id: string; shared_with_user_id: string; shared_with_email: string }[],
  rpc: vi.fn(),
  change: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.error } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc,
  from: (table: string) => {
    let rows: unknown[] = [];
    const query = {
      select: () => query,
      eq: () => { rows = table === 'shares' ? mocks.grants : mocks.own; return query; },
      neq: () => { rows = mocks.incoming; return query; },
      order: () => query,
      then: (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return query;
  },
} }));

const companion: StockCompanion = { id: 'connection', user_id: 'reader', email: 'reader@example.com', display_name: 'Reader', status: 'accepted', incoming: false, sharing_all: false, receiving_all: false };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><LanguageProvider defaultLanguage="en"><MemoryRouter>
    <StockCompanionsSettings />
  </MemoryRouter></LanguageProvider></QueryClientProvider>);
}
function tab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
}

describe('stock companion settings', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear();
    mocks.friends = [{ ...companion }]; mocks.incoming = []; mocks.own = []; mocks.grants = [];
    mocks.change.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockImplementation((name, params) => name === 'list_stock_companions'
      ? Promise.resolve({ data: mocks.friends, error: null }) : mocks.change(name, params));
  });
  afterEach(cleanup);

  it('sends a normalized request and shows newly pending companions', async () => {
    mount(); await screen.findByText('Reader');
    fireEvent.change(screen.getByLabelText('Companion email address'), { target: { value: 'New@Example.com' } });
    mocks.friends = [...mocks.friends, { ...companion, id: 'new', user_id: 'new', email: 'new@example.com', display_name: null, status: 'pending' }];
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Waiting for a reply')).toBeInTheDocument();
    expect(mocks.change).toHaveBeenCalledWith('request_stock_companion', { _email: 'new@example.com' });
    expect(screen.getByLabelText('Companion email address')).toHaveValue('');
  });

  it('keeps an unknown email and explains the missing account', async () => {
    mocks.change.mockResolvedValue({ error: { code: 'P0002' } });
    mount();
    fireEvent.change(screen.getByLabelText('Companion email address'), { target: { value: 'missing@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('They need a Napsys account first');
    expect(screen.getByLabelText('Companion email address')).toHaveValue('missing@example.com');
  });

  it('accepts an incoming request and only then offers sharing controls', async () => {
    mocks.friends[0] = { ...companion, status: 'pending', incoming: true };
    mount(); await screen.findByText('Wants to be your stock companion');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    mocks.friends = [{ ...companion, incoming: true }];
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('switch', { name: 'Share all my analyses: reader@example.com' })).not.toBeChecked();
    expect(mocks.change).toHaveBeenCalledWith('respond_stock_companion', { _connection_id: 'connection', _accept: true });
  });

  it('enables global sharing only for the selected companion', async () => {
    mount(); const toggle = await screen.findByRole('switch', { name: 'Share all my analyses: reader@example.com' });
    mocks.friends = [{ ...companion, sharing_all: true }];
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(mocks.change).toHaveBeenCalledWith('set_companion_share_all', { _companion_id: 'reader', _enabled: true });
    expect(screen.getByText(/including those you create in the future/)).toBeInTheDocument();
  });

  it('does not pretend global sharing is enabled when the server rejects it', async () => {
    mocks.change.mockResolvedValue({ error: { code: '42501' } });
    mount(); const toggle = await screen.findByRole('switch', { name: 'Share all my analyses: reader@example.com' });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(toggle).not.toBeChecked();
  });

  it('explains revocation in both directions before removing a companion', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Remove companion: reader@example.com' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/removed in both directions/)).toBeInTheDocument();
    mocks.friends = [];
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove companion' }));
    await screen.findByText(/You have no stock companions yet/);
    expect(mocks.change).toHaveBeenCalledWith('remove_stock_companion', { _connection_id: 'connection' });
  });

  it('lists received analyses with links to their read-only views', async () => {
    mocks.incoming = [{ id: 'received', name: 'Received company', user_id: 'reader', analyses: [{ id: 'a1', name: 'Shared analysis', created_at: '2026-11-05' }] }];
    mount(); tab('Shared with me');
    expect(await screen.findByRole('link', { name: /Shared analysis/ })).toHaveAttribute('href', '/company/received/analysis/a1');
    expect(screen.getByText('Shared by: reader@example.com')).toBeInTheDocument();
  });

  it('lists outgoing analyses from global grants and individual grants without duplicates', async () => {
    mocks.friends[0].sharing_all = true;
    mocks.own = [{ id: 'mine', name: 'My company', user_id: 'owner', analyses: [{ id: 'a2', name: 'My analysis', created_at: '2026-11-05' }] }];
    mocks.grants = [{ company_id: 'mine', shared_with_user_id: 'reader', shared_with_email: 'reader@example.com' }];
    mount(); tab('My shares');
    expect(await screen.findByRole('link', { name: /My analysis/ })).toHaveAttribute('href', '/company/mine/analysis/a2');
    expect(screen.getByText('Shared with: reader@example.com')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'My company' })).toHaveLength(1);
  });
});
