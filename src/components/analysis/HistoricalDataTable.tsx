import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Minus, BarChart3, Settings2 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

export interface HistoricalYear {
  fiscal_year: number;
  quarter?: number;
  revenue?: number;
  revenue_growth?: number;
  ebit?: number;
  ebitda?: number;
  net_income?: number;
  earnings_per_share?: number;
  dividend?: number;
  gross_margin?: number;
  operating_margin?: number;
  net_margin?: number;
  roe?: number;
  total_debt?: number;
  cash?: number;
  shareholders_equity?: number;
  shares_outstanding?: number;
}

type ColumnKey = 'revenue' | 'growth' | 'ebit' | 'ebit_growth' | 'ebitda' | 'ebitda_growth' | 'net_income' | 'dividend' | 'eps' | 'eps_growth' | 'gross_margin' | 'operating_margin' | 'net_margin' | 'pe' | 'ev' | 'ev_ebit' | 'ev_ebitda' | 'cagr_revenue' | 'cagr_profit' | 'debt';

const ALL_COLUMNS: { key: ColumnKey; label: string; group: string }[] = [
  { key: 'revenue', label: 'Omsättning', group: 'Resultat' },
  { key: 'growth', label: 'Oms. tillväxt', group: 'Resultat' },
  { key: 'ebit', label: 'EBIT', group: 'Resultat' },
  { key: 'ebit_growth', label: 'EBIT tillväxt', group: 'Resultat' },
  { key: 'ebitda', label: 'EBITDA', group: 'Resultat' },
  { key: 'ebitda_growth', label: 'EBITDA tillväxt', group: 'Resultat' },
  { key: 'dividend', label: 'Utdelning', group: 'Resultat' },
  { key: 'eps', label: 'Vinst/aktie', group: 'Resultat' },
  { key: 'eps_growth', label: 'VPA-tillväxt', group: 'Resultat' },
  { key: 'gross_margin', label: 'Bruttomarginal', group: 'Marginaler' },
  { key: 'operating_margin', label: 'Rörelsemarginal', group: 'Marginaler' },
  { key: 'net_margin', label: 'Vinstmarginal', group: 'Marginaler' },
  { key: 'pe', label: 'P/E', group: 'Värdering' },
  { key: 'ev', label: 'EV', group: 'Värdering' },
  { key: 'ev_ebit', label: 'EV/EBIT', group: 'Värdering' },
  { key: 'ev_ebitda', label: 'EV/EBITDA', group: 'Värdering' },
  { key: 'cagr_revenue', label: 'CAGR Oms.', group: 'Tillväxt' },
  { key: 'cagr_profit', label: 'CAGR Vinst', group: 'Tillväxt' },
  { key: 'debt', label: 'Nettoskuld', group: 'Skuld' },
];

const DEFAULT_COLUMNS: ColumnKey[] = ['revenue', 'growth', 'ebit', 'ebit_growth', 'eps', 'eps_growth', 'operating_margin', 'net_margin'];

// CAGR-capable metrics for the header popup
type CAGRMetric = 'revenue' | 'ebit' | 'ebitda' | 'eps' | 'net_income' | 'dividend';
const CAGR_METRICS: { key: CAGRMetric; label: string; columnKeys: ColumnKey[] }[] = [
  { key: 'revenue', label: 'Omsättning', columnKeys: ['revenue', 'growth'] },
  { key: 'ebit', label: 'EBIT', columnKeys: ['ebit', 'ebit_growth'] },
  { key: 'ebitda', label: 'EBITDA', columnKeys: ['ebitda', 'ebitda_growth'] },
  { key: 'eps', label: 'VPA', columnKeys: ['eps', 'eps_growth'] },
  { key: 'net_income', label: 'Vinst', columnKeys: [] },
  { key: 'dividend', label: 'Utdelning', columnKeys: ['dividend'] },
];

interface HistoricalDataTableProps {
  data: HistoricalYear[];
  currency?: string;
  sharesOutstanding?: number;
  currentPrice?: number;
  onRowClick?: (year: number) => void;
}

function computeCAGR(startVal: number, endVal: number, years: number): number | undefined {
  if (startVal <= 0 || endVal <= 0 || years <= 0) return undefined;
  return (Math.pow(endVal / startVal, 1 / years) - 1) * 100;
}

function getMetricValue(row: HistoricalYear, metric: CAGRMetric): number | undefined {
  switch (metric) {
    case 'revenue': return row.revenue;
    case 'ebit': return row.ebit;
    case 'ebitda': return row.ebitda;
    case 'eps': return row.earnings_per_share;
    case 'net_income': return row.net_income;
    case 'dividend': return row.dividend;
  }
}

/** Header cell that shows CAGR popup on click */
function CAGRHeaderCell({ 
  label, 
  metric, 
  yearlyData, 
  className 
}: { 
  label: string; 
  metric: CAGRMetric; 
  yearlyData: HistoricalYear[]; 
  className?: string;
}) {
  const sorted = useMemo(() => 
    [...yearlyData].sort((a, b) => a.fiscal_year - b.fiscal_year), 
    [yearlyData]
  );
  
  const latestYear = sorted[sorted.length - 1];
  if (!latestYear) return <TableHead className={className}>{label}</TableHead>;

  const periods = [3, 5, 10] as const;
  const cagrs = periods.map(p => {
    const startRow = sorted.find(r => r.fiscal_year === latestYear.fiscal_year - p);
    if (!startRow) return undefined;
    const startVal = getMetricValue(startRow, metric);
    const endVal = getMetricValue(latestYear, metric);
    if (startVal === undefined || endVal === undefined) return undefined;
    return computeCAGR(startVal, endVal, p);
  });

  const hasAnyCagr = cagrs.some(c => c !== undefined);

  if (!hasAnyCagr) {
    return <TableHead className={className}>{label}</TableHead>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TableHead className={cn(className, 'cursor-pointer hover:bg-muted/50 select-none')}>
          <span className="underline decoration-dotted underline-offset-4">{label}</span>
        </TableHead>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="center">
        <p className="text-xs font-semibold text-muted-foreground mb-2">CAGR — {label}</p>
        <div className="space-y-1.5">
          {periods.map((p, i) => (
            <div key={p} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{p} år</span>
              <span className={cn(
                'font-mono font-medium',
                cagrs[i] !== undefined && cagrs[i]! > 0 && 'text-success',
                cagrs[i] !== undefined && cagrs[i]! < 0 && 'text-destructive',
              )}>
                {cagrs[i] !== undefined ? `${cagrs[i]! > 0 ? '+' : ''}${cagrs[i]!.toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function HistoricalDataTable({
  data,
  currency = 'SEK',
  sharesOutstanding,
  currentPrice,
  onRowClick,
}: HistoricalDataTableProps) {
  const { language } = useLanguage();
  const [perShare, setPerShare] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [growthMode, setGrowthMode] = useState<'yoy' | 'sequential'>('yoy');

  const canToggle = !!sharesOutstanding && sharesOutstanding > 0;

  const yearlyData = useMemo(() => data.filter(d => !d.quarter), [data]);

  const formatNumber = (value: number | undefined, decimals = 0) => {
    if (value === undefined || value === null) return '—';
    const displayValue = perShare && canToggle ? (value * 1_000_000) / sharesOutstanding! : value;
    const dec = perShare ? 2 : decimals;
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', {
      minimumFractionDigits: dec, maximumFractionDigits: dec,
    }).format(displayValue);
  };

  const formatPercent = (value: number | undefined) => {
    if (value === undefined || value === null) return '—';
    return `${value.toFixed(1)}%`;
  };

  const formatRatio = (value: number | undefined) => {
    if (value === undefined || value === null) return '—';
    return value.toFixed(1) + 'x';
  };

  const getGrowthBadge = (growth: number | undefined) => {
    if (growth === undefined || growth === null) return null;
    if (growth > 10) {
      return <Badge variant="outline" className="text-success border-success/50 gap-1"><TrendingUp className="h-3 w-3" />{growth.toFixed(0)}%</Badge>;
    } else if (growth < -10) {
      return <Badge variant="outline" className="text-destructive border-destructive/50 gap-1"><TrendingDown className="h-3 w-3" />{growth.toFixed(0)}%</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground gap-1"><Minus className="h-3 w-3" />{growth.toFixed(0)}%</Badge>;
  };

  const isQuarterly = data.some(d => d.quarter);

  const sortedData = useMemo(() => {
    const seen = new Map<string, HistoricalYear>();
    for (const row of data) {
      const key = row.quarter ? `${row.fiscal_year}-Q${row.quarter}` : String(row.fiscal_year);
      if (!seen.has(key)) seen.set(key, row);
    }
    const unique = Array.from(seen.values());
    unique.sort((a, b) => {
      if (a.fiscal_year !== b.fiscal_year) return a.fiscal_year - b.fiscal_year;
      return (a.quarter ?? 0) - (b.quarter ?? 0);
    });

    const calcGrowth = (curr: number | undefined, prev: number | undefined) => {
      if (curr === undefined || prev === undefined) return undefined;
      if ((prev > 0 && curr > 0) || (prev < 0 && curr < 0)) {
        return ((curr - prev) / Math.abs(prev)) * 100;
      }
      return undefined; // skip sign changes
    };

    const withGrowth = unique.map((row, index) => {
      let prev: HistoricalYear | undefined;
      if (isQuarterly && growthMode === 'yoy') {
        prev = unique.find(r => r.fiscal_year === row.fiscal_year - 1 && r.quarter === row.quarter);
      } else {
        prev = unique[index - 1];
      }
      return {
        ...row,
        revenue_growth: calcGrowth(row.revenue, prev?.revenue),
        _epsGrowth: calcGrowth(row.earnings_per_share, prev?.earnings_per_share),
        _ebitGrowth: calcGrowth(row.ebit, prev?.ebit),
        _ebitdaGrowth: calcGrowth(row.ebitda, prev?.ebitda),
      };
    });

    return [...withGrowth].sort((a, b) => {
      if (a.fiscal_year !== b.fiscal_year) return b.fiscal_year - a.fiscal_year;
      return (b.quarter ?? 0) - (a.quarter ?? 0);
    });
  }, [data, growthMode, isQuarterly]);

  const cagrData = useMemo(() => {
    const yd = data.filter(d => !d.quarter).sort((a, b) => a.fiscal_year - b.fiscal_year);
    if (yd.length < 2) return {};
    const result: Record<number, { cagrRevenue?: number; cagrProfit?: number }> = {};
    for (let i = 0; i < yd.length; i++) {
      const current = yd[i];
      const lookback = 3;
      const pastIdx = i - lookback;
      if (pastIdx >= 0) {
        const past = yd[pastIdx];
        if (past.revenue && past.revenue > 0 && current.revenue && current.revenue > 0) {
          result[current.fiscal_year] = {
            ...result[current.fiscal_year],
            cagrRevenue: (Math.pow(current.revenue / past.revenue, 1 / lookback) - 1) * 100,
          };
        }
        if (past.net_income && past.net_income > 0 && current.net_income && current.net_income > 0) {
          result[current.fiscal_year] = {
            ...result[current.fiscal_year],
            cagrProfit: (Math.pow(current.net_income / past.net_income, 1 / lookback) - 1) * 100,
          };
        }
      }
    }
    return result;
  }, [data]);

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const isVisible = (key: ColumnKey) => visibleColumns.includes(key);

  const computeEV = (row: HistoricalYear) => {
    if (!currentPrice || !sharesOutstanding) return undefined;
    const marketCapMSEK = (currentPrice * sharesOutstanding) / 1_000_000;
    const debt = row.total_debt ?? 0;
    const cash = row.cash ?? 0;
    return marketCapMSEK + debt - cash;
  };

  const computeNetDebt = (row: HistoricalYear) => {
    const debt = row.total_debt ?? 0;
    const cash = row.cash ?? 0;
    if (debt === 0 && cash === 0) return undefined;
    return debt - cash;
  };

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Historisk Data</CardTitle>
          <CardDescription>Importera finansiell data för att se historiska trender</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">Ingen historisk data tillgänglig.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5" />Historisk Data</CardTitle>
            <CardDescription>
              {sortedData.length} {isQuarterly ? 'kvartal' : 'år'} · Klicka på kolumnrubrik för CAGR
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1"><Settings2 className="h-3.5 w-3.5" />Kolumner</Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="space-y-3">
                  {['Resultat', 'Marginaler', 'Värdering', 'Tillväxt', 'Skuld'].map(group => (
                    <div key={group}>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">{group}</p>
                      {ALL_COLUMNS.filter(c => c.group === group).map(col => (
                        <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer">
                          <Checkbox checked={isVisible(col.key)} onCheckedChange={() => toggleColumn(col.key)} />
                          <span className="text-sm">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Tabs value={growthMode} onValueChange={(v) => setGrowthMode(v as 'yoy' | 'sequential')}>
              <TabsList className="h-8">
                <TabsTrigger value="yoy" className="text-xs px-2 h-6">YoY</TabsTrigger>
                <TabsTrigger value="sequential" className="text-xs px-2 h-6">Sekv.</TabsTrigger>
              </TabsList>
            </Tabs>
            {canToggle && (
              <Button variant={perShare ? 'default' : 'outline'} size="sm" onClick={() => setPerShare(!perShare)}>
                {perShare ? 'Per aktie' : 'Totalt'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 whitespace-nowrap">{isQuarterly ? 'Period' : 'År'}</TableHead>
                {isVisible('revenue') && (
                  <CAGRHeaderCell
                    label={perShare ? `Oms./aktie (${currency})` : `Omsättning (M${currency})`}
                    metric="revenue"
                    yearlyData={yearlyData}
                    className="text-right whitespace-nowrap"
                  />
                )}
                {isVisible('growth') && <TableHead className="text-center whitespace-nowrap">Oms. tillväxt</TableHead>}
                {isVisible('ebit') && (
                  <CAGRHeaderCell
                    label={perShare ? `EBIT/aktie (${currency})` : `EBIT (M${currency})`}
                    metric="ebit"
                    yearlyData={yearlyData}
                    className="text-right whitespace-nowrap"
                  />
                )}
                {isVisible('ebit_growth') && <TableHead className="text-center whitespace-nowrap">EBIT tillväxt</TableHead>}
                {isVisible('ebitda') && (
                  <CAGRHeaderCell
                    label={perShare ? `EBITDA/aktie (${currency})` : `EBITDA (M${currency})`}
                    metric="ebitda"
                    yearlyData={yearlyData}
                    className="text-right whitespace-nowrap"
                  />
                )}
                {isVisible('ebitda_growth') && <TableHead className="text-center whitespace-nowrap">EBITDA tillväxt</TableHead>}
                {isVisible('dividend') && (
                  <CAGRHeaderCell
                    label={perShare ? `Utd./aktie (${currency})` : `Utdelning (M${currency})`}
                    metric="dividend"
                    yearlyData={yearlyData}
                    className="text-right whitespace-nowrap"
                  />
                )}
                {isVisible('eps') && (
                  <CAGRHeaderCell
                    label={`VPA (${currency})`}
                    metric="eps"
                    yearlyData={yearlyData}
                    className="text-right whitespace-nowrap"
                  />
                )}
                {isVisible('eps_growth') && <TableHead className="text-center whitespace-nowrap">VPA tillväxt</TableHead>}
                {isVisible('gross_margin') && <TableHead className="text-right whitespace-nowrap">Brutto %</TableHead>}
                {isVisible('operating_margin') && <TableHead className="text-right whitespace-nowrap">EBIT %</TableHead>}
                {isVisible('net_margin') && <TableHead className="text-right whitespace-nowrap">Vinst %</TableHead>}
                {isVisible('pe') && <TableHead className="text-right whitespace-nowrap">P/E</TableHead>}
                {isVisible('ev') && <TableHead className="text-right whitespace-nowrap">EV (M{currency})</TableHead>}
                {isVisible('ev_ebit') && <TableHead className="text-right whitespace-nowrap">EV/EBIT</TableHead>}
                {isVisible('ev_ebitda') && <TableHead className="text-right whitespace-nowrap">EV/EBITDA</TableHead>}
                {isVisible('cagr_revenue') && <TableHead className="text-right whitespace-nowrap">CAGR Oms. (3å)</TableHead>}
                {isVisible('cagr_profit') && <TableHead className="text-right whitespace-nowrap">CAGR Vinst (3å)</TableHead>}
                {isVisible('debt') && <TableHead className="text-right whitespace-nowrap">Nettoskuld (M{currency})</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => {
                const ev = computeEV(row);
                const evEbit = ev && row.ebit && row.ebit > 0 ? ev / row.ebit : undefined;
                const evEbitda = ev && row.ebitda && row.ebitda > 0 ? ev / row.ebitda : undefined;
                const pe = currentPrice && row.earnings_per_share && row.earnings_per_share > 0 ? currentPrice / row.earnings_per_share : undefined;
                const netDebt = computeNetDebt(row);
                const cagr = cagrData[row.fiscal_year];
                const label = row.quarter ? `${row.fiscal_year} Q${row.quarter}` : String(row.fiscal_year);
                return (
                  <TableRow key={label} className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}>
                    <TableCell className="font-medium whitespace-nowrap">{label}</TableCell>
                    {isVisible('revenue') && <TableCell className="text-right font-mono text-sm">{formatNumber(row.revenue)}</TableCell>}
                    {isVisible('growth') && <TableCell className="text-center">{getGrowthBadge(row.revenue_growth)}</TableCell>}
                    {isVisible('ebit') && <TableCell className="text-right font-mono text-sm">{formatNumber(row.ebit)}</TableCell>}
                    {isVisible('ebit_growth') && <TableCell className="text-center">{getGrowthBadge((row as any)._ebitGrowth)}</TableCell>}
                    {isVisible('ebitda') && <TableCell className="text-right font-mono text-sm">{formatNumber(row.ebitda)}</TableCell>}
                    {isVisible('ebitda_growth') && <TableCell className="text-center">{getGrowthBadge((row as any)._ebitdaGrowth)}</TableCell>}
                    {isVisible('dividend') && <TableCell className="text-right font-mono text-sm">{row.dividend !== undefined ? formatNumber(row.dividend, 2) : '—'}</TableCell>}
                    {isVisible('eps') && <TableCell className="text-right font-mono text-sm">{row.earnings_per_share !== undefined ? row.earnings_per_share.toFixed(2) : '—'}</TableCell>}
                    {isVisible('eps_growth') && <TableCell className="text-center">{getGrowthBadge((row as any)._epsGrowth)}</TableCell>}
                    {isVisible('gross_margin') && <TableCell className="text-right font-mono text-sm">{formatPercent(row.gross_margin)}</TableCell>}
                    {isVisible('operating_margin') && <TableCell className="text-right font-mono text-sm">{formatPercent(row.operating_margin)}</TableCell>}
                    {isVisible('net_margin') && <TableCell className="text-right font-mono text-sm">{formatPercent(row.net_margin)}</TableCell>}
                    {isVisible('pe') && <TableCell className="text-right font-mono text-sm">{formatRatio(pe)}</TableCell>}
                    {isVisible('ev') && <TableCell className="text-right font-mono text-sm">{ev !== undefined ? formatNumber(ev) : '—'}</TableCell>}
                    {isVisible('ev_ebit') && <TableCell className="text-right font-mono text-sm">{formatRatio(evEbit)}</TableCell>}
                    {isVisible('ev_ebitda') && <TableCell className="text-right font-mono text-sm">{formatRatio(evEbitda)}</TableCell>}
                    {isVisible('cagr_revenue') && <TableCell className="text-right font-mono text-sm">{cagr?.cagrRevenue !== undefined ? formatPercent(cagr.cagrRevenue) : '—'}</TableCell>}
                    {isVisible('cagr_profit') && <TableCell className="text-right font-mono text-sm">{cagr?.cagrProfit !== undefined ? formatPercent(cagr.cagrProfit) : '—'}</TableCell>}
                    {isVisible('debt') && <TableCell className="text-right font-mono text-sm">{netDebt !== undefined ? formatNumber(netDebt) : '—'}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
