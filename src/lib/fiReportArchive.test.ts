import { describe, expect, it } from 'vitest';
import { extractFiReportTextFromZip } from './fiReportArchive';

function storedZip(fileName: string, content: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const name = encoder.encode(fileName);
  const data = encoder.encode(content);
  const local = new Uint8Array(30 + name.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(18, data.length, true);
  localView.setUint16(22, data.length, true);
  localView.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(data, 30 + name.length);

  const central = new Uint8Array(46 + name.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint32(20, data.length, true);
  centralView.setUint32(24, data.length, true);
  centralView.setUint16(28, name.length, true);
  centralView.setUint32(42, 0, true);
  central.set(name, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, local.length, true);

  const zip = new Uint8Array(local.length + central.length + end.length);
  zip.set(local, 0);
  zip.set(central, local.length);
  zip.set(end, local.length + central.length);
  return zip.buffer;
}

describe('FI report ZIP extraction', () => {
  it('extracts readable text from the XHTML entry in an ESEF archive', async () => {
    const archive = storedZip(
      'reports/company-report.xhtml',
      '<html><head><style>.hide{display:none}</style></head><body><h1>Annual report</h1><p>Revenue &amp; profit: 1&nbsp;234</p></body></html>',
    );

    await expect(extractFiReportTextFromZip(archive)).resolves.toContain('Revenue & profit: 1 234');
  });

  it('reports an invalid ZIP archive clearly', async () => {
    await expect(extractFiReportTextFromZip(new TextEncoder().encode('not a zip').buffer)).rejects.toThrow('ogiltigt ZIP-arkiv');
  });
});
