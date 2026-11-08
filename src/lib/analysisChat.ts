import { supabase } from '@/integrations/supabase/client';
import {
  CompanyAssistantError,
  isAssistantSource,
  readChatTurn,
  type CompanyChatTurn,
} from '@/lib/companyAssistant';

export interface AnalysisChatDraft {
  name?: string | null;
  summary_comment?: string | null;
  rating?: 'buy' | 'hold' | 'sell' | null;
  current_price?: number | null;
  shares_outstanding?: number | null;
  price_fx_rate?: number | null;
  employees?: number | null;
  projections?: unknown[];
  adjustments?: unknown[];
  investment_holdings?: unknown[];
  nav_discount?: number | null;
  napkin_mode?: boolean;
  napkin_assumptions?: unknown[];
}

export interface AnalysisChatTurn extends CompanyChatTurn {
  analysis_id: string;
}

export const analysisChatKey = (companyId: string, analysisId: string, userId: string) =>
  ['analysis-chat-turns', companyId, analysisId, userId] as const;

export async function loadAnalysisChat(companyId: string, analysisId: string, userId: string, signal?: AbortSignal) {
  let query = supabase.from('company_chat_turns').select('*')
    .eq('company_id', companyId).eq('analysis_id', analysisId).eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(20);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse().map(row => ({
    ...row,
    sources: safeSources(row.sources),
  }));
}

function safeSources(value: unknown) {
  return Array.isArray(value) ? value.filter(isAssistantSource) : [];
}

export function readAnalysisChatTurn(value: unknown, companyId: string, analysisId: string, userId: string): AnalysisChatTurn {
  const turn = readChatTurn(value);
  if (!('analysis_id' in turn) || turn.analysis_id !== analysisId || turn.company_id !== companyId || turn.user_id !== userId) {
    throw new CompanyAssistantError('request_failed');
  }
  return turn as AnalysisChatTurn;
}

export function analysisDraftPayload(draft: AnalysisChatDraft | undefined): AnalysisChatDraft | undefined {
  if (!draft) return undefined;
  // The request carries only analysis fields, never editor state or company writes.
  const fields = [
    'name', 'summary_comment', 'rating', 'current_price', 'shares_outstanding',
    'price_fx_rate', 'employees', 'projections', 'adjustments', 'investment_holdings',
    'nav_discount', 'napkin_mode', 'napkin_assumptions',
  ] as const;
  return Object.fromEntries(fields.filter(key => draft[key] !== undefined).map(key => [key, draft[key]]));
}
