import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { ImportDialog } from './ImportDialog';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('Portfolio ImportDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  it('parses free text, previews normalized holdings, and imports only after confirmation', async () => {
    invoke.mockResolvedValue({
      data: { holdings: [{ company_name: 'Volvo', ticker: 'VOLV B', weight_percent: 30, value_sek: 30_000, price: 300, shares_count: 100 }] },
      error: null,
    });
    const onImport = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <LanguageProvider defaultLanguage="en">
        <ImportDialog open onOpenChange={onOpenChange} onImport={onImport} />
      </LanguageProvider>,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Free text/ }));
    const text = '30% Volvo, 70% funds';
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Parse with AI' }));

    await waitFor(() => expect(screen.getByText('Volvo')).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith('parse-portfolio-import', { body: { freeText: text } });
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add to portfolio' }));

    expect(onImport).toHaveBeenCalledWith([{
      company_name: 'Volvo', ticker: 'VOLV B', weight_percent: 30,
      value_sek: 30_000, price: 300, shares_count: 100,
      conviction: '', rationale: '', notes: '', future_plan: '',
    }]);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps parsing disabled until free text is provided and shows service errors', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Parser unavailable' } });
    render(
      <LanguageProvider defaultLanguage="en">
        <ImportDialog open onOpenChange={vi.fn()} onImport={vi.fn()} />
      </LanguageProvider>,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Free text/ }));
    const parseButton = screen.getByRole('button', { name: 'Parse with AI' });
    expect(parseButton).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Volvo 30%' } });
    expect(parseButton).toBeEnabled();
    fireEvent.click(parseButton);

    await waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith('Parser unavailable');
  });
});
