import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { ReportAnalyzer } from './ReportAnalyzer';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockSupabase = vi.mocked(supabase);

function renderReportAnalyzer(readOnly = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportAnalyzer companyId="company-1" analysisId="analysis-1" companyName="Storytel AB" readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

describe('ReportAnalyzer FI workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mockSupabase.from.mockReturnValue(query as never);
  });

  it('shows annual, quarterly and half-year reports by default and keeps manual PDF upload as a fallback', async () => {
    vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
      data: { reports: [{ id: '64361', period: '2026-09', kind: 'Quarterly report', language: 'English', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=64361' }] },
      error: null,
    } as never);

    renderReportAnalyzer();
    expect(screen.getByText('Manuell reserv')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sök rapporter hos FI' }));

    expect(await screen.findByRole('checkbox', { name: 'Rapporttyp Årsredovisning' })).toBeChecked();
    expect(await screen.findByText('2026-09')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Rapporttyp Kvartalsrapport (Q1/Q3)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Rapporttyp Halvårsrapport (Q2)' })).toBeChecked();
    expect(screen.getByText('Kvartals- och halvårsrapporter')).toBeInTheDocument();
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('fi-reports', {
      body: { action: 'search', companyName: 'Storytel AB' },
    });
  });

  it('fetches and displays FI short-selling data for the company', async () => {
    vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
      data: {
        shortSelling: {
          found: true,
          issuerName: 'Storytel AB',
          totalPercentage: 1.25,
          latestPositionDate: '2026-10-30',
          positions: [{
            holder: 'Example Fund',
            isin: 'SE0000000001',
            percentage: 0.75,
            positionDate: '2026-10-30',
            previousPercentage: 0.7,
          }],
          historicalPositions: [],
          sourceUrl: 'https://www.fi.se/example',
        },
      },
      error: null,
    } as never);

    renderReportAnalyzer();
    fireEvent.click(screen.getByRole('button', { name: 'Hämta blankning från FI' }));

    expect(await screen.findByText('Summa blankning:')).toBeInTheDocument();
    expect(screen.getByText('1,25%')).toBeInTheDocument();
    expect(screen.getByText('Example Fund')).toBeInTheDocument();
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('fi-reports', {
      body: { action: 'short-positions', companyName: 'Storytel AB' },
    });
  });

  it('hides year-end releases by default and shows them when selected', async () => {
    const reports = [
      { id: 'annual', period: '2025', kind: 'Annual report', language: 'Swedish', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=1' },
      { id: 'year-end', period: '2025', kind: 'Year-end release', language: 'Swedish', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=2' },
    ];
    vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
      data: { reports },
      error: null,
    } as never);

    renderReportAnalyzer();
    fireEvent.click(screen.getByRole('button', { name: 'Sök rapporter hos FI' }));

    expect(await screen.findByRole('checkbox', {
      name: 'Välj 2025 Annual report Swedish',
    })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', {
      name: 'Välj 2025 Year-end release Swedish',
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Rapporttyp Bokslutskommuniké (Q4)' }));
    expect(screen.getByRole('checkbox', {
      name: 'Välj 2025 Year-end release Swedish',
    })).toBeInTheDocument();
    expect(screen.getByText('Bokslutskommunikéer (Q4)')).toBeInTheDocument();
  });

  it('filters bilingual editions while keeping one available language per report by default', async () => {
    const reports = [
      { id: 'annual-sv', period: '2025', kind: 'Annual report', language: 'Swedish', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=1' },
      { id: 'annual-en', period: '2025', kind: 'Annual report', language: 'English', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=2' },
      { id: 'quarter-en', period: '2025-09', kind: 'Quarterly report', language: 'English', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=3' },
    ];
    vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({
      data: { reports },
      error: null,
    } as never);

    renderReportAnalyzer();
    fireEvent.click(screen.getByRole('button', { name: 'Sök rapporter hos FI' }));

    expect(await screen.findByRole('checkbox', {
      name: 'Välj 2025 Annual report Swedish',
    })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', {
      name: 'Välj 2025 Annual report English',
    })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', {
      name: 'Välj 2025-09 Quarterly report English',
    })).toBeInTheDocument();

    const languageFilter = screen.getByRole('combobox', { name: 'Filtrera rapporter efter språk' });
    fireEvent.change(languageFilter, { target: { value: 'English' } });
    expect(screen.getByRole('checkbox', {
      name: 'Välj 2025 Annual report English',
    })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', {
      name: 'Välj 2025 Annual report Swedish',
    })).not.toBeInTheDocument();

    fireEvent.change(languageFilter, { target: { value: 'all' } });
    expect(screen.getByRole('checkbox', {
      name: 'Välj 2025 Annual report Swedish',
    })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', {
      name: 'Välj 2025 Annual report English',
    })).toBeInTheDocument();
  });

  it('explains the manual fallback when FI has no report for the company', async () => {
    vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({ data: { reports: [] }, error: null } as never);

    renderReportAnalyzer();
    fireEvent.click(screen.getByRole('button', { name: 'Sök rapporter hos FI' }));

    expect(await screen.findByText('Ingen rapport hittades hos FI. Ladda upp PDF:en manuellt nedan.')).toBeInTheDocument();
    expect(screen.getByText('Ladda upp rapporter som PDF')).toBeInTheDocument();
  });

  it('shows an FI connection error instead of reporting that no filing exists', async () => {
    vi.mocked(mockSupabase.functions.invoke).mockResolvedValue({ data: null, error: new Error('Failed to fetch') } as never);

    renderReportAnalyzer();
    fireEvent.click(screen.getByRole('button', { name: 'Sök rapporter hos FI' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch Ladda upp PDF:en manuellt nedan.');
    expect(screen.queryByText('Ingen rapport hittades hos FI. Ladda upp PDF:en manuellt nedan.')).not.toBeInTheDocument();
  });

  it('imports a selected FI report into the report library and marks it for analysis', async () => {
    vi.mocked(mockSupabase.functions.invoke).mockImplementation(async (_name, options) => {
      const body = options?.body as { action: string };
      if (body.action === 'search') {
        return {
          data: { reports: [{ id: '64361', period: '2026-09', kind: 'Quarterly report', language: 'English', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=64361' }] },
          error: null,
        } as never;
      }
      if (body.action === 'download') {
        const pdf = new TextEncoder().encode('%PDF-1.7').buffer;
        return { data: { arrayBuffer: async () => pdf }, error: null } as never;
      }
      return { data: { document: { id: 'document-1', file_name: 'Storytel AB - 2026-09 Quarterly report (English).pdf' } }, error: null } as never;
    });

    renderReportAnalyzer();
    fireEvent.click(screen.getByRole('button', { name: 'Sök rapporter hos FI' }));
    fireEvent.click(await screen.findByRole('checkbox', {
      name: 'Välj 2026-09 Quarterly report English',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Hämta valda rapporter (1)' }));

    await waitFor(() => expect(mockSupabase.functions.invoke).toHaveBeenLastCalledWith('fi-reports', {
      body: {
        action: 'import',
        reportId: '64361',
        period: '2026-09',
        kind: 'Quarterly report',
        language: 'English',
        companyId: 'company-1',
        analysisId: 'analysis-1',
        companyName: 'Storytel AB',
      },
    }));
  });

  it('imports multiple selected FI reports and marks them for analysis', async () => {
    const reports = [
      { id: 'quarter-1', period: '2026-09', kind: 'Quarterly report', language: 'English', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=1' },
      { id: 'quarter-2', period: '2026-06', kind: 'Quarterly report', language: 'Swedish', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=2' },
    ];
    vi.mocked(mockSupabase.functions.invoke).mockImplementation(async (_name, options) => {
      const body = options?.body as { action: string; reportId?: string };
      if (body.action === 'search') return { data: { reports }, error: null } as never;
      if (body.action === 'download') {
        const pdf = new TextEncoder().encode('%PDF-1.7').buffer;
        return { data: { arrayBuffer: async () => pdf }, error: null } as never;
      }
      return {
        data: { document: { id: `document-${body.reportId}` } },
        error: null,
      } as never;
    });

    renderReportAnalyzer();
    fireEvent.click(screen.getByRole('button', { name: 'Sök rapporter hos FI' }));
    fireEvent.click(await screen.findByRole('checkbox', {
      name: 'Välj 2026-09 Quarterly report English',
    }));
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'Välj 2026-06 Quarterly report Swedish',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Hämta valda rapporter (2)' }));

    await waitFor(() => {
      const importCalls = vi.mocked(mockSupabase.functions.invoke).mock.calls.filter(([, options]) =>
        (options?.body as { action?: string } | undefined)?.action === 'import'
      );
      expect(importCalls).toHaveLength(2);
    });
  });

  it('hides report fetching and manual upload in read-only mode', () => {
    renderReportAnalyzer(true);
    expect(screen.queryByRole('button', { name: 'Sök rapporter hos FI' })).not.toBeInTheDocument();
    expect(screen.queryByText('Manuell reserv')).not.toBeInTheDocument();
  });
});
