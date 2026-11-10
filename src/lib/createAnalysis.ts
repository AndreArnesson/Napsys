import { supabase } from '@/integrations/supabase/client';

/** Capture every financial dataset before opening the new analysis. */
export async function createAnalysisWithSnapshot(options: {
  companyId: string; userId: string; currentPrice: number | null; sharesOutstanding: number | null;
  reportingCurrency: string; tradingCurrency: string; companyType: string;
}) {
  const tables = ['income_statement', 'balance_sheet', 'quarterly_income_statement'] as const;
  const datasets = await Promise.all(tables.map(table => supabase.from(table as 'income_statement')
    .select('*').eq('company_id', options.companyId).is('analysis_id', null)));
  for (const result of datasets) if (result.error) throw result.error;

  const sections = {
    snapshot_complete: false,
    reporting_currency: options.reportingCurrency,
    trading_currency: options.tradingCurrency,
    company_type: options.companyType,
    calculation_settings: { targetPE: 15, qGrowthMode: 'yoy' },
  };
  const { data: analysis, error } = await supabase.from('analyses').insert({
    company_id: options.companyId,
    user_id: options.userId,
    is_draft: true,
    current_price: options.currentPrice,
    shares_outstanding: options.sharesOutstanding,
    visible_sections: sections,
  } as any).select().single();
  if (error) throw error;

  try {
    for (let index = 0; index < tables.length; index++) {
      const rows = datasets[index].data ?? [];
      if (!rows.length) continue;
      const copies = rows.map(({ id: _id, created_at: _created, ...row }) => ({
        ...row, company_id: options.companyId, analysis_id: analysis.id,
      }));
      const result = await supabase.from(tables[index] as 'income_statement').insert(copies as any);
      if (result.error) throw result.error;
    }
    const result = await supabase.from('analyses').update({
      visible_sections: { ...sections, snapshot_complete: true },
    } as any).eq('id', analysis.id);
    if (result.error) throw result.error;
  } catch (error) {
    // Analysis-scoped financial rows cascade with the incomplete analysis.
    await supabase.from('analyses').delete().eq('id', analysis.id);
    throw error;
  }
  return analysis.id;
}
