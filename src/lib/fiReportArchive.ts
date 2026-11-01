import { extractXhtmlReportText } from './fiReports';

const MAX_ARCHIVE_SIZE = 20 * 1024 * 1024;
const MAX_XHTML_SIZE = 50 * 1024 * 1024;

function findEndOfCentralDirectory(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('FI skickade ett ogiltigt ZIP-arkiv.');
}

export async function extractFiReportTextFromZip(input: ArrayBuffer): Promise<string> {
  if (input.byteLength > MAX_ARCHIVE_SIZE) throw new Error('FI:s rapportarkiv är större än gränsen på 20 MB.');
  const bytes = new Uint8Array(input);
  const view = new DataView(input);
  const endOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > view.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('FI:s ZIP-arkiv innehöll en ogiltig fillista.');
    }

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (!name.toLowerCase().endsWith('.xhtml')) continue;
    if (flags & 1) throw new Error('FI:s rapport är krypterad och kan inte packas upp.');
    if (uncompressedSize > MAX_XHTML_SIZE) throw new Error('FI:s XHTML-rapport är större än gränsen på 50 MB.');
    if (localHeaderOffset + 30 > view.byteLength || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error('FI:s XHTML-fil hade en ogiltig ZIP-header.');
    }

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const contentOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(contentOffset, contentOffset + compressedSize);
    let xhtmlBytes: Uint8Array;

    if (method === 0) {
      xhtmlBytes = compressed;
    } else if (method === 8) {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      xhtmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error(`FI:s rapport använder en ZIP-komprimering som inte stöds (${method}).`);
    }

    if (xhtmlBytes.byteLength !== uncompressedSize) throw new Error('FI:s XHTML-fil kunde inte packas upp fullständigt.');
    const text = extractXhtmlReportText(decoder.decode(xhtmlBytes));
    if (!text) throw new Error('FI:s rapport innehöll ingen läsbar text.');
    return text;
  }

  throw new Error('FI:s rapportarkiv innehöll ingen XHTML-rapport.');
}
