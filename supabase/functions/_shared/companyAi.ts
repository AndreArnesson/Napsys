import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { AiError, buildGeminiBody, geminiText, retrySeconds, type AiPart } from './companyAiCore.ts';
export { AiError } from './companyAiCore.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    ...(typeof body === 'object' && body && 'retryAfterSeconds' in body
      ? { 'Retry-After': String((body as { retryAfterSeconds: number }).retryAfterSeconds) } : {}),
  } });
}

export function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new AiError('not_configured', 503);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireUser(req: Request) {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new AiError('unauthorized', 401);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new AiError('not_configured', 503);
  const userClient = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (error || !data.user) throw new AiError('unauthorized', 401);
  return { userClient, adminClient: getAdminClient(), user: data.user };
}

export async function callGemini({ adminClient, companyId, userId, purpose, parts, systemInstruction }: {
  adminClient: ReturnType<typeof getAdminClient>; companyId: string; userId?: string;
  purpose: 'chat' | 'news'; parts: AiPart[]; systemInstruction: string;
}): Promise<string> {
  if (Deno.env.get('COMPANY_AI_ENABLED') === 'false') throw new AiError('not_configured', 503);
  const key = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('COMPANY_AI_MODEL') || 'gemini-2.5-flash';
  if (!key || !/^gemini-[a-z0-9.-]+$/.test(model)) throw new AiError('not_configured', 503);
  const { data: budget, error: budgetError } = await adminClient.rpc('claim_company_ai_request', {
    _company_id: companyId, _user_id: userId ?? null, _purpose: purpose,
  });
  if (budgetError || !budget) throw new AiError('database_error', 503);
  if (!budget.allowed) throw new AiError(['quota_exhausted', 'project_daily_limit', 'user_daily_limit'].includes(budget.reason) ? 'quota_exhausted' : 'rate_limited', 429, budget.retryAfterSeconds || 60);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(buildGeminiBody(parts, systemInstruction, model, purpose)),
      signal: AbortSignal.timeout(55000),
    });
  } catch { throw new AiError('provider_unavailable', 503); }
  if (response.status === 429) {
    const seconds = retrySeconds(response.headers.get('retry-after'));
    // Persist the pause for both chat and scheduled news, across all function instances.
    const { error: pauseError } = await adminClient.rpc('pause_company_ai', { _seconds: seconds });
    if (pauseError) console.error('Could not persist company AI quota pause');
    await response.body?.cancel();
    throw new AiError('quota_exhausted', 429, seconds);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new AiError(response.status === 400 || response.status === 404 ? 'not_configured' : 'provider_unavailable', 503);
  }
  let result: unknown;
  try { result = await response.json(); } catch { throw new AiError('provider_unavailable', 503); }
  return geminiText(result);
}
