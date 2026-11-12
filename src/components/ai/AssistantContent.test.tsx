import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { AssistantContentRenderer as AssistantContent } from './AssistantContentRenderer';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('AssistantContent', () => {
  it('renders headings, emphasis, nested lists and a keyboard-accessible table from Markdown', () => {
    render(<LanguageProvider defaultLanguage="en"><AssistantContent content={`A **short conclusion**.

### Assumptions

- Growth: 10%
  - Based on the latest report

1. Review the estimate
2. Compare scenarios

| Year | Revenue (MSEK) |
| --- | ---: |
| 2027 | 120 |
| 2028 | 135 |`} /></LanguageProvider>);
    expect(screen.getByText('short conclusion').tagName).toBe('STRONG');
    expect(screen.getByRole('heading', { name: 'Assumptions', level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(3);
    const region = screen.getByRole('region', { name: 'Table in the AI answer' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('overflow-x-auto');
    expect(within(region).getByRole('columnheader', { name: 'Revenue (MSEK)' })).toBeInTheDocument();
    expect(within(region).getByRole('cell', { name: '135' })).toBeInTheDocument();
  });

  it('connects each citation to the source in its own answer, including sources without a URL', () => {
    const sources = [{ id: 'A1', label: 'Saved analysis', url: '/company/company-1/analysis/analysis-1' }];
    render(<LanguageProvider defaultLanguage="en">
      <AssistantContent content="First conclusion [A1]." sources={sources} />
      <AssistantContent content="Second conclusion [A1] and [V0]. Unknown [A99]." sources={[...sources, { id: 'V0', label: 'Current valuation' }]} />
    </LanguageProvider>);
    const references = screen.getAllByRole('link', { name: 'Show source [A1]: Saved analysis' });
    expect(references[0].getAttribute('href')).not.toBe(references[1].getAttribute('href'));
    fireEvent.click(references[1]);
    const source = document.getElementById(references[1].getAttribute('href')!.slice(1));
    expect(source).toHaveFocus();
    expect(within(source!).getByRole('link')).toHaveAttribute('href', sources[0].url);
    fireEvent.click(screen.getByRole('link', { name: 'Show source [V0]: Current valuation' }));
    expect(document.activeElement).toHaveTextContent('[V0] Current valuation');
    expect(screen.queryByRole('link', { name: /A99/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Unknown \[A99\]/)).toBeInTheDocument();
  });

  it('leaves citations inside code and existing links untouched', () => {
    const { container } = render(<LanguageProvider defaultLanguage="en"><AssistantContent
      sources={[{ id: 'A1', label: 'Analysis' }]}
      content={'Use `[A1]` literally. [Existing [A1]](https://example.com)\n\n```text\n[A1]\n```\n\nActual source **[A1]**.'}
    /></LanguageProvider>);
    expect(screen.getAllByRole('link', { name: 'Show source [A1]: Analysis' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Existing [A1]' })).toHaveAttribute('href', 'https://example.com/');
    expect(container.querySelector('code a')).toBeNull();
    expect(container.querySelector('a a')).toBeNull();
  });

  it('keeps HTML as text in chat and blocks unsafe links and remote images', () => {
    const { container } = render(<LanguageProvider defaultLanguage="en"><AssistantContent content={
      '<img src=x onerror=alert(1)>\n\n[Unsafe](javascript:alert%281%29) [Data](data:text/html,hello) [Relative](//example.com)\n\n![Tracking image](https://example.com/pixel.png)\n\n[External](https://example.com/report) [Company](/company/company-1)'
    } /></LanguageProvider>);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img, script, iframe')).toBeNull();
    for (const name of ['Unsafe', 'Data', 'Relative']) expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    expect(screen.getByText('Tracking image')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'External' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'External' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Company' })).not.toHaveAttribute('target');
  });

  it('preserves legacy summary HTML while removing executable content, styles and unsafe URLs', () => {
    const { container } = render(<LanguageProvider defaultLanguage="en"><AssistantContent allowHtml content={
      '<h3>Financial summary</h3><p style="position:fixed" onclick="alert(1)">Revenue <strong>grew 10%</strong>.</p><ul><li>Improved margin</li></ul><script>alert(1)</script><iframe src="https://example.com"></iframe><img src="https://example.com/pixel.png" onerror="alert(1)"><a href="javascript:alert(1)">Unsafe</a>'
    } /></LanguageProvider>);
    expect(screen.getByRole('heading', { name: 'Financial summary' })).toBeInTheDocument();
    expect(screen.getByText('grew 10%').tagName).toBe('STRONG');
    expect(screen.getByRole('listitem')).toHaveTextContent('Improved margin');
    expect(container.querySelector('script, iframe, img, [onclick], [style]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('alert(1)');
  });

  it('localizes table and citation labels in Swedish', () => {
    render(<LanguageProvider defaultLanguage="sv"><AssistantContent
      content={'Slutsats [C1].\n\n| År | Värde |\n| --- | --- |\n| 2027 | 10 |'}
      sources={[{ id: 'C1', label: 'Bolagskort' }]}
    /></LanguageProvider>);
    expect(screen.getByRole('region', { name: 'Tabell i AI-svaret' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visa underlag [C1]: Bolagskort' })).toBeInTheDocument();
    expect(screen.getByText('Underlag')).toBeInTheDocument();
  });
});
