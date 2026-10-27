import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { SpreadsheetAnalysis } from './SpreadsheetAnalysis';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function getProjectionValue(rowLabel: string) {
  const row = screen.getByText(rowLabel).closest('tr');
  if (!row) throw new Error(`Could not find table row: ${rowLabel}`);
  return within(row).getAllByRole('cell').at(-2)?.textContent?.trim();
}

function getProjectionInputValue(rowLabel: string) {
  const row = screen.getByText(rowLabel).closest('tr');
  if (!row) throw new Error(`Could not find table row: ${rowLabel}`);
  const input = within(row).getAllByRole('textbox').at(-1) as HTMLInputElement | undefined;
  return input?.value;
}

function QuarterConversionHarness({ year }: { year: number }) {
  const [projections, setProjections] = useState([
    { year, quarter: 1, revenue: 25 },
    { year, quarter: 2, revenue: 30 },
    { year, quarter: 3, revenue: 35 },
    { year, quarter: 4, revenue: 30 },
    { year, revenue: 999, revenueGrowth: 0 },
  ]);

  return (
    <LanguageProvider defaultLanguage="en">
      <SpreadsheetAnalysis
        currentPrice={28.7}
        sharesOutstanding={15_000_000}
        analysisId="quarter-conversion-test"
        currency="SEK"
        historicalData={[{ year: year - 1, revenue: 100 }]}
        projections={projections}
        onProjectionsChange={setProjections}
        showQuarterly
      />
    </LanguageProvider>
  );
}

describe('SpreadsheetAnalysis valuation multiples', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ss-settings-valuation-test', JSON.stringify({
      visibleRows: [
        'price', 'revenueGrowth', 'revenue', 'ebit', 'netIncome', 'ebitda',
        'netMargin', 'ebitMargin', 'ebitdaMargin', 'earningsPerShare', 'dividend',
        'dividendYield', 'pe', 'ev', 'evEbit', 'evEbitda', 'targetPE', 'estimatedPrice',
        'mos', 'adjustedEbit', 'adjustedEbitda', 'adjustedNetIncome',
        'adjustedEbitMargin', 'adjustedEvEbit', 'adjustedEvEbitda',
      ],
    }));
  });

  it('calculates P/E, EV multiples, adjusted multiples and dividend yield in reporting currency', () => {
    const onProjectionsChange = vi.fn();
    const year = new Date().getFullYear() + 1;
    render(
      <LanguageProvider defaultLanguage="en">
        <SpreadsheetAnalysis
          currentPrice={100}
          sharesOutstanding={1_000_000}
          analysisId="valuation-test"
          currency="SEK"
          tradingCurrency="USD"
          priceFxRate={2}
          netDebt={10}
          projections={[{
            year,
            revenue: 100,
            netMargin: 10,
            ebit: 5,
            ebitda: 10,
            dividend: 2,
          }]}
          adjustments={[
            { id: 'ebit-adjustment', description: 'One-off costs', year, metric: 'ebit', amount: 2 },
            { id: 'ebitda-adjustment', description: 'One-off costs', year, metric: 'ebitda', amount: 1 },
          ]}
          onProjectionsChange={onProjectionsChange}
        />
      </LanguageProvider>,
    );

    // $100 at 2 USD per SEK is SEK 50. Market cap is SEK 50m; adding SEK 10m net debt gives EV of SEK 60m.
    expect(getProjectionValue('P/E')).toBe('5.0');
    expect(getProjectionValue('EV/EBIT')).toBe('12.00');
    expect(getProjectionValue('EV/EBITDA')).toBe('6.00');
    expect(getProjectionValue('Justerad EBIT (MSEK)')).toBe('7.00');
    expect(getProjectionValue('Justerad EBITDA (MSEK)')).toBe('11.00');
    expect(getProjectionValue('Just. EV/EBIT')).toBe('8.57');
    expect(getProjectionValue('Just. EV/EBITDA')).toBe('5.45');
    expect(getProjectionValue('Estimerad kurs (USD)')).toBe('300.00');
    expect(getProjectionValue('MOS (%)')).toBe('+200.00%');
  });

  it('uses 1:1 conversion when trading and reporting currencies are the same', () => {
    const year = new Date().getFullYear() + 1;
    render(
      <LanguageProvider defaultLanguage="en">
        <SpreadsheetAnalysis
          currentPrice={100}
          sharesOutstanding={1_000_000}
          analysisId="valuation-test"
          currency="SEK"
          tradingCurrency="SEK"
          netDebt={0}
          projections={[{ year, revenue: 100, netMargin: 10, ebit: 10, ebitda: 20 }]}
          onProjectionsChange={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(getProjectionValue('P/E')).toBe('10.0');
    expect(getProjectionValue('EV/EBIT')).toBe('10.00');
    expect(getProjectionValue('EV/EBITDA')).toBe('5.00');
  });

  it('converts valuation metrics consistently at a non-SEK exchange rate', () => {
    const year = new Date().getFullYear() + 1;
    render(
      <LanguageProvider defaultLanguage="en">
        <SpreadsheetAnalysis
          currentPrice={90}
          sharesOutstanding={2_000_000}
          analysisId="valuation-test"
          currency="SEK"
          tradingCurrency="EUR"
          priceFxRate={1.5}
          netDebt={30}
          projections={[{
            year, revenue: 100, earningsPerShare: 6, ebit: 15, ebitda: 30,
            targetPE: 12, dividend: 3,
          }]}
          onProjectionsChange={vi.fn()}
        />
      </LanguageProvider>,
    );

    // €90 / 1.5 = SEK 60. Market cap is SEK 120m and EV is SEK 150m.
    expect(getProjectionValue('P/E')).toBe('10.0');
    expect(getProjectionValue('EV/EBIT')).toBe('10.00');
    expect(getProjectionValue('EV/EBITDA')).toBe('5.00');
    expect(getProjectionValue('Estimerad kurs (EUR)')).toBe('108.00');
    expect(getProjectionValue('MOS (%)')).toBe('+20.00%');
    expect(getProjectionInputValue('Direktavkastning (%)')).toBe('5');
  });

  it('derives EBIT, EBITDA, profit, and EPS from revenue and margin assumptions', () => {
    const year = new Date().getFullYear() + 1;
    render(
      <LanguageProvider defaultLanguage="en">
        <SpreadsheetAnalysis
          currentPrice={100}
          sharesOutstanding={2_000_000}
          analysisId="valuation-test"
          currency="SEK"
          projections={[{ year, revenue: 200, ebitMargin: 15, ebitdaMargin: 25, netMargin: 10 }]}
          onProjectionsChange={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(getProjectionInputValue('EBIT (MSEK)')).toBe('30');
    expect(getProjectionInputValue('EBITDA (MSEK)')).toBe('50');
    expect(getProjectionInputValue('Vinst (MSEK)')).toBe('20');
    expect(getProjectionInputValue('Vinst/aktie (SEK)')).toBe('10');
    expect(getProjectionValue('P/E')).toBe('10.0');
  });

  it('uses TTM EPS, EBIT, and EBITDA for quarterly valuation multiples', () => {
    const year = new Date().getFullYear();
    render(
      <LanguageProvider defaultLanguage="en">
        <SpreadsheetAnalysis
          currentPrice={100}
          sharesOutstanding={1_000_000}
          analysisId="valuation-test"
          currency="SEK"
          netDebt={0}
          showQuarterly
          projections={[
            { year, quarter: 1, earningsPerShare: 1, ebit: 2, ebitda: 4 },
            { year, quarter: 2, earningsPerShare: 2, ebit: 3, ebitda: 5 },
            { year, quarter: 3, earningsPerShare: 3, ebit: 4, ebitda: 6 },
            { year, quarter: 4, earningsPerShare: 4, ebit: 5, ebitda: 7 },
          ]}
          onProjectionsChange={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(getProjectionValue('P/E')).toBe('10.0');
    expect(getProjectionValue('EV/EBIT')).toBe('7.14');
    expect(getProjectionValue('EV/EBITDA')).toBe('4.55');
    expect(getProjectionValue('Estimerad kurs (SEK)')).toBe('150.00');
    expect(getProjectionValue('MOS (%)')).toBe('+50.00%');
  });

  it('supports YoY and sequential quarterly revenue growth baselines', () => {
    const year = new Date().getFullYear();
    render(
      <LanguageProvider defaultLanguage="en">
        <SpreadsheetAnalysis
          currentPrice={100}
          sharesOutstanding={1_000_000}
          analysisId="quarterly-growth-test"
          currency="SEK"
          quarterlyHistoricalData={[
            { year: year - 1, quarter: 1, revenue: 100 },
            { year: year - 1, quarter: 4, revenue: 110 },
          ]}
          projections={[{ year, quarter: 1, revenue: 120 }]}
          onProjectionsChange={vi.fn()}
          showQuarterly
        />
      </LanguageProvider>,
    );

    expect(getProjectionInputValue('Omsättningstillv (%)')).toBe('20');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sekventiell' }));
    expect(Number(getProjectionInputValue('Omsättningstillv (%)'))).toBeCloseTo(9.09, 2);
  });

  it('uses the prior completed year as the baseline for a current-year zero-growth forecast', () => {
    const currentYear = new Date().getFullYear();
    render(
      <LanguageProvider defaultLanguage="en">
        <SpreadsheetAnalysis
          currentPrice={28.7}
          sharesOutstanding={15_000_000}
          analysisId="current-year-growth-test"
          currency="SEK"
          historicalData={[
            { year: currentYear - 1, revenue: 152.03 },
            // Some imported data sources include a current-year estimate in the
            // historical financials table. It must not override the forecast.
            { year: currentYear, revenue: 164.89 },
          ]}
          projections={[{ year: currentYear, revenueGrowth: 0 }]}
          onProjectionsChange={vi.fn()}
        />
      </LanguageProvider>,
    );

    const growthRow = screen.getByText('Omsättningstillv (%)').closest('tr');
    const revenueRow = screen.getByText('Omsättning (MSEK)').closest('tr');
    if (!growthRow || !revenueRow) throw new Error('Could not find forecast rows');

    expect((within(growthRow).getByRole('textbox') as HTMLInputElement).value).toBe('0');
    expect((within(revenueRow).getByRole('textbox') as HTMLInputElement).value).toBe('152.03');
  });

  it('recalculates annual revenue growth after converting quarterly revenue totals', async () => {
    const year = new Date().getFullYear();
    render(<QuarterConversionHarness year={year} />);

    fireEvent.click(screen.getByRole('button', { name: /Översätt kvartal till helårsbasis/i }));

    await waitFor(() => {
      const growthRow = screen.getByText('Omsättningstillv (%)').closest('tr');
      const revenueRow = screen.getByText('Omsättning (MSEK)').closest('tr');
      if (!growthRow || !revenueRow) throw new Error('Could not find yearly forecast rows');

      expect((within(growthRow).getByRole('textbox') as HTMLInputElement).value).toBe('20');
      expect((within(revenueRow).getByRole('textbox') as HTMLInputElement).value).toBe('120');
    });
  });
});
