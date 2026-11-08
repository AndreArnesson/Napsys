import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { CompanyAssistantError } from '@/lib/companyAssistant';
import { type AnalysisChatTurn } from '@/lib/analysisChat';
import type { AnalysisValuationContext } from '@/lib/analysisValuation';
import { AnalysisChatBubble, type AnalysisChatBubbleProps } from './AnalysisChatBubble';

const mocks = vi.hoisted(() => ({
  userId: 'owner',
  settings: vi.fn(),
  history: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  analysisInteraction: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/companyAssistant', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/companyAssistant')>(),
  loadAssistantSettings: mocks.settings,
  invokeAssistant: mocks.invoke,
}));
vi.mock('@/lib/analysisChat', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/analysisChat')>(),
  loadAnalysisChat: mocks.history,
}));

function turn(overrides: Partial<AnalysisChatTurn> = {}): AnalysisChatTurn {
  return {
    id: 'turn-1', company_id: 'company-1', analysis_id: 'analysis-1', user_id: 'owner',
    question: 'Old private question', answer: 'Old private answer', sources: [], created_at: '2026-11-08T10:00:00Z', ...overrides,
  };
}

function mount(initial: Partial<AnalysisChatBubbleProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let props: AnalysisChatBubbleProps = { companyId: 'company-1', analysisId: 'analysis-1', analysisName: 'Base case', ...initial };
  const view = () => <QueryClientProvider client={client}><LanguageProvider defaultLanguage="en">
    <button type="button" onClick={mocks.analysisInteraction}>Use the analysis</button>
    <AnalysisChatBubble {...props} />
  </LanguageProvider></QueryClientProvider>;
  const result = render(view());
  return { ...result, client, update: (next: Partial<AnalysisChatBubbleProps>) => {
    props = { ...props, ...next };
    result.rerender(view());
  } };
}

async function openChat() {
  fireEvent.click(screen.getByRole('button', { name: 'Chat about this analysis' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(screen.getByLabelText('Your question about the analysis')).toBeEnabled());
  return dialog;
}

describe('AnalysisChatBubble', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.userId = 'owner';
    mocks.settings.mockResolvedValue(null);
    mocks.history.mockResolvedValue([]);
    mocks.invoke.mockResolvedValue({ turn: turn({ question: 'A new question', answer: 'A new answer' }) });
  });
  afterEach(cleanup);

  it('opens an accessible popup lazily and supports close, focus return and Escape without AI requests', async () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Chat about this analysis' });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
    await openChat();
    expect(screen.getByRole('heading', { name: 'Base case' })).toBeInTheDocument();
    expect(screen.getByText('This analysis and the company’s supporting records')).toBeInTheDocument();
    expect(mocks.history).toHaveBeenCalledExactlyOnceWith('company-1', 'analysis-1', 'owner', expect.any(AbortSignal));
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close analysis chat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    const dialog = await openChat();
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('keeps the analysis interactive and the popup open without a page scroll lock or focus trap', async () => {
    mount();
    const dialog = await openChat();
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.body.style.pointerEvents).not.toBe('none');
    const analysisButton = screen.getByRole('button', { name: 'Use the analysis' });
    fireEvent.pointerDown(analysisButton, { button: 0, pointerType: 'mouse' });
    analysisButton.focus();
    fireEvent.click(analysisButton);
    await waitFor(() => expect(analysisButton).toHaveFocus());
    expect(mocks.analysisInteraction).toHaveBeenCalledOnce();
    expect(dialog).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('sends once on Enter while preserving Shift+Enter, composition and blank-input behavior', async () => {
    mount();
    await openChat();
    const input = screen.getByLabelText('Your question about the analysis');
    expect(screen.getByText('Enter to send · Shift+Enter for a new line')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mocks.invoke).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'What is MoS?\nExplain the assumptions.' } });
    expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    expect(mocks.invoke).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('A new answer');
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('company-chat', {
      companyId: 'company-1', analysisId: 'analysis-1', language: 'en', question: 'What is MoS?\nExplain the assumptions.',
    }, expect.any(AbortSignal));
    expect(input).toHaveValue('');
  });

  it('sends the active analysis and latest whitelisted editor values only after a submitted question', async () => {
    const { update } = mount({ draft: { summary_comment: 'Older editor value', projections: [{ year: 2028, revenue: 20 }] } });
    await openChat();
    fireEvent.change(screen.getByLabelText('Your question about the analysis'), { target: { value: 'What changes in this scenario?' } });
    update({ draft: {
      summary_comment: 'Latest unsaved assumption', projections: [{ year: 2028, revenue: 40 }], current_price: 12,
      ...{ unapproved_field: 'must not be sent' },
    } });
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await screen.findByText('A new answer');
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('company-chat', {
      companyId: 'company-1', analysisId: 'analysis-1', question: 'What changes in this scenario?', language: 'en',
      analysisDraft: { summary_comment: 'Latest unsaved assumption', projections: [{ year: 2028, revenue: 40 }], current_price: 12 },
    }, expect.any(AbortSignal));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('isolates histories and question drafts when navigating to another analysis', async () => {
    mocks.history.mockImplementation(async (_companyId: string, analysisId: string) => analysisId === 'analysis-1' ? [turn()] : []);
    const { update, client } = mount();
    await openChat();
    expect(await screen.findByText('Old private answer')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your question about the analysis'), { target: { value: 'Draft for first analysis' } });
    update({ analysisId: 'analysis-2', analysisName: 'Bull case' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.getQueryData(['analysis-chat-turns', 'company-1', 'analysis-1', 'owner'])).toBeUndefined();
    await openChat();
    expect(mocks.history).toHaveBeenLastCalledWith('company-1', 'analysis-2', 'owner', expect.any(AbortSignal));
    expect(screen.queryByText('Old private answer')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your question about the analysis')).toHaveValue('');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('reads the latest calculated table values at submission, including for a reader without a draft', async () => {
    mocks.userId = 'reader';
    mocks.invoke.mockResolvedValue({ turn: turn({ user_id: 'reader', answer: 'MoS is 20% [V0]' }) });
    let valuation: AnalysisValuationContext = {
      mode: 'yearly', targetPE: 15, currentPrice: 100, sharesOutstanding: 1000, priceFxRate: 1,
      reportingCurrency: 'SEK', tradingCurrency: 'SEK', rows: [{ year: 2027, mos: 10, estimatedPrice: 110 }],
    };
    mount({ getValuationContext: () => valuation });
    await openChat();
    expect(mocks.invoke).not.toHaveBeenCalled();
    valuation = { ...valuation, rows: [{ year: 2027, mos: 20, estimatedPrice: 120 }] };
    fireEvent.change(screen.getByLabelText('Your question about the analysis'), { target: { value: 'What is MoS next year?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await screen.findByText('MoS is 20% [V0]');
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('company-chat', {
      companyId: 'company-1', analysisId: 'analysis-1', question: 'What is MoS next year?', language: 'en', analysisValuation: valuation,
    }, expect.any(AbortSignal));
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('keeps the question after a quota failure without automatically retrying', async () => {
    mocks.invoke.mockRejectedValue(new CompanyAssistantError('quota_exhausted', 60));
    mount();
    await openChat();
    const input = screen.getByLabelText('Your question about the analysis');
    fireEvent.change(input, { target: { value: 'Stress-test my growth assumption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The free quota is temporarily exhausted');
    expect(input).toHaveValue('Stress-test my growth assumption');
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });

  it('renders model content as text and rejects unsafe source links', async () => {
    mocks.history.mockResolvedValue([turn({
      answer: '<img src=x onerror=alert(1)>',
      sources: [{ id: 'A1', label: 'Unsafe source', url: 'javascript:alert(1)' }, { id: 'A2', label: 'Analysis', url: '/company/company-1/analysis/analysis-1' }],
    })]);
    mount();
    await openChat();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Unsafe source/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\[A2\] Analysis/ })).toHaveAttribute('href', '/company/company-1/analysis/analysis-1');
  });

  it('allows a reader to chat using saved analysis context without editing owner data', async () => {
    mocks.userId = 'reader';
    mocks.invoke.mockResolvedValue({ turn: turn({ user_id: 'reader', answer: 'Read-only discussion' }) });
    mount();
    await openChat();
    fireEvent.change(screen.getByLabelText('Your question about the analysis'), { target: { value: 'Explain these assumptions' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(await screen.findByText('Read-only discussion')).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('company-chat', {
      companyId: 'company-1', analysisId: 'analysis-1', question: 'Explain these assumptions', language: 'en',
    }, expect.any(AbortSignal));
    expect(mocks.history).toHaveBeenCalledWith('company-1', 'analysis-1', 'reader', expect.any(AbortSignal));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('cancels in-flight chat and ignores its late answer after signing out', async () => {
    let resolveRequest!: (value: unknown) => void;
    mocks.invoke.mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; }));
    const { update, client } = mount();
    await openChat();
    fireEvent.change(screen.getByLabelText('Your question about the analysis'), { target: { value: 'Private question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    const signal = mocks.invoke.mock.calls[0][2] as AbortSignal;
    mocks.userId = '';
    update({});
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    resolveRequest({ turn: turn({ answer: 'Private late answer' }) });
    await waitFor(() => expect(client.getQueryData(['analysis-chat-turns', 'company-1', 'analysis-1', 'owner'])).toBeUndefined());
    expect(screen.queryByText('Private late answer')).not.toBeInTheDocument();
  });
});
