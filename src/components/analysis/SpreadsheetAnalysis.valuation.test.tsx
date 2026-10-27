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
