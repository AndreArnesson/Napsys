import { supabase } from '@/integrations/supabase/client';

export interface AssistantSource {
  id: string;
  label: string;
  url?: string;
}

export interface CompanyChatTurn {
  id: string;
  company_id: string;
  user_id: string;
  analysis_id?: string | null;
  question: string;
  answer: string;
  sources: AssistantSource[];
  created_at: string;
}

export interface CompanyAISettings {
  company_id: string;
  chat_enabled: boolean;
  news_enabled: boolean;
  feed_urls: string[];
  last_news_checked_at: string | null;
  last_news_error: string | null;
  news_summary: string | null;
  news_paused_until: string | null;
  updated_at: string;
}

export interface CompanyNewsItem {
  id: string;
  company_id: string;
  url: string;
  title: string;
  source: string;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
}

export const assistantKeys = {
  settings: (companyId: string, userId: string) => ['company-ai-settings', companyId, userId] as const,
  turns: (companyId: string, userId: string) => ['company-chat-turns', companyId, userId] as const,
  news: (companyId: string, userId: string) => ['company-news-items', companyId, userId] as const,
};

export async function loadAssistantSettings(companyId: string, signal?: AbortSignal) {
  let query = supabase.from('company_ai_settings').select('*').eq('company_id', companyId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadAssistantTurns(companyId: string, userId: string, signal?: AbortSignal) {
  let query = supabase.from('company_chat_turns').select('*').eq('company_id', companyId)
    .eq('user_id', userId).is('analysis_id', null).order('created_at', { ascending: false }).limit(20);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse().map(turn => ({
    ...turn,
    sources: readSources(turn.sources),
  }));
}

export async function loadCompanyNews(companyId: string, signal?: AbortSignal) {
  let query = supabase.from('company_news_items').select('*').eq('company_id', companyId)
    .order('fetched_at', { ascending: false }).limit(20);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function saveAssistantSettings(companyId: string, settings: {
  chatEnabled: boolean;
  newsEnabled: boolean;
  feedUrls: string[];
}, signal?: AbortSignal) {
  let query = supabase.rpc('set_company_ai_settings', {
    _company_id: companyId,
    _chat_enabled: settings.chatEnabled,
    _news_enabled: settings.newsEnabled,
    _feed_urls: settings.feedUrls,
  });
  if (signal) query = query.abortSignal(signal);
  const { error } = await query;
  if (error) throw error;
}

export class CompanyAssistantError extends Error {
  constructor(public readonly code: string, public readonly retryAfterSeconds?: number) {
    super(code);
    this.name = 'CompanyAssistantError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function invokeAssistant(name: 'company-chat' | 'company-news', body: Record<string, unknown>, signal?: AbortSignal) {
  const { data, error } = await supabase.functions.invoke(name, { body, signal });
  let details: unknown = data;
  if (error) {
    if (record(error) && error.context instanceof Response) {
      details = await error.context.clone().json().catch(() => null);
      if (!record(details)) {
        throw new CompanyAssistantError(error.context.status === 403 || error.context.status === 401 ? 'forbidden' : 'request_failed');
      }
    }
    if (!record(details)) throw new CompanyAssistantError('request_failed');
  }
  if (error || (record(details) && typeof details.error === 'string')) {
    const payload = record(details) ? details : {};
    throw new CompanyAssistantError(
      typeof payload.code === 'string' ? payload.code : 'request_failed',
      typeof payload.retryAfterSeconds === 'number' ? payload.retryAfterSeconds : undefined,
    );
  }
  return details;
}

export function readChatTurn(value: unknown): CompanyChatTurn {
  if (!record(value) || !record(value.turn)) throw new CompanyAssistantError('request_failed');
  const turn = value.turn;
  if (typeof turn.id !== 'string' || typeof turn.company_id !== 'string' || typeof turn.user_id !== 'string'
    || typeof turn.question !== 'string' || typeof turn.answer !== 'string' || typeof turn.created_at !== 'string') {
    throw new CompanyAssistantError('request_failed');
  }
  return { ...turn, sources: readSources(turn.sources) } as CompanyChatTurn;
}

function readSources(value: unknown): AssistantSource[] {
  return Array.isArray(value) ? value.filter(isAssistantSource) : [];
}

export function isAssistantSource(value: unknown): value is AssistantSource {
  return record(value) && typeof value.id === 'string' && typeof value.label === 'string'
    && (value.url === undefined || typeof value.url === 'string');
}

export function safeAssistantUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\/company\/[a-zA-Z0-9-]+(?:[/?#]|$)/.test(value) && !value.includes('\\')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseAssistantFeeds(value: string): string[] | null {
  const allowedHosts = new Set(['news.cision.com', 'news.google.com', 'mfn.se', 'www.mfn.se', 'www.di.se', 'feeds.feedburner.com']);
  const values = [...new Set(value.split(/\r?\n/).map(url => url.trim()).filter(Boolean))];
  if (values.length > 5) return null;
  try {
    if (values.some(value => {
      const url = new URL(value);
      return url.protocol !== 'https:' || !!url.username || !!url.password || (!!url.port && url.port !== '443')
        || !allowedHosts.has(url.hostname.toLowerCase());
    })) return null;
    return values;
  } catch {
    return null;
  }
}
