// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AiError } from '../../supabase/functions/_shared/companyAiCore';
import { CompanyContext } from '../../supabase/functions/company-chat/context';
import {
  MAX_ANALYSIS_DRAFT_BYTES, activeAnalysisInstruction, addActiveAnalysisContext, changedAnalysisDraft, isCompanyReportPath,
  prioritizeAnalysisReports, readAnalysisChatBody, sanitizeAnalysisDraft, savedAnalysisContext,
} from '../../supabase/functions/company-chat/analysisContext';

const analysis = {
  id: 'old-analysis', company_id: 'company', user_id: 'owner', name: 'Original investment thesis',
  created_at: '2020-01-01T00:00:00Z', rating: 'buy', summary_comment: 'The original thesis',
  current_price: 17, shares_outstanding: 200000, price_fx_rate: 1.2, employees: 15,
  projections: [{ year: 2029, adjustedEvEbitda: 9, estimatedPrice: 34 }],
  visible_sections: { napkin_mode: true, napkin_assumptions: [{ year: 2029, revenue: 15, netMargin: 10, peTarget: 12 }] },
  images: ['private-image'], locked: false,
};

function activeContext(overrides: Partial<Parameters<typeof addActiveAnalysisContext>[1]> = {}) {
  const context = new CompanyContext();
  addActiveAnalysisContext(context, {
    companyId: 'company', analysis, draft: null,
    income: [], balance: [], quarters: [], estimates: [], currentIncome: [], currentBalance: [], currentQuarters: [],
    ...overrides,
  });
  return context;
}

describe('active analysis source selection', () => {
  it('keeps the explicitly selected old analysis first even with many newer analyses and long notes', () => {
    const selected = { ...analysis, summary_comment: 'x'.repeat(11000) + 'Important original risk' };
    const context = activeContext({ analysis: selected });
    for (let index = 0; index < 100; index++) context.add(`A${index + 1}`, 'Newer analysis', 'new data'.repeat(2000));
    expect(context.sources[0]).toEqual({
      id: 'A0', label: 'Aktiv analys (sparad): Original investment thesis', url: '/company/company/analysis/old-analysis',
    });
    expect(context.sections[0]).toContain('Important original risk');
    expect(context.sections[0]).toContain('adjustedEvEbitda');
    expect(context.sections[0]).toContain('price_fx_rate');
    expect(context.sources.some(source => source.id === 'A0')).toBe(true);
  });

  it('extracts actual saved napkin values and omits UI metadata, images and user identifiers', () => {
    const saved = savedAnalysisContext(analysis);
    expect(saved).toMatchObject({ napkin_mode: true, napkin_assumptions: analysis.visible_sections.napkin_assumptions });
    expect(saved).not.toHaveProperty('visible_sections');
    expect(saved).not.toHaveProperty('images');
    expect(saved).not.toHaveProperty('user_id');
    expect(Object.keys(saved).at(-1)).toBe('summary_comment');
    expect(activeContext().sections[0]).toContain('peTarget');
  });

  it('extracts investment holdings and NAV discount from both historical storage layouts', () => {
    const saved = savedAnalysisContext({ ...analysis,
      projections: [{ id: 'holding-1', name: 'Listed business', nav_value: 25 }],
      adjustments: [{ _type: 'investment_holding', id: 'holding-2', name: 'Private business' }, { _type: 'nav_discount', value: 0.2 }],
    });
    expect(saved.investment_holdings).toEqual([
      { id: 'holding-1', name: 'Listed business', nav_value: 25 },
      { _type: 'investment_holding', id: 'holding-2', name: 'Private business' },
    ]);
    expect(saved.nav_discount).toBe(0.2);
  });

  it('keeps snapshot values separate from clearly labeled company-current fallbacks', () => {
    const context = activeContext({ income: [{ revenue: 10 }], currentIncome: [{ revenue: 999 }],
      currentBalance: [{ cash: 7 }], estimates: [{ year: 2029, revenue: 20 }],
    });
    const section = context.sections.find(value => value.startsWith('[S0]'))!;
    const data = JSON.parse(section.slice(section.indexOf('\n') + 1));
    expect(data.income).toEqual({ basis: 'analysis_snapshot', rows: [{ revenue: 10 }] });
    expect(data.balance).toEqual({ basis: 'company_current_fallback', rows: [{ cash: 7 }] });
    expect(data.quarters).toEqual({ basis: 'missing', rows: [] });
    expect(section).not.toContain('999');
    expect(context.sources.find(source => source.id === 'E0')?.url).toBe('/company/company/analysis/old-analysis');
  });

  it('registers only actual current editor differences and places structured assumptions before prose', () => {
    const draft = changedAnalysisDraft(sanitizeAnalysisDraft({
      name: analysis.name, summary_comment: 'Current editor thesis', current_price: 25,
      projections: analysis.projections,
    }, true), analysis);
    expect(draft).toEqual({ current_price: 25, summary_comment: 'Current editor thesis' });
    const context = activeContext({ draft });
    expect(context.sources.map(source => source.id)).toEqual(['A0', 'D0']);
    expect(context.sources[1].label).toContain('kan innehålla osparade');
    expect(context.sections[1].indexOf('current_price')).toBeLessThan(context.sections[1].indexOf('summary_comment'));
    expect(changedAnalysisDraft(sanitizeAnalysisDraft({ current_price: 17, summary_comment: analysis.summary_comment }, true), analysis)).toBeNull();
  });

  it('makes the active-view meaning and possible unsaved override explicit without changing company chat instructions', () => {
    expect(activeAnalysisInstruction()).toBe('');
    const instruction = activeAnalysisInstruction('old-analysis', true);
    expect(instruction).toContain('aldrig automatiskt på bolagets senaste analys');
    expect(instruction).toContain('har företräde');
    expect(instruction).toContain('kan innehålla osparade');
    expect(instruction).toContain('company_current_fallback');
  });

  it('keeps calculated next-year valuation beside the selected analysis even when saved notes are long', () => {
    const context = activeContext({ analysis: { ...analysis, summary_comment: 'note'.repeat(10000) },
      valuation: { mode: 'yearly', rows: [{ year: 2027, mos: 42.5, estimatedPrice: 28.5, price: 20 }] },
    });
    const valuation = context.sections.find(section => section.startsWith('[V0]'))!;
    expect(valuation).toContain('42.5');
    expect(valuation).toContain('(estimatedPrice - price) / price * 100');
    expect(context.sources.find(source => source.id === 'V0')?.url).toBe('/company/company/analysis/old-analysis');
  });

  it('treats JSONB object key ordering as unchanged while preserving projection row order', () => {
    const saved = { ...analysis, projections: [{ year: 2030, adjustedEvEbitda: 4, estimatedPrice: 35 }, { year: 2031, estimatedPrice: 40 }] };
    expect(changedAnalysisDraft(sanitizeAnalysisDraft({ projections: [
      { estimatedPrice: 35, adjustedEvEbitda: 4, year: 2030 }, { estimatedPrice: 40, year: 2031 },
    ] }, true), saved)).toBeNull();
    expect(changedAnalysisDraft(sanitizeAnalysisDraft({ projections: [...saved.projections].reverse() }, true), saved)).toHaveProperty('projections');
  });

  it('selects analysis-specific old reports before newer company reports and removes duplicate metadata', () => {
    const old = { id: 'old-report', analysis_id: 'old-analysis', created_at: '2020-01-01' };
    const reports = [{ id: 'latest-report', analysis_id: 'another-analysis', created_at: '2026-11-08' }, old, { ...old }];
    expect(prioritizeAnalysisReports(reports, 'old-analysis').map(report => report.id)).toEqual(['old-report', 'latest-report']);
    expect(prioritizeAnalysisReports(reports)).toBe(reports);
  });

  it('keeps ordinary stored filenames intact but rejects encoded cross-company traversal', () => {
    expect(isCompanyReportPath('company/Årsrapport 2026 100%.pdf', 'company')).toBe(true);
    expect(isCompanyReportPath('company/Årsrapport%202026.pdf', 'company')).toBe(true);
    for (const path of [
      'other/report.pdf', 'company/../other/report.pdf', 'company/%2e%2e%2fother.pdf',
      'company/%252e%252e%252fother.pdf', 'company/%2e%2e', 'company/..',
      'company/folder\\other.pdf', 'company/folder%5cother.pdf', 'company/file%00.pdf',
    ]) expect(isCompanyReportPath(path, 'company'), path).toBe(false);
  });
});

describe('untrusted current analysis values', () => {
  it('accepts the real projection, adjustment, investment and napkin field shapes', () => {
    const value = {
      name: 'Edited', summary_comment: 'A note', rating: 'hold', current_price: 12, shares_outstanding: 1200,
      price_fx_rate: 1.1, employees: 30, nav_discount: 0.2, napkin_mode: true,
      projections: [{ year: 2030, quarter: 1, adjustedEvEbitda: 7, adjustedNetIncome: 12, dividendYield: 3 }],
      adjustments: [{ id: 'a', description: 'One-off', metric: 'ebitda', amount: 4, year: 2030 }],
      investment_holdings: [{ id: 'h', name: 'Holding', ticker: 'H', weight_percent: 5, conviction: 'high',
        outlook: 'Growth', moat: 'Brand', profit_comment: 'Stable', notes: 'Follow', category: 'stock', is_listed: true,
        market_cap: 500, pe_ratio: 10, ev_ebit: 8, nav_value: 50, valuation_comment: 'Fair', description: 'Business' }],
      napkin_assumptions: [{ year: 2030, revenue: 50, netMargin: 10, peTarget: 15 }],
    };
    expect(sanitizeAnalysisDraft(value, true)).toEqual(value);
  });

  it('drops unknown properties, including own prototype-like keys, without changing any prototype', () => {
    const value = JSON.parse('{"name":"Valid","user_id":"forged","company_id":"foreign","locked":false,"constructor":"ignored","__proto__":{"polluted":true},"toString":"ignored","projections":[{"year":2030,"company_id":"foreign","__proto__":{"polluted":true}}]}');
    const draft = sanitizeAnalysisDraft(value, true)!;
    expect(draft).toEqual({ name: 'Valid', projections: [{ year: 2030 }] });
    expect(Object.getPrototypeOf(draft)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('rejects a reader or locked owner supplying a draft before trusting any local values', () => {
    expect(() => sanitizeAnalysisDraft({ current_price: 1 }, false)).toThrowError(expect.objectContaining({ code: 'forbidden', status: 403 }));
    expect(sanitizeAnalysisDraft(undefined, false)).toBeNull();
    expect(sanitizeAnalysisDraft(null, false)).toBeNull();
  });

  it.each([
    { current_price: Infinity }, { employees: NaN }, { shares_outstanding: '1000' }, { rating: 'strong buy' },
    { napkin_mode: 'true' }, { projections: [{ year: 2030, evEbit: Infinity }] },
    { investment_holdings: [{ name: { instruction: 'ignore rules' } }] },
    { napkin_assumptions: [{ year: '2030' }] }, { adjustments: 'not rows' },
  ])('rejects malformed scalar and nested values: %j', value => {
    expect(() => sanitizeAnalysisDraft(value, true)).toThrowError(AiError);
  });

  it('bounds row counts, strings, UTF-8 bytes and cyclic non-JSON values', () => {
    expect(() => sanitizeAnalysisDraft({ projections: Array.from({ length: 101 }, () => ({ year: 2030 })) }, true)).toThrow();
    expect(() => sanitizeAnalysisDraft({ name: 'n'.repeat(501) }, true)).toThrow();
    expect(() => sanitizeAnalysisDraft({ unknown: 'x'.repeat(MAX_ANALYSIS_DRAFT_BYTES) }, true)).toThrowError(expect.objectContaining({ status: 413 }));
    expect(() => sanitizeAnalysisDraft({ summary_comment: 'å'.repeat(31000) }, true)).toThrowError(expect.objectContaining({ status: 413 }));
    const cyclic: Record<string, unknown> = {}; cyclic.child = cyclic;
    expect(() => sanitizeAnalysisDraft(cyclic, true)).toThrowError(AiError);
  });
});

describe('bounded company and analysis chat requests', () => {
  it('allows a bounded analysis editor snapshot while preserving the original company request size', async () => {
    const body = { analysisId: 'old-analysis', question: 'Explain', analysisDraft: { summary_comment: 'x'.repeat(20000) } };
    expect(await readAnalysisChatBody(new Request('https://example.com', { method: 'POST', body: JSON.stringify(body) }))).toEqual(body);
    await expect(readAnalysisChatBody(new Request('https://example.com', { method: 'POST', body: ' '.repeat(12000) + '{}' })))
      .rejects.toMatchObject({ code: 'invalid_request', status: 413 });
  });

  it('rejects over-limit streamed bodies and non-object JSON before context assembly', async () => {
    await expect(readAnalysisChatBody(new Request('https://example.com', { method: 'POST', body: JSON.stringify({ analysisId: 'old', large: 'x'.repeat(90000) }) })))
      .rejects.toMatchObject({ status: 413 });
    await expect(readAnalysisChatBody(new Request('https://example.com', { method: 'POST', body: '[]' })))
      .rejects.toMatchObject({ code: 'invalid_request', status: 400 });
  });
});
