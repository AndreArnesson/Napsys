import { describe, expect, it } from 'vitest';
import { extractHiddenFormFields, extractXhtmlReportText, parseFiReports } from './fiReports';

describe('FI report parsing', () => {
  it('parses annual, half-year and quarterly reports with their language links', () => {
    const html = `
      <table id="ctl00_main_gvwYearReports"><tr><td>2025</td>
        <td><a href="GetFile.aspx?fid=1001">English</a><a href="GetFile.aspx?fid=1002">Swedish</a></td></tr></table>
      <table id="ctl00_main_gvwHalfYearReports"><tr><td>2026</td>
        <td><a href="GetFile.aspx?fid=2001">English</a></td></tr></table>
      <table id="ctl00_main_gvwQuarterReports"><tr><td>2026-09</td>
        <td><a href="GetFile.aspx?fid=3001">Swedish</a></td></tr></table>`;

    expect(parseFiReports(html)).toEqual([
      { id: '1001', period: '2025', kind: 'Annual report', language: 'English', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=1001' },
      { id: '1002', period: '2025', kind: 'Annual report', language: 'Swedish', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=1002' },
      { id: '2001', period: '2026', kind: 'Half-year report', language: 'English', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=2001' },
      { id: '3001', period: '2026-09', kind: 'Quarterly report', language: 'Swedish', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=3001' },
    ]);
  });

  it('ignores table headings, removed entries, and non-report links', () => {
    const html = `
      <table id="ctl00_main_gvwYearReports">
        <tr><td>Report period</td><td><a href="javascript:sort()">Annual report</a></td></tr>
        <tr><td>Removed</td><td><a href="GetFile.aspx?fid=9">English</a></td></tr>
        <tr><td>2024</td><td><a href="GetFile.aspx?fid=10">History</a></td></tr>
      </table>`;

    expect(parseFiReports(html)).toEqual([]);
  });

  it('reads language labels from report icons when the FI link has no visible text', () => {
    const html = `
      <table id="ctl00_main_gvwQuarterReports"><tr><td>2026-09</td><td>
        <a href="GetFile.aspx?fid=4001"><img src="english.png" alt="English" /></a>
        <a href="GetFile.aspx?fid=4002"><img src="swedish.png" alt="Swedish" /></a>
      </td></tr></table>`;

    expect(parseFiReports(html)).toEqual([
      { id: '4001', period: '2026-09', kind: 'Quarterly report', language: 'English', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=4001' },
      { id: '4002', period: '2026-09', kind: 'Quarterly report', language: 'Swedish', url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=4002' },
    ]);
  });

  it('extracts the publication date when the FI report row provides one', () => {
    const html = `
      <table id="ctl00_main_gvwYearReports"><tr>
        <td>2025</td>
        <td><a href="GetFile.aspx?fid=5001">Swedish</a></td>
        <td>30/03/2026 08:15</td>
      </tr></table>`;

    expect(parseFiReports(html)).toEqual([
      {
        id: '5001',
        period: '2025',
        publishedAt: '2026-03-30T08:15',
        kind: 'Annual report',
        language: 'Swedish',
        url: 'https://finanscentralen.fi.se/search/GetFile.aspx?fid=5001',
      },
    ]);
  });

  it('extracts and decodes hidden ASP.NET form values', () => {
    const html = `<input type="hidden" name="__VIEWSTATE" value="abc&amp;xyz" />
      <input name="__EVENTVALIDATION" type="hidden" value="token&#45;1">`;
    const fields = extractHiddenFormFields(html);

    expect(fields.get('__VIEWSTATE')).toBe('abc&xyz');
    expect(fields.get('__EVENTVALIDATION')).toBe('token-1');
  });

  it('extracts readable XHTML report text, decodes entities, and removes scripts and styles', () => {
    const markup = `<html><head><style>.hidden{display:none}</style></head><body>
      <h1>Annual report</h1><p>Revenue &amp; profit: 1&nbsp;234</p>
      <script>doNotInclude()</script><p>Operating cash flow</p>
    </body></html>`;
    const text = extractXhtmlReportText(markup);

    expect(text).toContain('Annual report');
    expect(text).toContain('Revenue & profit: 1 234');
    expect(text).toContain('Operating cash flow');
    expect(text).not.toContain('doNotInclude');
    expect(text).not.toContain('.hidden');
  });

  it('limits extracted XHTML text to the requested maximum length', () => {
    expect(extractXhtmlReportText('<p>0123456789</p>', 6)).toBe('012345');
  });
});
