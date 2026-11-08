// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  AiError, buildGeminiBody, geminiText, plainText, readJson,
  referencedSources, retrySeconds, secondsUntilQuotaReset,
} from '../../supabase/functions/_shared/companyAiCore';

describe('company AI quota reset and provider retry times', () => {
  it.each([
    ['winter', '2026-01-15T20:00:00Z', 43200],
    ['summer', '2026-07-15T19:00:00Z', 43200],
    ['spring DST day has 23 hours', '2026-03-08T08:00:00Z', 82800],
    ['fall DST day has 25 hours', '2026-11-01T07:00:00Z', 90000],
  ])('waits for the next Pacific midnight: %s', (_label, now, expected) => {
    const seconds = secondsUntilQuotaReset(new Date(now));
    expect(seconds).toBeGreaterThanOrEqual(expected);
    // The boundary search deliberately rounds up, rather than retrying early.
    expect(seconds).toBeLessThanOrEqual(expected + 1);
  });

  it('keeps a minimum cooldown around midnight', () => {
    expect(secondsUntilQuotaReset(new Date('2026-11-08T07:59:50Z'))).toBe(60);
  });

  it('reads numeric Retry-After, rounds up and bounds provider values', () => {
    expect(retrySeconds('15')).toBe(60);
    expect(retrySeconds('61.1')).toBe(62);
    expect(retrySeconds('999999')).toBe(86400);
  });

  it('reads HTTP dates without depending on the execution machine’s current time', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    expect(retrySeconds('Sun, 08 Nov 2026 12:01:35 GMT', now)).toBe(95);
  });

  it.each([null, '', 'not-a-date', '0', '-5', 'Infinity', 'Sun, 08 Nov 2026 11:00:00 GMT'])
    ('falls back to the next quota reset for an absent or unusable header: %s', header => {
      const now = new Date('2026-11-08T12:00:00Z');
      expect(retrySeconds(header, now)).toBe(secondsUntilQuotaReset(now));
    });
});

describe('bounded Gemini requests and safe response handling', () => {
  it('builds a text/file request with a bounded output and no paid tool or alternate-provider configuration', () => {
    const parts = [{ text: 'Company data' }, { inlineData: { mimeType: 'application/pdf', data: 'AA==' } }];
    const body = buildGeminiBody(parts, 'Use only these sources.', 'gemini-2.5-flash', 'chat');
    expect(body.contents).toEqual([{ role: 'user', parts }]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Use only these sources.' }] });
    expect(body.generationConfig).toEqual({ maxOutputTokens: 2400, thinkingConfig: { thinkingBudget: 0 } });
    expect(Object.keys(body).sort()).toEqual(['contents', 'generationConfig', 'systemInstruction']);
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('cachedContent');
    expect(body).not.toHaveProperty('fallback');
  });

  it('uses a smaller news response budget and does not send unsupported thinking options to other models', () => {
    const body = buildGeminiBody([{ text: 'News' }], 'Summarize.', 'gemini-3.8-flash', 'news');
    expect(body.generationConfig).toEqual({ maxOutputTokens: 1200 });
  });

  it('omits internal reasoning and combines only visible answer parts', () => {
    expect(geminiText({ candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: 'Private reasoning', thought: true }, { text: 'Answer ' }, { text: '[C1]' }] },
    }] })).toBe('Answer [C1]');
  });

  it.each(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'OTHER'])
    ('rejects a blocked completion even when it contains text: %s', finishReason => {
      expect(() => geminiText({ candidates: [{ finishReason, content: { parts: [{ text: 'Blocked text' }] } }] }))
        .toThrow(expect.objectContaining({ code: 'no_answer', status: 422 }));
    });

  it.each([
    undefined, null, {}, { promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '   ' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Only thinking', thought: true }] } }] },
  ])('rejects empty or unavailable answers', result => {
    expect(() => geminiText(result)).toThrow(AiError);
  });

  it('bounds persisted answers even if the provider returns excessive text', () => {
    expect(geminiText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'x'.repeat(40000) }] } }] }))
      .toHaveLength(30000);
  });

  it('keeps only citations to sources that the server actually supplied', () => {
    const sources = [{ id: 'C1', label: 'Company' }, { id: 'N1', label: 'News', url: 'https://example.com/news' }];
    expect(referencedSources('Company [C1], invented citation [N999].', sources)).toEqual([sources[0]]);
  });

  it('reduces stored rich text to bounded plain text before supplying context', () => {
    expect(plainText('<p>Hello</p><script>steal()</script>\0<strong>world</strong>'))
      .toBe(' Hello  world ');
    expect(plainText('x'.repeat(100), 20)).toHaveLength(20);
  });
});

describe('bounded request input', () => {
  it('accepts a JSON object at exactly the configured byte limit', async () => {
    const body = JSON.stringify({ question: 'åäö' });
    const bytes = new TextEncoder().encode(body).byteLength;
    expect(await readJson(new Request('https://example.com', { method: 'POST', body }), bytes))
      .toEqual({ question: 'åäö' });
  });

  it('rejects an oversized declared body before consuming the stream', async () => {
    const request = new Request('https://example.com', {
      method: 'POST', body: '{}', headers: { 'Content-Length': '12001' },
    });
    await expect(readJson(request)).rejects.toMatchObject({ code: 'invalid_request', status: 413 });
    expect(request.bodyUsed).toBe(false);
  });

  it('enforces the actual streamed byte count without trusting Content-Length and cancels excess input', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"question":"'));
        controller.enqueue(new TextEncoder().encode('å'.repeat(20)));
      },
      cancel,
    });
    const request = new Request('https://example.com', {
      method: 'POST', body: stream, duplex: 'half', headers: { 'Content-Length': '2' },
    } as RequestInit);
    await expect(readJson(request, 30)).rejects.toMatchObject({ code: 'invalid_request', status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['null', '[]', 'true', '1', '"question"', '{broken'])
    ('rejects malformed JSON or a non-object request body: %s', body => {
      const request = new Request('https://example.com', { method: 'POST', body });
      return expect(readJson(request)).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
    });

  it('rejects a missing request body', async () => {
    await expect(readJson(new Request('https://example.com')))
      .rejects.toMatchObject({ code: 'invalid_request', status: 400 });
  });
});
