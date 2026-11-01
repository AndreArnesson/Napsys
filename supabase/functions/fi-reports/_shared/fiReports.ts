export type FiReportKind = 'Annual report' | 'Half-year report' | 'Quarterly report' | 'Year-end release';

export interface FiReport {
  id: string;
  period: string;
  publishedAt?: string;
  kind: FiReportKind;
  language: 'English' | 'Swedish';
  url: string;
}

const REPORT_TABLES: Array<{ id: string; kind: FiReportKind }> = [
  { id: 'ctl00_main_gvwYearReports', kind: 'Annual report' },
  { id: 'ctl00_main_gvwHalfYearReports', kind: 'Half-year report' },
  { id: 'ctl00_main_gvwQuarterReports', kind: 'Quarterly report' },
  { id: 'ctl00_main_gvwBookEndReports', kind: 'Year-end release' },
];

export function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

export function extractXhtmlReportText(markup: string, maxLength = 800_000): string {
  const text = decodeHtml(markup
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ')
    .replace(/<\/(?:p|div|tr|h[1-6]|li|td|th|section|article|table|header|footer|br)\s*>/gi, '\n')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.slice(0, maxLength);
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function getLanguageLabel(attributes: string, content: string): 'English' | 'Swedish' | undefined {
  const visibleText = stripTags(content);
  const accessibleLabel = `${attributes} ${content}`.match(/\b(?:alt|aria-label|title)=["']([^"']+)["']/i)?.[1] || '';
  const label = (visibleText || decodeHtml(accessibleLabel)).trim().toLowerCase();
  if (label === 'english' || label === 'engelska') return 'English';
  if (label === 'swedish' || label === 'svenska') return 'Swedish';
  return undefined;
}

function extractPublishedAt(row: string): string | undefined {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
    .slice(1)
    .map((match) => stripTags(match[1]));
  for (const cell of cells) {
    const match = cell.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}:\d{2}))?\b|\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[ T]+(\d{1,2}:\d{2}))?\b/);
    if (!match) continue;
    const [, yearIso, monthIso, dayIso, timeIso, dayLocal, monthLocal, yearLocal, timeLocal] = match;
    const year = yearIso || yearLocal;
    const month = (monthIso || monthLocal).padStart(2, '0');
    const day = (dayIso || dayLocal).padStart(2, '0');
    const time = timeIso || timeLocal;
    return `${year}-${month}-${day}${time ? `T${time}` : ''}`;
  }
  return undefined;
}

export function parseFiReports(html: string): FiReport[] {
  const reports: FiReport[] = [];

  for (const table of REPORT_TABLES) {
    const tablePattern = new RegExp(`<table\\b[^>]*\\bid=["']${table.id}["'][^>]*>([\\s\\S]*?)<\\/table>`, 'i');
    const tableHtml = html.match(tablePattern)?.[1];
    if (!tableHtml) continue;

    for (const rowMatch of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row = rowMatch[1];
      const period = stripTags(row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '');
      if (!period || /nothing has yet been reported|removed/i.test(period)) continue;

      for (const link of row.matchAll(/<a\b([^>]*href=["'][^"']*GetFile\.aspx\?fid=(\d+)[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
        const language = getLanguageLabel(link[1], link[3]);
        if (!language) continue;
        const id = link[2];
        const publishedAt = extractPublishedAt(row);
        reports.push({
          id,
          period,
          ...(publishedAt ? { publishedAt } : {}),
          kind: table.kind,
          language,
          url: `https://finanscentralen.fi.se/search/GetFile.aspx?fid=${id}`,
        });
      }
    }
  }

  return reports;
}

export function extractHiddenFormFields(html: string): URLSearchParams {
  const fields = new URLSearchParams();
  for (const match of html.matchAll(/<input\b([^>]*\btype=["']hidden["'][^>]*)>/gi)) {
    const attributes = match[1];
    const name = attributes.match(/\bname=["']([^"']+)["']/i)?.[1];
    const value = attributes.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? '';
    if (name) fields.set(name, decodeHtml(value));
  }
  return fields;
}
