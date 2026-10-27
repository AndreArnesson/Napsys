import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NapkinCalculation, type NapkinAssumption } from './NapkinCalculation';

vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: { mos: { undervalued: 'Undervalued', fair: 'Fair', overvalued: 'Overvalued' } } }),
}));

describe('NapkinCalculation', () => {
  it('calculates profit, market cap, fair price and margin of safety', () => {
    render(
      <NapkinCalculation
        currentPrice={100}
        sharesOutstanding={10_000_000}
        assumptions={[{ year: 2028, revenue: 1000, netMargin: 10, peTarget: 15 }]}
        onAssumptionsChange={vi.fn()}
      />,
    );

    expect(screen.getByText('100 M')).toBeInTheDocument();
    expect(screen.getByText('1.50 Mdr')).toBeInTheDocument();
    expect(screen.getByText('150.00 SEK')).toBeInTheDocument();
    expect(screen.getByText('+33.3%')).toBeInTheDocument();
  });

  it('seeds a default assumption when none are provided', () => {
    render(
      <NapkinCalculation
        currentPrice={10}
        sharesOutstanding={1_000_000}
        latestRevenue={500}
        latestNetMargin={0.12}
        assumptions={[]}
        onAssumptionsChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue(String(new Date().getFullYear() + 3))).toBeInTheDocument();
    expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12')).toBeInTheDocument();
  });

  it('adds a year using the previous row assumptions', () => {
    const onChange = vi.fn<(assumptions: NapkinAssumption[]) => void>();
    render(
      <NapkinCalculation
        currentPrice={10}
        sharesOutstanding={1_000_000}
        assumptions={[{ year: 2028, revenue: 500, netMargin: 12, peTarget: 16 }]}
        onAssumptionsChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lägg till år' }));
    expect(onChange).toHaveBeenCalledWith([
      { year: 2028, revenue: 500, netMargin: 12, peTarget: 16 },
      { year: 2029, revenue: 500, netMargin: 12, peTarget: 16 },
    ]);
  });

  it('shows a prompt instead of MoS when price or share count is invalid', () => {
    render(
      <NapkinCalculation
        currentPrice={0}
        sharesOutstanding={0}
        assumptions={[{ year: 2028, revenue: 100, netMargin: 10, peTarget: 15 }]}
        onAssumptionsChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Fyll i kurs och antal aktier i sidopanelen för att räkna ut MoS.')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
