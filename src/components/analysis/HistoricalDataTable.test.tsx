import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { HistoricalDataTable, type HistoricalYear } from './HistoricalDataTable';

const allColumns = [
  'revenue', 'growth', 'ebit', 'ebit_growth', 'ebitda', 'ebitda_growth',
  'net_income', 'net_income_growth', 'dividend', 'eps', 'eps_growth',
  'gross_margin', 'operating_margin', 'net_margin', 'pe', 'ev', 'ev_ebit',
  'ev_ebitda', 'cagr_revenue', 'cagr_profit', 'debt',
];

function renderTable(data: HistoricalYear[], props: Record<string, unknown> = {}) {
  localStorage.setItem('hdt-settings-historical-test', JSON.stringify({ visibleColumns: allColumns }));
  return render(
    <LanguageProvider defaultLanguage="en">
      <HistoricalDataTable data={data} analysisId="historical-test" {...props} />
    </LanguageProvider>,
  );
}

function getRow(period: string) {
  const row = screen.getAllByRole('row').find(candidate =>
    within(candidate).queryAllByRole('cell')[0]?.textContent?.trim() === period,
  );
  if (!row) throw new Error(`Could not find historical period ${period}`);
  return row;
}

function getCell(period: string, headerLabel: string) {
  const headerIndex = screen.getAllByRole('columnheader').findIndex(header =>
    header.textContent?.includes(headerLabel),
  );
  if (headerIndex < 0) throw new Error(`Could not find column ${headerLabel}`);
  return within(getRow(period)).getAllByRole('cell')[headerIndex]?.textContent?.trim();
}

describe('HistoricalDataTable calculations', () => {
  beforeEach(() => localStorage.clear());

  it('calculates annual growth, P/E, EV, EV multiples, and net debt in reporting currency', () => {
    renderTable([
      { fiscal_year: 2024, revenue: 100, ebit: 10, ebitda: 20, net_income: 5, earnings_per_share: 2 },
      {
        fiscal_year: 2025, revenue: 125, ebit: 25, ebitda: 50, net_income: 10,
        earnings_per_share: 5, total_debt: 60, cash: 20,
      },
    ], { currentPrice: 100, priceFxRate: 2, sharesOutstanding: 1_000_000, currency: 'SEK' });

    expect(getCell('2025', 'Oms. tillväxt')).toContain('25%');
    expect(getCell('2025', 'EBIT tillväxt')).toContain('150%');
    expect(getCell('2025', 'EBITDA tillväxt')).toContain('150%');
    expect(getCell('2025', 'Vinsttillväxt')).toContain('100%');
    expect(getCell('2025', 'VPA tillväxt')).toContain('150%');
    expect(getCell('2025', 'P/E')).toBe('10.0x');
    // SEK 50m market cap + SEK 60m debt - SEK 20m cash.
    expect(getCell('2025', 'EV (MSEK)')).toBe('90');
    expect(getCell('2025', 'EV/EBIT')).toBe('3.6x');
    expect(getCell('2025', 'EV/EBITDA')).toBe('1.8x');
    expect(getCell('2025', 'Nettoskuld')).toBe('40');
  });

  it('calculates three-year revenue and profit CAGR and leaves unavailable periods blank', () => {
    renderTable([
      { fiscal_year: 2022, revenue: 100, net_income: 20 },
      { fiscal_year: 2023, revenue: 110, net_income: 22 },
      { fiscal_year: 2024, revenue: 121, net_income: 24.2 },
      { fiscal_year: 2025, revenue: 133.1, net_income: 26.62 },
    ]);

    expect(getCell('2025', 'CAGR Oms.')).toBe('10.0%');
    expect(getCell('2025', 'CAGR Vinst')).toBe('10.0%');
    expect(getCell('2023', 'CAGR Oms.')).toBe('—');
  });

  it('uses same-quarter prior year growth in YoY mode and previous-period growth in sequential mode', () => {
    renderTable([
      { fiscal_year: 2025, quarter: 1, revenue: 100 },
      { fiscal_year: 2025, quarter: 2, revenue: 110 },
      { fiscal_year: 2026, quarter: 1, revenue: 120 },
    ]);

    expect(getCell('2026 Q1', 'Oms. tillväxt')).toContain('20%');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sekv.' }), { button: 0 });
    expect(getCell('2026 Q1', 'Oms. tillväxt')).toContain('+9%');
  });

  it('uses TTM quarter values and applies adjustments to valuation multiples', () => {
    renderTable([
      { fiscal_year: 2025, quarter: 1, revenue: 25, ebit: 2, ebitda: 4, earnings_per_share: 1, total_debt: 50, cash: 10 },
      { fiscal_year: 2025, quarter: 2, revenue: 25, ebit: 3, ebitda: 5, earnings_per_share: 1, total_debt: 50, cash: 10 },
      { fiscal_year: 2025, quarter: 3, revenue: 25, ebit: 4, ebitda: 6, earnings_per_share: 1, total_debt: 50, cash: 10 },
      { fiscal_year: 2025, quarter: 4, revenue: 25, ebit: 5, ebitda: 5, earnings_per_share: 1, total_debt: 50, cash: 10 },
    ], {
      currentPrice: 100,
      priceFxRate: 2,
      sharesOutstanding: 1_000_000,
      adjustments: [
        { id: 'quarter-ebit', metric: 'ebit', year: 2025, quarter: 4, amount: 2 },
        { id: 'quarter-ebitda', metric: 'ebitda', year: 2025, quarter: 4, amount: 4 },
      ],
    });

    // TTM EBIT is 2+3+4+(5+2), EBITDA is 4+5+6+(5+4), and EV is 50+50-10.
    expect(getCell('2025 Q4', 'EV/EBIT')).toBe('5.6x *');
    expect(getCell('2025 Q4', 'EV/EBITDA')).toBe('3.8x *');
    expect(getCell('2025 Q4', 'P/E')).toBe('12.5x');
    expect(getCell('2025 Q4', 'EBIT (MSEK)')).toBe('7 *');
  });

  it('converts totals to per-share values and renders the empty state', () => {
    renderTable([{ fiscal_year: 2025, revenue: 100, ebit: 20 }], { sharesOutstanding: 2_000_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Totalt' }));
    expect(getCell('2025', 'Oms./aktie')).toBe('50.00');
    expect(getCell('2025', 'EBIT/aktie')).toBe('10.00');

    localStorage.clear();
    const { unmount } = render(
      <LanguageProvider defaultLanguage="en"><HistoricalDataTable data={[]} /></LanguageProvider>,
    );
    expect(screen.getByText('Ingen historisk data tillgänglig.')).toBeInTheDocument();
    unmount();
  });
});
