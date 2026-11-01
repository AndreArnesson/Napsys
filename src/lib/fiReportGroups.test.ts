import { describe, expect, it } from 'vitest';
import type { FiReport } from './fiReports';
import {
  filterFiReportsByKind,
  filterFiReportsByLanguage,
  getFiReportKey,
  groupFiReportsByYear,
} from './fiReportGroups';

const report = (overrides: Partial<FiReport>): FiReport => ({
  id: 'report',
  period: '2026-09',
  kind: 'Quarterly report',
  language: 'English',
  url: 'https://example.test/report',
  ...overrides,
});

describe('groupFiReportsByYear', () => {
  it('groups annual and quarterly filings by descending year', () => {
    const result = groupFiReportsByYear([
      report({ id: 'quarter', period: '2026-09', kind: 'Quarterly report' }),
      report({ id: 'annual', period: '2025', kind: 'Annual report' }),
      report({ id: 'half', period: '2026-06', kind: 'Half-year report' }),
      report({ id: 'year-end', period: '2025-12', kind: 'Year-end release' }),
    ]);

    expect(result.map((group) => group.year)).toEqual(['2026', '2025']);
    expect(result[0].quarterly.map((item) => item.id)).toEqual(['quarter', 'half']);
    expect(result[1].annual.map((item) => item.id)).toEqual(['annual']);
    expect(result[1].yearEnd.map((item) => item.id)).toEqual(['year-end']);
  });

  it('uses a stable unique key for each language edition', () => {
    expect(getFiReportKey(report({ id: '123', language: 'Swedish' }))).toBe('123-Swedish');
    expect(getFiReportKey(report({ id: '123', language: 'English' }))).toBe('123-English');
  });
});

describe('filterFiReportsByLanguage', () => {
  const bilingual = [
    report({ id: 'q1-en', period: '2026-03', language: 'English' }),
    report({ id: 'q1-sv', period: '2026-03', language: 'Swedish' }),
    report({ id: 'q2-en', period: '2025-09', language: 'English' }),
  ];

  it('shows one edition per period and prefers the requested language with fallback', () => {
    expect(filterFiReportsByLanguage(bilingual, 'Swedish').map((item) => item.id))
      .toEqual(['q1-sv', 'q2-en']);
    expect(filterFiReportsByLanguage(bilingual, 'English').map((item) => item.id))
      .toEqual(['q1-en', 'q2-en']);
  });

  it('shows both language editions when requested', () => {
    expect(filterFiReportsByLanguage(bilingual, 'all')).toEqual(bilingual);
  });
});

describe('filterFiReportsByKind', () => {
  const reports = [
    report({ id: 'annual', kind: 'Annual report' }),
    report({ id: 'year-end', kind: 'Year-end release' }),
    report({ id: 'quarter', kind: 'Quarterly report' }),
  ];

  it('returns only the selected report types', () => {
    expect(filterFiReportsByKind(reports, ['Annual report']).map((item) => item.id))
      .toEqual(['annual']);
    expect(filterFiReportsByKind(reports, ['Annual report', 'Year-end release']).map((item) => item.id))
      .toEqual(['annual', 'year-end']);
  });
});
