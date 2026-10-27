import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { InvestmentHoldings, type InvestmentHolding } from './InvestmentHoldings';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function HoldingsHarness() {
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([
    { id: 'alpha', name: 'Alpha', weight_percent: 25 },
    { id: 'beta', name: 'Beta', weight_percent: 75 },
  ]);
  return <InvestmentHoldings holdings={holdings} onHoldingsChange={setHoldings} companyName="Parent" />;
}

describe('InvestmentHoldings workflows', () => {
  it('updates a holding, sorts by allocation, and reports total weight', () => {
    render(<LanguageProvider><HoldingsHarness /></LanguageProvider>);

    expect(screen.getByText('(100.0%)')).toBeInTheDocument();
    const nameInputs = screen.getAllByPlaceholderText('Namn') as HTMLInputElement[];
    fireEvent.change(nameInputs[0], { target: { value: 'Alpha Group' } });
    expect((screen.getAllByPlaceholderText('Namn')[0] as HTMLInputElement).value).toBe('Alpha Group');

    fireEvent.click(screen.getByRole('button', { name: 'Sortera på andel' }));
    expect((screen.getAllByPlaceholderText('Namn')[0] as HTMLInputElement).value).toBe('Beta');
    expect((screen.getAllByPlaceholderText('Namn')[1] as HTMLInputElement).value).toBe('Alpha Group');
  });

  it('removes a selected holding and hides edit controls in read-only mode', () => {
    const onHoldingsChange = vi.fn();
    const holdings: InvestmentHolding[] = [
      { id: 'alpha', name: 'Alpha', weight_percent: 25 },
      { id: 'beta', name: 'Beta', weight_percent: 75 },
    ];
    const { rerender } = render(
      <LanguageProvider><InvestmentHoldings holdings={holdings} onHoldingsChange={onHoldingsChange} /></LanguageProvider>,
    );

    const betaInput = screen.getByDisplayValue('Beta');
    const betaRow = betaInput.closest('tr');
    if (!betaRow) throw new Error('Holding row not found');
    fireEvent.click([...betaRow.querySelectorAll('button')].pop()!);
    expect(onHoldingsChange).toHaveBeenCalledWith([holdings[0]]);

    rerender(<LanguageProvider><InvestmentHoldings holdings={holdings} onHoldingsChange={onHoldingsChange} readOnly /></LanguageProvider>);
    expect(screen.queryByRole('button', { name: 'Lägg till post' })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Alpha')).toBeDisabled();
  });
});
