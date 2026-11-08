export class AiError extends Error {
  constructor(public code: string, public status = 500, public retryAfterSeconds?: number) {
    super(code);
    this.name = 'AiError';
  }
}

export type AiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export type AiSource = { id: string; label: string; url?: string };

export function secondsUntilQuotaReset(now = new Date()): number {
  // Google's daily quota resets at midnight Pacific; the offset can change at DST.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const day = formatter.format(now);
  let low = now.getTime(), high = low + 26 * 60 * 60 * 1000;
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2);
    if (formatter.format(new Date(mid)) === day) low = mid; else high = mid;
  }
  return Math.max(60, Math.ceil((high - now.getTime()) / 1000));
}

export function retrySeconds(header: string | null, now = new Date()): number {
  if (header) {
    const value = Number(header);
    const seconds = Number.isFinite(value) ? value : (Date.parse(header) - now.getTime()) / 1000;
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(86400, Math.max(60, Math.ceil(seconds)));
  }
  return secondsUntilQuotaReset(now);
}

export function buildGeminiBody(parts: AiPart[], systemInstruction: string, model: string, purpose: 'chat' | 'news') {
  return {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: purpose === 'chat' ? 2400 : 1200,
      ...(model.startsWith('gemini-2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
    // No tools, billable search, explicit cache, alternate provider, or retries.
  };
}

export function geminiText(result: unknown): string {
  const body = result as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
  const candidate = body?.candidates?.[0];
  if (!candidate || (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason))) {
    throw new AiError('no_answer', 422);
  }
  const text = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('').trim();
  if (!text) throw new AiError('no_answer', 422);
  return text.slice(0, 30000);
}

export function plainText(value: unknown, limit = 12000): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/\u0000/g, '').slice(0, limit);
}

export function referencedSources(answer: string, sources: AiSource[]): AiSource[] {
  return sources.filter(source => answer.includes(`[${source.id}]`));
}

export async function readJson(req: Request, maxBytes = 12000): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('content-length')) > maxBytes) throw new AiError('invalid_request', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AiError('invalid_request', 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { await reader.cancel(); throw new AiError('invalid_request', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body;
  } catch { throw new AiError('invalid_request', 400); }
}
