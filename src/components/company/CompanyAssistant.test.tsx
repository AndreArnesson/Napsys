import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { CompanyAssistantError, type CompanyChatTurn } from '@/lib/companyAssistant';
import { CompanyAssistant } from './CompanyAssistant';

const mocks = vi.hoisted(() => ({
  userId: 'owner',
  loadSettings: vi.fn(),
  loadTurns: vi.fn(),
  loadNews: vi.fn(),
  invoke: vi.fn(),
  save: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, info: mocks.info } }));
vi.mock('@/lib/companyAssistant', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/companyAssistant')>(),
  loadAssistantSettings: mocks.loadSettings,
  loadAssistantTurns: mocks.loadTurns,
  loadCompanyNews: mocks.loadNews,
  invokeAssistant: mocks.invoke,
  saveAssistantSettings: mocks.save,
}));

function fixtureTurn(overrides: Partial<CompanyChatTurn> = {}): CompanyChatTurn {
  return {
    id: 'turn-1', company_id: 'company-1', user_id: 'owner', question: 'Saved question',
    answer: 'Saved answer', sources: [], created_at: '2026-11-08T10:00:00Z', ...overrides,
  };
}

function mount(companyId = 'company-1', isOwner = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = (id: string) => <QueryClientProvider client={client}><LanguageProvider defaultLanguage="en">
    <CompanyAssistant companyId={id} isOwner={isOwner} />
  </LanguageProvider></QueryClientProvider>;
  const result = render(view(companyId));
  return { ...result, client, moveTo: (id: string) => result.rerender(view(id)) };
}

describe('CompanyAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.userId = 'owner';
    mocks.loadSettings.mockResolvedValue(null);
    mocks.loadTurns.mockResolvedValue([]);
    mocks.loadNews.mockResolvedValue([]);
    mocks.save.mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('loads existing context without triggering AI or news collection on a visit', async () => {
    mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled());
    expect(await screen.findByText('Daily monitoring is turned off.')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.loadTurns).toHaveBeenCalledWith('company-1', 'owner', expect.any(AbortSignal));
  });

  it('allows readers to use private chat while hiding all company editing and import controls', async () => {
    mocks.userId = 'reader';
    mount('company-1', false);
    const input = await screen.findByLabelText('Your question about the company');
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.queryByText('Assistant settings')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fetch news' })).not.toBeInTheDocument();
    expect(mocks.loadTurns).toHaveBeenCalledWith('company-1', 'reader', expect.any(AbortSignal));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not retry an exhausted AI quota and keeps the question for a deliberate retry', async () => {
    mocks.invoke.mockRejectedValue(new CompanyAssistantError('quota_exhausted', 60));
    mount();
    const input = screen.getByLabelText('Your question about the company');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'What changed?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The free quota is temporarily exhausted');
    expect(input).toHaveValue('What changed?');
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('company-chat', { companyId: 'company-1', question: 'What changed?', language: 'en' }, expect.any(AbortSignal));
  });

  it('discards a draft and cached conversation when changing companies', async () => {
    mocks.loadTurns.mockImplementation(async (companyId: string) => companyId === 'company-1' ? [fixtureTurn()] : []);
    const { moveTo } = mount();
    expect(await screen.findByText('Saved answer', {}, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your question about the company'), { target: { value: 'Draft for company one' } });
    moveTo('company-2');
    await waitFor(() => expect(mocks.loadTurns).toHaveBeenCalledWith('company-2', 'owner', expect.any(AbortSignal)));
    expect(screen.queryByText('Saved answer')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your question about the company')).toHaveValue('');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('formats answers and connects citations while leaving the user question as plain text', async () => {
    mocks.loadTurns.mockResolvedValue([fixtureTurn({
      question: '**A literal question**',
      answer: '### Conclusion\n\nRevenue **grew 10%** [A1].\n\n- Check the margin',
      sources: [{ id: 'A1', label: 'Saved analysis', url: '/company/company-1/analysis/analysis-1' }],
    })]);
    mount();
    expect(await screen.findByRole('heading', { name: 'Conclusion' })).toBeInTheDocument();
    expect(screen.getByText('**A literal question**').tagName).toBe('P');
    expect(screen.getByText('grew 10%').tagName).toBe('STRONG');
    fireEvent.click(screen.getByRole('link', { name: 'Show source [A1]: Saved analysis' }));
    expect(document.activeElement).toHaveTextContent('[A1] Saved analysis');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('treats raw model HTML as text and refuses unsafe source links', async () => {
    mocks.loadTurns.mockResolvedValue([fixtureTurn({
      answer: '<img src=x onerror=alert(1)>',
      sources: [{ id: 'A1', label: 'Unsafe source', url: 'javascript:alert(1)' }, { id: 'N1', label: 'Company news', url: 'https://news.cision.com/example' }],
    })]);
    mount();
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Unsafe source/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Company news/ })).toHaveAttribute('href', 'https://news.cision.com/example');
  });

  it('saves daily monitoring with automatic sources only after an explicit owner action', async () => {
    mount();
    await waitFor(() => expect(screen.getByLabelText('Monitor news daily')).toBeEnabled());
    fireEvent.click(screen.getByText('Assistant settings'));
    fireEvent.click(screen.getByRole('switch', { name: 'Monitor news daily' }));
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledExactlyOnceWith('company-1', { chatEnabled: true, newsEnabled: true, feedUrls: [] }, expect.any(AbortSignal)));
  });

  it('aborts an in-flight request and ignores its late answer after switching accounts', async () => {
    let resolveRequest!: (value: unknown) => void;
    mocks.invoke.mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; }));
    const { client, moveTo } = mount();
    const input = screen.getByLabelText('Your question about the company');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: 'Private owner question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    const signal = mocks.invoke.mock.calls[0][2] as AbortSignal;
    mocks.userId = 'reader';
    moveTo('company-1');
    await waitFor(() => expect(mocks.loadTurns).toHaveBeenCalledWith('company-1', 'reader', expect.any(AbortSignal)));
    expect(signal.aborted).toBe(true);
    resolveRequest({ turn: fixtureTurn({ answer: 'Private late answer' }) });
    await waitFor(() => expect(client.getQueryData(['company-chat-turns', 'company-1', 'owner'])).toBeUndefined());
    expect(screen.queryByText('Private late answer')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your question about the company')).toHaveValue('');
  });

  it('shows a quota pause after a successful RSS refresh without reporting an AI success or retrying', async () => {
    mocks.loadSettings.mockResolvedValue({ company_id: 'company-1', chat_enabled: true, news_enabled: true, feed_urls: [] });
    mocks.invoke.mockImplementation(async () => {
      mocks.loadSettings.mockResolvedValue({
        company_id: 'company-1', chat_enabled: true, news_enabled: true, feed_urls: [],
        last_news_error: 'quota_exhausted', news_paused_until: new Date(Date.now() + 60_000).toISOString(),
      });
      return { status: 'paused', code: 'quota_exhausted', added: 2, retryAfterSeconds: 60 };
    });
    mount();
    const button = screen.getByRole('button', { name: 'Fetch news' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('The free quota is temporarily exhausted')));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('company-news', { companyId: 'company-1', action: 'refresh', language: 'en' }, expect.any(AbortSignal));
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.queryByRole('button', { name: 'Fetching…' })).not.toBeInTheDocument();
  });

  it('re-enables refresh when an idle-page pause expires without automatically importing news', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T10:00:00Z'));
    mocks.loadSettings.mockResolvedValue({
      company_id: 'company-1', chat_enabled: true, news_enabled: true, feed_urls: [],
      news_paused_until: new Date(Date.now() + 5000).toISOString(),
    });
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const button = screen.getByRole('button', { name: 'Fetch news' });
    expect(button).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
    expect(button).toBeEnabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
