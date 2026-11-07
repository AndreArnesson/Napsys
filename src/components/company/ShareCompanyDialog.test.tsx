import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { ShareCompanyDialog } from './ShareCompanyDialog';

const mocks = vi.hoisted(() => ({
  userId: 'owner',
  rpc: vi.fn(),
  friends: [] as Array<{ id: string; user_id: string; email: string; display_name: string | null; status: string; incoming: boolean; sharing_all: boolean; receiving_all: boolean }>,
  list: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ order: mocks.list }) }),
      delete: () => {
        const query = { eq: () => query, select: () => ({ single: mocks.remove }) };
        return query;
      },
    }),
  },
}));

const grant = { id: 'grant', shared_with_email: 'reader@example.com', shared_with_user_id: 'reader' };

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><LanguageProvider defaultLanguage="en">
    <MemoryRouter><ShareCompanyDialog companyId="company" companyName="Example" ownerId="owner" /></MemoryRouter>
  </LanguageProvider></QueryClientProvider>);
}

async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  return screen.findByRole('dialog');
}

describe('ShareCompanyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.userId = 'owner';
    mocks.list.mockResolvedValue({ data: [], error: null });
    mocks.friends = [{ id: 'friend', user_id: 'reader', email: 'reader@example.com', display_name: 'Reader', status: 'accepted', incoming: false, sharing_all: false, receiving_all: false }];
    mocks.rpc.mockImplementation(async (name) => ({ data: name === 'list_stock_companions' ? mocks.friends : 'grant', error: null }));
    mocks.remove.mockResolvedValue({ data: { id: 'grant' }, error: null });
  });
  afterEach(cleanup);

  it('hides sharing from recipients without loading the grant list', () => {
    mocks.userId = 'reader';
    mount();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('shares with a selected accepted companion and refreshes recipients', async () => {
    mount();
    const dialog = await open();
    expect(within(dialog).getByText(/all its current and future analyses/)).toBeInTheDocument();
    await screen.findByText('Not shared with anyone');
    mocks.list.mockResolvedValue({ data: [grant], error: null });
    fireEvent.change(await screen.findByLabelText('Select stock companion'), { target: { value: 'reader' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Share' }).closest('form')!);
    await screen.findByText('reader@example.com');
    expect(mocks.rpc).toHaveBeenCalledWith('share_company_with_companion', { _company_id: 'company', _companion_id: 'reader' });
    expect(screen.getByLabelText('Select stock companion')).toHaveValue('');
    expect(screen.getByText('Read only')).toBeInTheDocument();
  });

  it('keeps the selection when sharing fails', async () => {
    mocks.rpc.mockImplementation(async (name) => name === 'list_stock_companions' ? { data: mocks.friends, error: null } : { error: { code: '42501' } });
    mount();
    const dialog = await open();
    fireEvent.change(await screen.findByLabelText('Select stock companion'), { target: { value: 'reader' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Share' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not complete the change');
    expect(screen.getByLabelText('Select stock companion')).toHaveValue('reader');
  });

  it('offers retry when loading recipients fails', async () => {
    mocks.list.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    mount();
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load shares');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Not shared with anyone')).toBeInTheDocument();
  });

  it('removes a grant only after the server confirms revocation', async () => {
    mocks.list.mockResolvedValueOnce({ data: [grant], error: null });
    mount();
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove access: reader@example.com' }));
    await screen.findByText('Not shared with anyone');
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledWith('Access removed');
  });

  it('retains a grant when revocation fails', async () => {
    mocks.list.mockResolvedValue({ data: [grant], error: null });
    mocks.remove.mockResolvedValue({ data: null, error: { message: 'offline' } });
    mount();
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove access: reader@example.com' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Could not remove access. Please try again.'));
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
  });
  it('shares all analyses only when the checkbox is selected', async () => {
    mount();
    const dialog = await open();
    fireEvent.change(await screen.findByLabelText('Select stock companion'), { target: { value: 'reader' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Share all my analyses' }));
    expect(screen.getByText(/including those you create in the future/)).toBeInTheDocument();
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Share' }).closest('form')!);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('set_companion_share_all', { _companion_id: 'reader', _enabled: true }));
  });

  it('requires acceptance before a companion is selectable', async () => {
    mocks.friends[0].status = 'pending';
    mount(); await open();
    expect(await screen.findByText(/wait for acceptance before sharing/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage stock companions' })).toHaveAttribute('href', '/companions');
  });

  it('shows global access without offering an ineffective individual revoke button', async () => {
    mocks.friends[0].sharing_all = true;
    mocks.list.mockResolvedValue({ data: [grant], error: null });
    mount(); await open();
    expect(await screen.findByText('Access through sharing of all analyses')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove access: reader@example.com' })).not.toBeInTheDocument();
  });
});
