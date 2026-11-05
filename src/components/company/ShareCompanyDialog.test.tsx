import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { ShareCompanyDialog } from './ShareCompanyDialog';

const mocks = vi.hoisted(() => ({
  userId: 'owner',
  rpc: vi.fn(),
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
    <ShareCompanyDialog companyId="company" companyName="Example" ownerId="owner" />
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
    mocks.rpc.mockResolvedValue({ data: 'grant', error: null });
    mocks.remove.mockResolvedValue({ data: { id: 'grant' }, error: null });
  });
  afterEach(cleanup);

  it('hides sharing from recipients without loading the grant list', () => {
    mocks.userId = 'reader';
    mount();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('states the company-wide scope and shares a normalized email, then refreshes recipients', async () => {
    mount();
    const dialog = await open();
    expect(within(dialog).getByText(/all its current and future analyses/)).toBeInTheDocument();
    await screen.findByText('Not shared with anyone');
    mocks.list.mockResolvedValue({ data: [grant], error: null });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: ' Reader@Example.com ' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Share' }).closest('form')!);
    await screen.findByText('reader@example.com');
    expect(mocks.rpc).toHaveBeenCalledWith('share_company_with_email', { _company_id: 'company', _email: 'reader@example.com' });
    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(screen.getByText('Read only')).toBeInTheDocument();
  });

  it('keeps the address and explains when the recipient has no account', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: 'P0002' } });
    mount();
    const dialog = await open();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'missing@example.com' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Share' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('They need to create an account first');
    expect(screen.getByLabelText('Email address')).toHaveValue('missing@example.com');
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
});
