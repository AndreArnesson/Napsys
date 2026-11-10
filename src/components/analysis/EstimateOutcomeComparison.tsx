import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/i18n/LanguageContext';
import type { YearlyProjection } from './SpreadsheetAnalysis';

export interface OutcomeRow {
  year: number;
  quarter?: number;
  revenue?: number;
  ebit?: number;
  netIncome?: number;
}

export function EstimateOutcomeComparison({ projections, actuals, currency }: {
  projections: YearlyProjection[]; actuals: OutcomeRow[]; currency: string;
}) {
  const { t, language } = useLanguage();
  const metrics = [
    { key: 'revenue', label: t.financials.revenue },
    { key: 'ebit', label: t.financials.ebit },
    { key: 'netIncome', label: t.financials.netIncome },
  ] as const;
  const format = (value?: number) => value === undefined || !Number.isFinite(value) ? '—'
    : new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', { maximumFractionDigits: 2 }).format(value);
  const matches = projections.flatMap(estimate => {
    const actual = actuals.find(row => row.year === estimate.year && row.quarter === estimate.quarter);
    return actual ? metrics.filter(metric => actual[metric.key] !== undefined)
      .map(metric => ({ estimate, actual, metric })) : [];
  });

  return <Card>
    <CardHeader><CardTitle className="text-lg">{t.analysis.compareActuals}</CardTitle>
      <p className="text-xs text-muted-foreground">{t.analysis.comparisonDescription}</p>
    </CardHeader>
    <CardContent>
      {!matches.length ? <p className="text-sm text-muted-foreground">{t.analysis.noComparableActuals}</p>
        : <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b text-left">
            {[t.financials.fiscalYear, t.analysis.metric, t.analysis.estimates, t.analysis.actual, t.analysis.deviation].map(label =>
              <th key={label} className="p-2 font-medium">{label}</th>)}
          </tr></thead>
          <tbody>{matches.map(({ estimate, actual, metric }) => {
            const original = estimate[metric.key];
            const outcome = actual[metric.key]!;
            const deviation = original !== undefined && original !== 0 ? ((outcome - original) / Math.abs(original)) * 100 : undefined;
            return <tr key={`${estimate.year}-${estimate.quarter}-${metric.key}`} className="border-b">
              <td className="p-2">{estimate.year}{estimate.quarter ? ` Q${estimate.quarter}` : ''}</td>
              <td className="p-2">{metric.label} (M{currency})</td>
              <td className="p-2 font-mono">{format(original)}</td>
              <td className="p-2 font-mono">{format(outcome)}</td>
              <td className="p-2 font-mono">{deviation === undefined ? '—' : `${format(deviation)}%`}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </CardContent>
  </Card>;
}
