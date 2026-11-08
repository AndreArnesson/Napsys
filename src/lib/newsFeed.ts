import { supabase } from '@/integrations/supabase/client';
import type { CompanyNewsItem } from './companyAssistant';

export const NEWS_PAGE_SIZE = 40;
export interface NewsCompany { id: string; name: string; ticker: string | null }
export interface NewsFeedItem extends CompanyNewsItem { companies: NewsCompany }

export function companyXSearch(company: Pick<NewsCompany, 'name' | 'ticker'>): string {
  const name = company.name.replace(/["\r\n]/g, ' ').trim().slice(0, 150);
  const ticker = company.ticker?.trim().replace(/^\$/, '');
  const terms = [`"${name}"`];
  if (ticker && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,24}$/.test(ticker)) terms.push(`$${ticker}`);
  const url = new URL('https://x.com/search');
  url.searchParams.set('q', `(${terms.join(' OR ')})`);
  url.searchParams.set('src', 'typed_query');
  url.searchParams.set('f', 'live');
  return url.toString();
}

/** All reads use the signed-in browser client and current company/settings RLS. */
export async function loadMonitoredCompanies(signal?: AbortSignal): Promise<NewsCompany[]> {
  const companies: NewsCompany[] = [];
  for (let offset = 0; ; offset += 100) {
    let query = supabase.from('company_ai_settings').select('companies!inner(id,name,ticker)')
      .eq('news_enabled', true).order('company_id').range(offset, offset + 99);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) companies.push(row.companies);
    if (!data || data.length < 100) break;
  }
  return companies.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadNewsPage(companyId: string | null, page: number, signal?: AbortSignal): Promise<NewsFeedItem[]> {
  // Inner joins filter out disabled monitoring on the server, including when
  // settings or access changed since the company selector was loaded.
  let query = supabase.from('company_news_items')
    .select('id,company_id,title,url,source,summary,published_at,fetched_at,companies!inner(id,name,ticker,company_ai_settings!inner(news_enabled))')
    .eq('companies.company_ai_settings.news_enabled', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('fetched_at', { ascending: false }).order('id', { ascending: false })
    .range(page * NEWS_PAGE_SIZE, (page + 1) * NEWS_PAGE_SIZE - 1);
  if (companyId) query = query.eq('company_id', companyId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
