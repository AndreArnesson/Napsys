import type { YearlyProjection } from '@/components/analysis/SpreadsheetAnalysis';

/** A transient copy of the table's results, never an analysis/database update. */
export interface AnalysisValuationContext {
  mode: 'yearly' | 'quarterly';
  targetPE: number;
  currentPrice: number;
  sharesOutstanding: number;
  priceFxRate: number;
  reportingCurrency: string;
  tradingCurrency: string;
  rows: (YearlyProjection & { isActual?: boolean })[];
  truncated?: boolean;
}

export function analysisValuationSnapshot(values: AnalysisValuationContext): AnalysisValuationContext {
  const nextYear = new Date().getFullYear() + 1;
  // Put the most frequently requested periods first so distant columns cannot
  // crowd next year's valuation out of the bounded model context.
  const candidates = [...values.rows].sort((a, b) =>
    Number(b.year === nextYear) - Number(a.year === nextYear) || a.year - b.year || (a.quarter ?? 0) - (b.quarter ?? 0))
    .slice(0, 40).map(row => {
      const numbers = Object.fromEntries(Object.entries(row).filter(([key, value]) =>
        !key.startsWith('calculated') && typeof value === 'number' && Number.isFinite(value))) as YearlyProjection;
      // A displayed placeholder must not become a factual zero in the chat.
      if (!((row.price ?? 0) > 0 && values.priceFxRate > 0 && Number.isFinite(row.estimatedPrice))) delete numbers.mos;
      return { ...numbers, isActual: row.isActual === true };
    });
  const snapshot = { ...values, rows: candidates, truncated: values.rows.length > candidates.length };
  while (snapshot.rows.length && new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 24_000) {
    snapshot.rows.pop();
    snapshot.truncated = true;
  }
  return snapshot;
}
