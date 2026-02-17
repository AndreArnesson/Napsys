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

type ColumnKey = 'revenue' | 'growth' | 'ebit' | 'ebitda' | 'net_income' | 'dividend' | 'eps' | 'eps_growth' | 'gross_margin' | 'operating_margin' | 'net_margin' | 'pe' | 'ev' | 'ev_ebit' | 'ev_ebitda' | 'cagr_revenue' | 'cagr_profit' | 'debt';

const ALL_COLUMNS: { key: ColumnKey; label: string; group: string }[] = [
  { key: 'revenue', label: 'Omsättning', group: 'Resultat' },
  { key: 'growth', label: 'Oms. tillväxt', group: 'Resultat' },
  { key: 'ebit', label: 'EBIT', group: 'Resultat' },
  { key: 'ebitda', label: 'EBITDA', group: 'Resultat' },
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

const DEFAULT_COLUMNS: ColumnKey[] = ['revenue', 'growth', 'ebit', 'eps', 'eps_growth', 'operating_margin', 'net_margin'];

interface HistoricalDataTableProps {
  data: HistoricalYear[];
  currency?: string;
  sharesOutstanding?: number;
  currentPrice?: number;
  onRowClick?: (year: number) => void;
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

  const formatNumber = (value: number | undefined, decimals = 0) => {
    if (value === undefined || value === null) return '—';
    // Values are in MSEK; convert to SEK before dividing by shares
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

  // Deduplicate and sort data with growth calculations
  const sortedData = useMemo(() => {
    const seen = new Map<string, HistoricalYear>();
    for (const row of data) {
      const key = row.quarter ? `${row.fiscal_year}-Q${row.quarter}` : String(row.fiscal_year);
      if (!seen.has(key)) seen.set(key, row);
    }
    const unique = Array.from(seen.values());
    // Sort ascending for growth calc
    unique.sort((a, b) => {
      if (a.fiscal_year !== b.fiscal_year) return a.fiscal_year - b.fiscal_year;
      return (a.quarter ?? 0) - (b.quarter ?? 0);
    });

    const withGrowth = unique.map((row, index) => {
      let prev: HistoricalYear | undefined;
      if (isQuarterly && growthMode === 'yoy') {
        // Find same quarter previous year
        prev = unique.find(r => r.fiscal_year === row.fiscal_year - 1 && r.quarter === row.quarter);
      } else {
        prev = unique[index - 1];
      }
      const revenueGrowth = prev?.revenue && row.revenue
        && ((prev.revenue > 0 && row.revenue > 0) || (prev.revenue < 0 && row.revenue < 0))
        ? ((row.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100 : undefined;
      const epsGrowth = prev?.earnings_per_share && row.earnings_per_share
        && ((prev.earnings_per_share > 0 && row.earnings_per_share > 0) || (prev.earnings_per_share < 0 && row.earnings_per_share < 0))
        ? ((row.earnings_per_share - prev.earnings_per_share) / Math.abs(prev.earnings_per_share)) * 100 : undefined;
      return { ...row, revenue_growth: revenueGrowth, _epsGrowth: epsGrowth };
    });

    return [...withGrowth].sort((a, b) => {
      if (a.fiscal_year !== b.fiscal_year) return b.fiscal_year - a.fiscal_year;
      return (b.quarter ?? 0) - (a.quarter ?? 0);
    });
  }, [data, growthMode, isQuarterly]);

  // Compute CAGR values
  const cagrData = useMemo(() => {
    const yearlyData = data.filter(d => !d.quarter).sort((a, b) => a.fiscal_year - b.fiscal_year);
    if (yearlyData.length < 2) return {};
    const result: Record<number, { cagrRevenue?: number; cagrProfit?: number }> = {};
    for (let i = 0; i < yearlyData.length; i++) {
      const current = yearlyData[i];
      // 3-year CAGR
      const lookback = 3;
      const pastIdx = i - lookback;
      if (pastIdx >= 0) {
        const past = yearlyData[pastIdx];
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

  // isQuarterly moved above sortedData

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
              {sortedData.length} {isQuarterly ? 'kvartal' : 'år'}
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
                {isVisible('revenue') && <TableHead className="text-right whitespace-nowrap">{perShare ? `Oms./aktie (${currency})` : `Omsättning (M${currency})`}</TableHead>}
                {isVisible('growth') && <TableHead className="text-center whitespace-nowrap">Oms. tillväxt</TableHead>}
                {isVisible('ebit') && <TableHead className="text-right whitespace-nowrap">{perShare ? `EBIT/aktie (${currency})` : `EBIT (M${currency})`}</TableHead>}
                {isVisible('ebitda') && <TableHead className="text-right whitespace-nowrap">{perShare ? `EBITDA/aktie (${currency})` : `EBITDA (M${currency})`}</TableHead>}
                {isVisible('dividend') && <TableHead className="text-right whitespace-nowrap">{perShare ? `Utd./aktie (${currency})` : `Utdelning (M${currency})`}</TableHead>}
                {isVisible('eps') && <TableHead className="text-right whitespace-nowrap">VPA ({currency})</TableHead>}
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
                    {isVisible('ebitda') && <TableCell className="text-right font-mono text-sm">{formatNumber(row.ebitda)}</TableCell>}
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
