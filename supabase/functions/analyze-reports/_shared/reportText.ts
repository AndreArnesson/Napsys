const COMPACTION_MARKER = "\n\n[Del av rapporten utelämnad för att hålla analysen inom AI-tjänstens gränser.]\n\n";

export function compactReportText(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  if (maxChars <= COMPACTION_MARKER.length) {
    return { text: text.slice(0, Math.max(0, maxChars)), truncated: true };
  }

  const remaining = maxChars - COMPACTION_MARKER.length;
  const headChars = Math.ceil(remaining / 2);
  const tailChars = remaining - headChars;
  return {
    text: text.slice(0, headChars) + COMPACTION_MARKER +
      (tailChars ? text.slice(-tailChars) : ""),
    truncated: true,
  };
}

export const MAX_REPORT_TEXT_CHARS = 240_000;
export const MAX_FILES_PER_ANALYSIS = 8;
