import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { BorsdataError, createBorsdataHandler, createInstrumentSearch } from './core.ts';

async function authenticatedClient(req: Request) {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new BorsdataError('unauthorized', 401);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new BorsdataError('not_configured', 503);
  const client = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (error || !data.user) throw new BorsdataError('unauthorized', 401);
  return client;
}

Deno.serve(createBorsdataHandler({
  search: createInstrumentSearch(),
  authorizeSearch: async req => { await authenticatedClient(req); },
  loadCompany: async (req, companyId) => {
    const client = await authenticatedClient(req);
    // Owners and current recipients can resolve links; company RLS is preserved.
    const company = await client.from('companies').select('name,ticker,exchange').eq('id', companyId).maybeSingle();
    if (company.error) throw new BorsdataError('database_error', 503);
    return company.data;
  },
}));
