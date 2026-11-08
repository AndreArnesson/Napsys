// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), callGemini: vi.fn() }));
vi.mock('../../supabase/functions/_shared/companyAi.ts', async () => {
  const { AiError } = await import('../../supabase/functions/_shared/companyAiCore');
  return { AiError, requireUser: mocks.requireUser, callGemini: mocks.callGemini,
    jsonResponse: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  };
});

const companyId = '20000000-0000-4000-8000-000000000001';
const analysisId = '30000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000001';
let handler: (req: Request) => Promise<Response>;
interface QueryState {
  table: string; operation: string; columns?: string; payload?: Record<string, unknown>;
  filters: { method: string; key: string; value: unknown }[]; range?: number[];
}

function mockClient(resolve: (state: QueryState) => unknown) {
  const queries: QueryState[] = [];
  const download = vi.fn(async (_path: string) => ({ data: new Blob(['%PDF-1.4 fake test report']), error: null }));
  return {
    queries,
    storage: { from: vi.fn(() => ({ download })) }, download,
    from: vi.fn((table: string) => {
      const state: QueryState = { table, operation: 'read', filters: [] };
      queries.push(state);
      const chain: Record<string, unknown> = {};
      const result = () => Promise.resolve({ data: resolve(state), error: null });
      chain.select = (columns?: string) => { state.columns = columns; return chain; };
      for (const method of ['eq', 'is', 'in']) chain[method] = (key: string, value: unknown) => { state.filters.push({ method, key, value }); return chain; };
      for (const method of ['order', 'limit']) chain[method] = () => chain;
      chain.range = (from: number, to: number) => { state.range = [from, to]; return chain; };
      chain.insert = (payload: Record<string, unknown>) => { state.operation = 'insert'; state.payload = payload; return chain; };
      chain.delete = () => { state.operation = 'delete'; return chain; };
      chain.maybeSingle = result; chain.single = result;
      chain.then = (onFulfilled: (value: unknown) => unknown, onRejected: (error: unknown) => unknown) => result().then(onFulfilled, onRejected);
      return chain;
    }),
  };
}

const hasFilter = (state: QueryState, method: string, key: string, value: unknown) => state.filters.some(filter => filter.method === method && filter.key === key && filter.value === value);

describe('active-analysis chat endpoint boundaries', () => {
  let userClient: ReturnType<typeof mockClient>;
  let adminClient: ReturnType<typeof mockClient>;
  let readonlyViewer: boolean;
  let mismatchedAnalysis: boolean;
  let revoked: boolean;
  let unsafeReport: boolean;
  let locked: boolean;
  let ownerAnalysis: Record<string, unknown>;

  beforeAll(async () => {
    vi.stubGlobal('Deno', { serve: (callback: typeof handler) => { handler = callback; } });
    const endpoint = '../../supabase/functions/company-chat/index.ts';
    await import(/* @vite-ignore */ endpoint);
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  beforeEach(() => {
    vi.clearAllMocks();
    readonlyViewer = false; mismatchedAnalysis = false; revoked = false; unsafeReport = false; locked = false;
    ownerAnalysis = { id: analysisId, company_id: companyId, user_id: userId, name: 'Old explicitly selected analysis',
      summary_comment: 'Old original thesis', current_price: 17, created_at: '2020-01-01', locked: false,
      projections: [{ year: 2030, estimatedPrice: 40 }], visible_sections: { napkin_mode: true, napkin_assumptions: [{ year: 2030, peTarget: 12 }] },
    };
    userClient = mockClient(state => {
      if (state.table === 'companies') return { id: companyId, user_id: readonlyViewer ? 'another-owner' : userId, name: 'Example Company' };
      if (state.table === 'company_ai_settings') return { chat_enabled: true };
      if (state.table === 'analyses') {
        if (hasFilter(state, 'eq', 'id', analysisId)) {
          if (mismatchedAnalysis || (revoked && state.columns === 'id')) return null;
          return { ...ownerAnalysis, user_id: readonlyViewer ? 'another-owner' : userId, locked };
        }
        // The explicitly selected old analysis is absent from the latest 30.
        return Array.from({ length: 30 }, (_, index) => ({ id: `newer-${index}`, name: `Newer analysis ${index}`, created_at: '2026-11-08' }));
      }
      if (['income_statement', 'balance_sheet', 'quarterly_income_statement'].includes(state.table)) {
        if (hasFilter(state, 'eq', 'analysis_id', analysisId)) return [{ analysis_id: analysisId, fiscal_year: 2020, marker: `selected-${state.table}`, revenue: 15 }];
        if (hasFilter(state, 'is', 'analysis_id', null)) return [{ analysis_id: null, fiscal_year: 2026, marker: `current-${state.table}`, revenue: 999 }];
        return [];
      }
      if (state.table === 'quarterly_estimates') return hasFilter(state, 'eq', 'analysis_id', analysisId) ? [{ analysis_id: analysisId, year: 2030, revenue: 30 }] : [];
      if (state.table === 'company_chat_turns') return [{ question: hasFilter(state, 'eq', 'analysis_id', analysisId) ? 'Private selected-analysis history' : 'Separate company history', answer: 'Prior response' }];
      if (state.table === 'report_documents') {
        if (hasFilter(state, 'eq', 'analysis_id', analysisId)) return [{ id: 'old-report', analysis_id: analysisId,
          file_name: 'Old selected report.pdf', file_path: unsafeReport ? `${companyId}/%252e%252e%252fother.pdf` : `${companyId}/old.pdf`, file_size: 26, created_at: '2020-01-01' }];
        return [{ id: 'new-report', analysis_id: 'another-analysis', file_name: 'New report.pdf', file_path: `${companyId}/new.pdf`, file_size: 26, created_at: '2026-11-08' }];
      }
      return [];
    });
    adminClient = mockClient(state => {
      if (state.operation === 'insert') return { id: 'turn-id', created_at: '2026-11-08T20:00:00Z', analysis_id: null, ...state.payload };
      if (state.range) return [{ id: 'obsolete-turn' }];
      return [];
    });
    mocks.requireUser.mockResolvedValue({ userClient, adminClient, user: { id: userId } });
    mocks.callGemini.mockResolvedValue('Answer [A0] [S0] [E0] [D0] [R1]');
  });

  function request(values: Record<string, unknown> = { analysisId }) {
    return new Request('https://example.com/company-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, question: 'Explain this analysis', ...values }),
    });
  }

  it('uses the explicitly selected old analysis, snapshot data, estimates and private history', async () => {
    const response = await handler(request({ analysisId, analysisDraft: { summary_comment: 'Current editor note', current_price: 25 } }));
    expect(response.status).toBe(200);
    const call = mocks.callGemini.mock.calls[0][0];
    const context = call.parts.filter((part: { text?: string }) => part.text).map((part: { text: string }) => part.text).join('\n');
    expect(context.indexOf('[A0]')).toBeLessThan(context.indexOf('[C1]'));
    expect(context).toContain('Old explicitly selected analysis');
    expect(context).toContain('Current editor note');
    expect(context).toContain('selected-income_statement');
    expect(context).toContain('selected-balance_sheet');
    expect(context).toContain('selected-quarterly_income_statement');
    expect(context).toContain('Private selected-analysis history');
    expect(context).not.toContain('Separate company history');
    expect(call.systemInstruction).toContain(`analys ${analysisId}`);
    expect(userClient.queries.find(state => state.table === 'analyses' && hasFilter(state, 'eq', 'id', analysisId))?.filters)
      .toContainEqual({ method: 'eq', key: 'company_id', value: companyId });
    expect(userClient.download.mock.calls[0][0]).toBe(`${companyId}/old.pdf`);
    const result = await response.json();
    expect(result.turn.analysis_id).toBe(analysisId);
    expect(result.turn.sources.find((source: { id: string }) => source.id === 'A0').url).toBe(`/company/${companyId}/analysis/${analysisId}`);
    const insertion = adminClient.queries.find(state => state.operation === 'insert')!;
    expect(insertion.payload).not.toHaveProperty('analysisDraft');
    expect(insertion.payload).not.toHaveProperty('current_price');
  });

  it('scopes both history pruning and deletion to the current user, company and selected analysis', async () => {
    expect((await handler(request())).status).toBe(200);
    const history = userClient.queries.find(state => state.table === 'company_chat_turns')!;
    const pruning = adminClient.queries.find(state => state.range)!;
    const deletion = adminClient.queries.find(state => state.operation === 'delete')!;
    for (const state of [history, pruning, deletion]) {
      expect(hasFilter(state, 'eq', 'company_id', companyId)).toBe(true);
      expect(hasFilter(state, 'eq', 'user_id', userId)).toBe(true);
      expect(hasFilter(state, 'eq', 'analysis_id', analysisId)).toBe(true);
    }
  });

  it.each(['owner', 'reader', 'locked owner'])('includes computed next-year MoS from the table for an authorized %s', async kind => {
    readonlyViewer = kind === 'reader'; locked = kind === 'locked owner';
    ownerAnalysis.projections = [{ year: 2027, revenueGrowth: 10, netMargin: 70 }];
    const analysisValuation = {
      mode: 'yearly', currentPrice: 55.25, sharesOutstanding: 289196000, priceFxRate: 11,
      targetPE: 15, reportingCurrency: 'EUR', tradingCurrency: 'SEK',
      rows: [{ year: 2027, revenue: 250, earningsPerShare: 0.6, targetPE: 15, price: 55.25, estimatedPrice: 99, mos: 79.18552036199094 }],
    };
    mocks.callGemini.mockResolvedValue('MoS for 2027 is about 79.19% according to the analysis table [V0].');
    const response = await handler(request({ analysisId, question: 'Vad är MoS nästa år?', analysisValuation }));
    expect(response.status).toBe(200);
    const call = mocks.callGemini.mock.calls[0][0];
    expect(call.parts[0].text).toContain('[V0]');
    expect(call.parts[0].text).toContain('79.18552036199094');
    expect(call.parts[0].text).toContain('current_view_calculation_not_saved_analysis_fields');
    expect(call.systemInstruction).toContain('aldrig året efter analysens skapandedatum');
    expect(call.systemInstruction).toContain('byt inte nämnare');
    const result = await response.json();
    expect(result.turn.sources).toEqual([expect.objectContaining({ id: 'V0', url: `/company/${companyId}/analysis/${analysisId}` })]);
    expect(userClient.queries.every(state => state.operation === 'read')).toBe(true);
    expect(adminClient.queries.find(state => state.operation === 'insert')?.payload).not.toHaveProperty('analysisValuation');
  });

  it('requires explicit, accessible analysis scope before accepting calculated view values', async () => {
    const response = await handler(request({ analysisValuation: {} }));
    expect(response.status).toBe(400);
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(adminClient.queries).toEqual([]);
  });

  it('keeps company-only history separate and omits an analysis ID from company chat inserts', async () => {
    mocks.callGemini.mockResolvedValue('Company answer [C1]');
    expect((await handler(request({}))).status).toBe(200);
    for (const state of [userClient.queries.find(state => state.table === 'company_chat_turns')!,
      adminClient.queries.find(state => state.range)!, adminClient.queries.find(state => state.operation === 'delete')!]) {
      expect(hasFilter(state, 'is', 'analysis_id', null)).toBe(true);
    }
    expect(adminClient.queries.find(state => state.operation === 'insert')!.payload).not.toHaveProperty('analysis_id');
    expect(mocks.callGemini.mock.calls[0][0].systemInstruction).not.toContain('AKTIV ANALYSVY');
  });

  it('denies a missing or cross-company selected analysis before generating an answer', async () => {
    mismatchedAnalysis = true;
    const response = await handler(request());
    expect(response.status).toBe(403);
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(adminClient.queries).toEqual([]);
  });

  it.each(['reader', 'locked owner'])('rejects current editor values supplied by a %s', async kind => {
    readonlyViewer = kind === 'reader'; locked = kind === 'locked owner';
    const response = await handler(request({ analysisId, analysisDraft: { current_price: 1 } }));
    expect(response.status).toBe(403);
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(adminClient.queries).toEqual([]);
  });

  it('does not save or deliver the answer if the selected analysis disappears while Gemini runs', async () => {
    mocks.callGemini.mockImplementation(async () => { revoked = true; return 'Answer [A0]'; });
    const response = await handler(request());
    expect(response.status).toBe(403);
    expect(mocks.callGemini).toHaveBeenCalledOnce();
    expect(adminClient.queries.some(state => state.operation === 'insert')).toBe(false);
  });

  it('rejects stored percent-encoded traversal paths before any Storage download', async () => {
    unsafeReport = true;
    expect((await handler(request())).status).toBe(200);
    expect(userClient.download.mock.calls.every(([path]) => !String(path).includes('%'))).toBe(true);
    expect(userClient.download).not.toHaveBeenCalledWith(`${companyId}/%252e%252e%252fother.pdf`);
  });
});
