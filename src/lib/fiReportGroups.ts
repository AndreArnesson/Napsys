import type { FiReport, FiReportKind } from './fiReports';

export type FiReportGroup = {
  year: string;
  annual: FiReport[];
  yearEnd: FiReport[];
  quarterly: FiReport[];
  other: FiReport[];
};
export type FiReportLanguageFilter = FiReport['language'] | 'all';

export function filterFiReportsByKind(reports: FiReport[], kinds: FiReportKind[]): FiReport[] {
  const selectedKinds = new Set(kinds);
  return reports.filter((report) => selectedKinds.has(report.kind));
}

export function getFiReportKey(report: Pick<FiReport, 'id' | 'language'>): string {
  return `${report.id}-${report.language}`;
}

export function filterFiReportsByLanguage(
  reports: FiReport[],
  language: FiReportLanguageFilter,
): FiReport[] {
  if (language === 'all') return reports;

  const reportGroups = new Map<string, FiReport[]>();
  for (const report of reports) {
    const groupKey = `${report.kind}|${report.period}`;
    const group = reportGroups.get(groupKey) ?? [];
    group.push(report);
    reportGroups.set(groupKey, group);
  }

  return [...reportGroups.values()].flatMap((group) => {
    const preferred = group.find((report) => report.language === language);
    return [preferred ?? group[0]];
  });
}

export function groupFiReportsByYear(reports: FiReport[]): FiReportGroup[] {
  const groups = new Map<string, FiReportGroup>();

  for (const report of reports) {
    const year = report.period.match(/(?:19|20)\d{2}/)?.[0] ?? 'Övriga';
    let group = groups.get(year);
    if (!group) {
      group = { year, annual: [], yearEnd: [], quarterly: [], other: [] };
      groups.set(year, group);
    }

    if (report.kind === 'Annual report') {
      group.annual.push(report);
    } else if (report.kind === 'Year-end release') {
      group.yearEnd.push(report);
    } else if (report.kind === 'Quarterly report' || report.kind === 'Half-year report') {
      group.quarterly.push(report);
    } else {
      group.other.push(report);
    }
  }

  const sortReports = (items: FiReport[]) => items.sort((a, b) =>
    b.period.localeCompare(a.period, undefined, { numeric: true }) ||
    a.language.localeCompare(b.language)
  );

  return [...groups.values()]
    .map((group) => ({
      ...group,
      annual: sortReports(group.annual),
      yearEnd: sortReports(group.yearEnd),
      quarterly: sortReports(group.quarterly),
      other: sortReports(group.other),
    }))
    .sort((a, b) => b.year.localeCompare(a.year, undefined, { numeric: true }));
}
