import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { AdjustmentsEditor } from './AdjustmentsEditor';
import { EstimatesEditor, type EstimateRow } from './EstimatesEditor';

describe('EstimatesEditor workflows', () => {
  beforeEach(() => localStorage.clear());

  it('adds the next yearly estimate and preserves read-only history', () => {
    const onChange = vi.fn();
    const currentYear = new Date().getFullYear();
    render(
      <LanguageProvider defaultLanguage="en">
        <EstimatesEditor
          historicalData={[{ year: currentYear - 1, revenue: 80, ebit: 8 }]}
          estimates={[{ year: currentYear, revenue: 100, ebit: 15 }]}
          onChange={onChange}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('15.0%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Year' }));
    expect(onChange).toHaveBeenCalledWith([
      { year: currentYear, revenue: 100, ebit: 15 },
      { year: currentYear + 1, isProjection: true },
    ]);
  });

  it('parses comma decimals and recomputes the estimate margin', () => {
    function StatefulEstimates() {
      const [estimates, setEstimates] = useState<EstimateRow[]>([
        { year: 2027, revenue: 100, ebit: 10 },
      ]);
      return <EstimatesEditor estimates={estimates} onChange={setEstimates} />;
    }

    render(<LanguageProvider defaultLanguage="en"><StatefulEstimates /></LanguageProvider>);
    fireEvent.change(screen.getByPlaceholderText('EBIT'), { target: { value: '12,5' } });
    expect(screen.getByText('12.5%')).toBeInTheDocument();
  });

  it('adds the next quarter after switching to quarterly mode', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider defaultLanguage="en">
        <EstimatesEditor estimates={[{ year: 2027, quarter: 4 }]} onChange={onChange} />
      </LanguageProvider>,
    );

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Quarter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Quarter' }));

    expect(onChange).toHaveBeenCalledWith([
      { year: 2027, quarter: 4 },
      { year: 2028, quarter: 1, isProjection: true },
    ]);
  });
});

describe('AdjustmentsEditor workflows', () => {
  beforeEach(() => localStorage.clear());

  it('adds, edits, and removes an adjustment', () => {
    const onChange = vi.fn();
    render(<AdjustmentsEditor adjustments={[]} onAdjustmentsChange={onChange} currency="SEK" />);

    fireEvent.click(screen.getByRole('button', { name: /Engångsjusteringar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till justering' }));
    const currentYear = new Date().getFullYear();
    const added = onChange.mock.lastCall?.[0];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ description: '', amount: 0, metric: 'ebit', year: currentYear });
    expect(added[0].id).toEqual(expect.any(String));

    const adjustment = { id: 'adjustment-1', description: 'One-time cost', amount: 2, metric: 'ebit' as const, year: 2025 };
    const view = render(<AdjustmentsEditor adjustments={[adjustment]} onAdjustmentsChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('One-time cost'), { target: { value: 'Restructuring' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...adjustment, description: 'Restructuring' }]);

    const row = screen.getByDisplayValue('One-time cost').closest('tr');
    if (!row) throw new Error('Adjustment row not found');
    fireEvent.click(within(row).getAllByRole('button').at(-1)!);
    expect(onChange).toHaveBeenLastCalledWith([]);
    view.unmount();
  });
});
