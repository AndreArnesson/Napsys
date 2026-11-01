import { describe, expect, it } from 'vitest';
import { compactReportText } from '../../supabase/functions/analyze-reports/_shared/reportText';

describe('compactReportText', () => {
  it('keeps short reports intact', () => {
    expect(compactReportText('Kort rapport', 100)).toEqual({
      text: 'Kort rapport',
      truncated: false,
    });
  });

  it('keeps the beginning and end of a long report within the supplied limit', () => {
    const input = 'BEGIN-' + 'x'.repeat(500) + '-END';
    const result = compactReportText(input, 100);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(100);
    expect(result.text.startsWith('BEGIN-')).toBe(true);
    expect(result.text.endsWith('-END')).toBe(true);
    expect(result.text).toContain('utelämnad');
  });

  it('handles a very small character limit without returning extra content', () => {
    expect(compactReportText('Long report text', 3)).toEqual({
      text: 'Lon',
      truncated: true,
    });
  });
});
