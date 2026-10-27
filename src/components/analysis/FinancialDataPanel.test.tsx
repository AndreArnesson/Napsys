import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { FinancialDataPanel } from './FinancialDataPanel';

function getPeriodRow(period: string) {
  return screen.queryAllByText(period).find(element => element.closest('tr'))?.closest('tr') ?? null;
}

describe('FinancialDataPanel', () => {
  it('shows yearly financials, formats margins, and calculates revenue growth', () => {
    render(
      <LanguageProvider defaultLanguage="sv">
        <FinancialDataPanel
          currency="SEK"
          yearlyData={[
            { period: '2024', year: 2024, revenue: 100, ebit: 20, operatingMargin: 0.2 },
            { period: '2025', year: 2025, revenue: 150, ebit: 30, operatingMargin: 0.2 },
          ]}
          quarterlyData={[]}
        />
      </LanguageProvider>,
    );

    expect(getPeriodRow('2024')).not.toBeNull();
    const currentYearRow = getPeriodRow('2025');
    expect(currentYearRow).not.toBeNull();
    expect(within(currentYearRow!).getByText('+50%')).toBeInTheDocument();
    expect(within(currentYearRow!).getByText('20.0%')).toBeInTheDocument();
    expect(within(currentYearRow!).getByText(/150/)).toBeInTheDocument();
  });

  it('switches to quarterly values and leaves missing metrics blank', () => {
    render(
      <LanguageProvider defaultLanguage="en">
        <FinancialDataPanel
          quarterlyData={[
            { period: 'Q1 2026', year: 2026, quarter: 1, revenue: 25, operatingMargin: 0.12 },
            { period: 'Q2 2026', year: 2026, quarter: 2, revenue: 20 },
          ]}
          yearlyData={[{ period: '2025', year: 2025, revenue: 90, ebit: 18, operatingMargin: 0.2 }]}
        />
      </LanguageProvider>,
    );

    expect(getPeriodRow('Q1 2026')).toBeNull();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Quarter' }));

    expect(getPeriodRow('Q1 2026')).not.toBeNull();
    expect(getPeriodRow('Q2 2026')).not.toBeNull();
    const secondQuarterRow = getPeriodRow('Q2 2026');
    expect(within(secondQuarterRow!).getAllByText('—')).toHaveLength(2);
  });

  it('shows negative growth and keeps unavailable metrics blank', () => {
    render(
      <LanguageProvider defaultLanguage="en">
        <FinancialDataPanel
          yearlyData={[
            { period: '2024', year: 2024, revenue: 100 },
            { period: '2025', year: 2025, revenue: 80 },
          ]}
          quarterlyData={[]}
        />
      </LanguageProvider>,
    );

    const currentYearRow = getPeriodRow('2025');
    expect(currentYearRow).not.toBeNull();
    expect(within(currentYearRow!).getByText('-20%')).toBeInTheDocument();
    expect(within(currentYearRow!).getAllByText('—')).toHaveLength(2);
  });
});
