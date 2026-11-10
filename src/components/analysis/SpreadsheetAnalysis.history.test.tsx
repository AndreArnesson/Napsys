import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { SpreadsheetAnalysis, type YearlyProjection } from './SpreadsheetAnalysis';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const saved: YearlyProjection[] = [
  { year: 2025, revenue: 120, netMargin: 10 },
  { year: 2026, revenue: 144, netMargin: 10 },
];
type Extra = Partial<React.ComponentProps<typeof SpreadsheetAnalysis>>;
function table(projections: YearlyProjection[], extra: Extra = {}) {
  return <LanguageProvider defaultLanguage="en">
    <SpreadsheetAnalysis analysisDate="2024-11-10" analysisId="history-test"
      currentPrice={10} sharesOutstanding={1_000_000}
      projections={projections} onProjectionsChange={vi.fn()} {...extra} />
  </LanguageProvider>;
}
function revenueCell() {
  const row = within(screen.getAllByRole('table')[0]).getByText('Omsättning (MSEK)').closest('tr')!;
  return within(row).getAllByRole('cell')[1];
}

describe('historical analysis estimates', () => {
  it('loads saved years after the first render and repairs stale browser period settings', () => {
    localStorage.setItem('ss-settings-history-test', JSON.stringify({ estimateYears: [2026, 2027] }));
    const view = render(table([]));
    view.rerender(table(saved));
    expect(screen.getByRole('columnheader', { name: /^2025/ })).toHaveTextContent('Year 1');
    expect(screen.getByRole('columnheader', { name: /^2026/ })).toHaveTextContent('Year 2');
    expect(screen.queryByRole('columnheader', { name: /^2027/ })).not.toBeInTheDocument();
  });

  it('keeps years and calculated valuation unchanged across calendar years', () => {
    const onValuationContext = vi.fn();
    const view = render(table(saved, { readOnly: true, onValuationContext }));
    const before = onValuationContext.mock.lastCall?.[0];
    vi.setSystemTime(new Date('2029-01-10T12:00:00Z'));
    view.rerender(table(saved, { readOnly: true, onValuationContext }));
    expect(screen.getByRole('columnheader', { name: /^2025/ })).toHaveTextContent('Year 1');
    expect(onValuationContext.mock.lastCall?.[0]).toEqual(before);
    expect(revenueCell()).toHaveTextContent('120.00');
  });

  it('opens saved quarterly estimates without requiring browser-specific view settings', () => {
    render(table([{ year: 2025, quarter: 1, revenue: 30, netMargin: 10 }], { readOnly: true }));
    expect(screen.getByRole('columnheader', { name: /^2025 Q1/ })).toBeInTheDocument();
    expect(revenueCell()).toHaveTextContent('30.00');
  });

  it.each([true, false])('preserves a growth-only estimate when actuals for its year exist (readOnly=%s)', readOnly => {
    const onProjectionsChange = vi.fn();
    render(table([{ year: 2025, revenueGrowth: 10, netMargin: 10 }], {
      readOnly, analysisDate: '2026-01-01', onProjectionsChange,
      historicalData: [
        { year: 2024, revenue: 100, netIncome: 10 },
        { year: 2025, revenue: 200, netIncome: 20 },
      ],
    }));
    if (readOnly) expect(revenueCell()).toHaveTextContent('110.00');
    else expect(Number((within(revenueCell()).getByRole('textbox') as HTMLInputElement).value)).toBeCloseTo(110);
    expect(onProjectionsChange).not.toHaveBeenCalled();
  });

  it('shows later actuals separately without modifying the original estimate', () => {
    const onProjectionsChange = vi.fn();
    render(table(saved, { readOnly: true, onProjectionsChange,
      actualData: [{ year: 2025, revenue: 200 }],
    }));
    expect(revenueCell()).toHaveTextContent('120.00');
    const comparison = screen.getByText('Compare with actuals').closest<HTMLElement>('[class*="rounded"]')!;
    expect(within(comparison).getByText('120')).toBeInTheDocument();
    expect(within(comparison).getByText('200')).toBeInTheDocument();
    expect(within(comparison).getByText('66.67%')).toBeInTheDocument();
    expect(saved[0].revenue).toBe(120);
    expect(onProjectionsChange).not.toHaveBeenCalled();
  });

  it('excludes later quarters from historical TTM valuation and respects saved settings across browsers', () => {
    localStorage.setItem('ss-settings-history-test', JSON.stringify({ targetPE: 99, qGrowthMode: 'sequential' }));
    const onValuationContext = vi.fn();
    render(table([{ year: 2025, quarter: 1, earningsPerShare: 1 }], {
      readOnly: true, showQuarterly: true, onValuationContext,
      calculationSettings: { targetPE: 12, qGrowthMode: 'yoy' },
      quarterlyHistoricalData: [
        ...[2, 3, 4].map(quarter => ({ year: 2024, quarter, revenue: 10, netIncome: 1, earningsPerShare: 1 })),
        { year: 2026, quarter: 4, revenue: 999, netIncome: 999, earningsPerShare: 999 },
      ],
    }));
    expect(onValuationContext.mock.lastCall?.[0]).toMatchObject({
      targetPE: 12, rows: [expect.objectContaining({ year: 2025, quarter: 1, estimatedPrice: 48, mos: 380, isActual: false })],
    });
    expect(screen.getByDisplayValue('12')).toBeDisabled();
  });

  it('leaves the valuation unknown when original revenue or share data is missing', () => {
    const onValuationContext = vi.fn();
    render(table([{ year: 2025, revenueGrowth: 10, netMargin: 10 }], { readOnly: true, onValuationContext }));
    expect(onValuationContext.mock.lastCall?.[0].rows[0]).not.toHaveProperty('estimatedPrice');
    expect(onValuationContext.mock.lastCall?.[0].rows[0]).not.toHaveProperty('mos');
  });
});
