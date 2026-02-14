import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
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
}

type ColumnKey = 'revenue' | 'growth' | 'ebit' | 'ebitda' | 'net_income' | 'dividend' | 'eps' | 'gross_margin' | 'operating_margin' | 'net_margin' | 'ev' | 'ev_ebit' | 'ev_ebitda';

const ALL_COLUMNS: { key: ColumnKey; label: string; group: string }[] = [
  { key: 'revenue', label: 'Omsättning', group: 'Resultat' },
  { key: 'growth', label: 'Tillväxt', group: 'Resultat' },
  { key: 'ebit', label: 'EBIT', group: 'Resultat' },
  { key: 'ebitda', label: 'EBITDA', group: 'Resultat' },
  { key: 'net_income', label: 'Nettores.', group: 'Resultat' },
  { key: 'dividend', label: 'Utdelning', group: 'Resultat' },
  { key: 'eps', label: 'Vinst/aktie', group: 'Resultat' },
  { key: 'gross_margin', label: 'Bruttomarginal', group: 'Marginaler' },
  { key: 'operating_margin', label: 'Rörelsemarginal', group: 'Marginaler' },
  { key: 'net_margin', label: 'Nettomarginal', group: 'Marginaler' },
  { key: 'ev', label: 'EV', group: 'Värdering' },
  { key: 'ev_ebit', label: 'EV/EBIT', group: 'Värdering' },
  { key: 'ev_ebitda', label: 'EV/EBITDA', group: 'Värdering' },
];

const DEFAULT_COLUMNS: ColumnKey[] = ['revenue', 'growth', 'ebit', 'net_income', 'operating_margin', 'net_margin'];

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

  const canToggle = !!sharesOutstanding && sharesOutstanding > 0;

  const formatNumber = (value: number | undefined, decimals = 0) => {
    if (value === undefined || value === null) return '—';
    const displayValue = perShare && canToggle ? value / sharesOutstanding! : value;
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

  const dataWithGrowth = data.map((row, index) => {
    const prevYear = data[index - 1];
    let revenueGrowth: number | undefined;
    if (prevYear && prevYear.revenue && row.revenue) {
      revenueGrowth = ((row.revenue - prevYear.revenue) / prevYear.revenue) * 100;
    }
    return { ...row, revenue_growth: row.revenue_growth ?? revenueGrowth };
  });

  const sortedData = [...dataWithGrowth].sort((a, b) => {
    if (a.fiscal_year !== b.fiscal_year) return b.fiscal_year - a.fiscal_year;
    return (b.quarter ?? 0) - (a.quarter ?? 0);
  });

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const isVisible = (key: ColumnKey) => visibleColumns.includes(key);

  // Compute EV for a given row
  const computeEV = (row: HistoricalYear) => {
    if (!currentPrice || !sharesOutstanding) return undefined;
    const marketCap = currentPrice * sharesOutstanding;
    const debt = row.total_debt ?? 0;
    const cash = row.cash ?? 0;
    return marketCap + debt - cash;
  };

  const isQuarterly = data.some(d => d.quarter);

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
                  {['Resultat', 'Marginaler', 'Värdering'].map(group => (
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
                <TableHead className="w-16">{isQuarterly ? 'Period' : 'År'}</TableHead>
                {isVisible('revenue') && <TableHead className="text-right">{perShare ? 'Oms./aktie' : 'Omsättning'}</TableHead>}
                {isVisible('growth') && <TableHead className="text-center">Tillväxt</TableHead>}
                {isVisible('ebit') && <TableHead className="text-right">{perShare ? 'EBIT/aktie' : 'EBIT'}</TableHead>}
                {isVisible('ebitda') && <TableHead className="text-right">{perShare ? 'EBITDA/aktie' : 'EBITDA'}</TableHead>}
                {isVisible('net_income') && <TableHead className="text-right">{perShare ? 'Vinst/aktie' : 'Nettores.'}</TableHead>}
                {isVisible('dividend') && <TableHead className="text-right">Utdelning</TableHead>}
                {isVisible('eps') && <TableHead className="text-right">VPA</TableHead>}
                {isVisible('gross_margin') && <TableHead className="text-right">Brutto %</TableHead>}
                {isVisible('operating_margin') && <TableHead className="text-right">EBIT %</TableHead>}
                {isVisible('net_margin') && <TableHead className="text-right">Netto %</TableHead>}
                {isVisible('ev') && <TableHead className="text-right">EV</TableHead>}
                {isVisible('ev_ebit') && <TableHead className="text-right">EV/EBIT</TableHead>}
                {isVisible('ev_ebitda') && <TableHead className="text-right">EV/EBITDA</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => {
                const ev = computeEV(row);
                const evEbit = ev && row.ebit && row.ebit > 0 ? ev / row.ebit : undefined;
                const evEbitda = ev && row.ebitda && row.ebitda > 0 ? ev / row.ebitda : undefined;
                const label = row.quarter ? `${row.fiscal_year} Q${row.quarter}` : String(row.fiscal_year);
                return (
                  <TableRow key={label} className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')} onClick={() => onRowClick?.(row.fiscal_year)}>
                    <TableCell className="font-medium">{label}</TableCell>
                    {isVisible('revenue') && <TableCell className="text-right font-mono text-sm">{formatNumber(row.revenue)}</TableCell>}
                    {isVisible('growth') && <TableCell className="text-center">{getGrowthBadge(row.revenue_growth)}</TableCell>}
                    {isVisible('ebit') && <TableCell className="text-right font-mono text-sm">{formatNumber(row.ebit)}</TableCell>}
                    {isVisible('ebitda') && <TableCell className="text-right font-mono text-sm">{formatNumber(row.ebitda)}</TableCell>}
                    {isVisible('net_income') && <TableCell className="text-right font-mono text-sm">{formatNumber(row.net_income)}</TableCell>}
                    {isVisible('dividend') && <TableCell className="text-right font-mono text-sm">{row.dividend !== undefined ? formatNumber(row.dividend, 2) : '—'}</TableCell>}
                    {isVisible('eps') && <TableCell className="text-right font-mono text-sm">{row.earnings_per_share !== undefined ? row.earnings_per_share.toFixed(2) : '—'}</TableCell>}
                    {isVisible('gross_margin') && <TableCell className="text-right font-mono text-sm">{formatPercent(row.gross_margin)}</TableCell>}
                    {isVisible('operating_margin') && <TableCell className="text-right font-mono text-sm">{formatPercent(row.operating_margin)}</TableCell>}
                    {isVisible('net_margin') && <TableCell className="text-right font-mono text-sm">{formatPercent(row.net_margin)}</TableCell>}
                    {isVisible('ev') && <TableCell className="text-right font-mono text-sm">{ev !== undefined ? formatNumber(ev) : '—'}</TableCell>}
                    {isVisible('ev_ebit') && <TableCell className="text-right font-mono text-sm">{formatRatio(evEbit)}</TableCell>}
                    {isVisible('ev_ebitda') && <TableCell className="text-right font-mono text-sm">{formatRatio(evEbitda)}</TableCell>}
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
