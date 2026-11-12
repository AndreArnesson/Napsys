import { supabase } from '@/integrations/supabase/client';
import { readInstruments, type BorsdataInstrument } from '../../supabase/functions/borsdata-link/core';

export type { BorsdataInstrument };
export interface BorsdataLookup {
  match: BorsdataInstrument | null;
  candidates: BorsdataInstrument[];
}

export function borsdataExportUrl(instrument: BorsdataInstrument) {
  return `https://borsdata.se/terminal/se/${encodeURIComponent(instrument.urlName)}/export`;
}

export async function loadBorsdataLink(companyId: string, signal?: AbortSignal): Promise<BorsdataLookup> {
  const { data, error } = await supabase.functions.invoke('borsdata-link', { body: { companyId }, signal });
  if (error || !data || !Array.isArray(data.candidates)) throw new Error('borsdata_lookup_failed');
  const candidates = readInstruments(data.candidates);
  if (candidates.length !== data.candidates.length) throw new Error('borsdata_lookup_failed');
  const match = data.match === null ? null : candidates.find(candidate => candidate.urlName === data.match?.urlName);
  if (match === undefined) throw new Error('borsdata_lookup_failed');
  return { match, candidates };
}

export async function searchBorsdataCompanies(query: string, signal?: AbortSignal): Promise<BorsdataInstrument[]> {
  const { data, error } = await supabase.functions.invoke('borsdata-link', { body: { query: query.trim() }, signal });
  if (error || !data || !Array.isArray(data.candidates)) throw new Error('borsdata_search_failed');
  const candidates = readInstruments(data.candidates);
  if (candidates.length !== data.candidates.length) throw new Error('borsdata_search_failed');
  return candidates;
}

export function borsdataCompanyFields(instrument: BorsdataInstrument) {
  // These markets use one supported country-wide ticker convention. Leave
  // other exchanges for the user to select rather than guessing a listing.
  const exchanges: Record<string, string> = { SWE: 'stockholm', FIN: 'helsinki', DNK: 'copenhagen', NOR: 'oslo', USA: 'us' };
  return { name: instrument.name, ticker: instrument.ticker, exchange: exchanges[instrument.country] ?? '' };
}
