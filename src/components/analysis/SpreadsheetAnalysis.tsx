import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Calculator, TrendingUp, TrendingDown, Minus, Plus, Trash2, SlidersHorizontal, ArrowRightLeft } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ALL_ESTIMATE_ROWS: { key: string; label: string; group: string }[] = [
  { key: 'price', label: 'Kurs', group: 'Grunddata' },
  { key: 'revenueGrowth', label: 'Omsättningstillväxt', group: 'Grunddata' },
  { key: 'revenue', label: 'Omsättning', group: 'Grunddata' },
  { key: 'revenuePerShare', label: 'Omsättning/aktie', group: 'Grunddata' },
  { key: 'ebit', label: 'EBIT', group: 'Grunddata' },
  { key: 'ebitda', label: 'EBITDA', group: 'Grunddata' },
  { key: 'netMargin', label: 'Vinstmarginal', group: 'Marginaler' },
  { key: 'ebitMargin', label: 'EBIT-marginal', group: 'Marginaler' },
  { key: 'ebitdaMargin', label: 'EBITDA-marginal', group: 'Marginaler' },
  { key: 'earningsPerShare', label: 'Vinst/aktie', group: 'Värdering' },
  { key: 'epsGrowth', label: 'VPA-tillväxt', group: 'Värdering' },
  { key: 'dividend', label: 'Utdelning', group: 'Utdelning' },
  { key: 'dividendYield', label: 'Direktavkastning', group: 'Utdelning' },
  { key: 'pe', label: 'P/E', group: 'Värdering' },
  { key: 'ev', label: 'EV', group: 'Värdering' },
  { key: 'evEbit', label: 'EV/EBIT', group: 'Värdering' },
  { key: 'evEbitda', label: 'EV/EBITDA', group: 'Värdering' },
  { key: 'targetPE', label: 'Rimlig P/E', group: 'Värdering' },
  { key: 'estimatedPrice', label: 'Estimerad kurs', group: 'Värdering' },
  { key: 'mos', label: 'MOS', group: 'Värdering' },
];

const DEFAULT_ESTIMATE_ROWS = [
  'price', 'revenueGrowth', 'revenue', 'ebit', 'ebitda', 'netMargin',
  'earningsPerShare', 'epsGrowth', 'dividend', 'dividendYield',
  'pe', 'ev', 'evEbit', 'evEbitda', 'targetPE', 'estimatedPrice', 'mos',
];

export interface YearlyProjection {
  year: number;
  quarter?: number;
  revenue?: number;
  ebit?: number;
  ebitda?: number;
  price?: number;
  revenueGrowth?: number;
  revenuePerShare?: number;
  netMargin?: number;
  ebitMargin?: number;
  ebitdaMargin?: number;
  earningsPerShare?: number;
  epsGrowth?: number;
  targetPE?: number;
  estimatedPrice?: number;
  mos?: number;
  dividend?: number;
  dividendYield?: number;
  ev?: number;
  evEbit?: number;
  evEbitda?: number;
}

interface SpreadsheetAnalysisProps {
  analysisDate?: string;
  currentPrice: number;
  sharesOutstanding: number;
  historicalData?: { year: number; revenue: number; netIncome: number }[];
  quarterlyHistoricalData?: { year: number; quarter: number; revenue: number; netIncome: number }[];
  projections: YearlyProjection[];
  onProjectionsChange: (projections: YearlyProjection[]) => void;
  rating?: 'buy' | 'hold' | 'sell';
  onRatingChange?: (rating: 'buy' | 'hold' | 'sell') => void;
  notes?: string;
  onNotesChange?: (notes: string) => void;
  currency?: string;
  showQuarterly?: boolean;
  netDebt?: number;
}

interface ColumnDef {
  year: number;
  quarter?: number;
  label: string;
  sublabel: string;
}

export function SpreadsheetAnalysis({
  analysisDate,
  currentPrice,
  sharesOutstanding,
  historicalData = [],
  projections,
  onProjectionsChange,
  rating,
  onRatingChange,
  notes,
  onNotesChange,
  currency = 'SEK',
  showQuarterly = false,
  quarterlyHistoricalData = [],
  netDebt = 0,
}: SpreadsheetAnalysisProps) {
  const { t, language } = useLanguage();
  const [targetPE, setTargetPE] = useState(15);
  const [mode, setMode] = useState<'yearly' | 'quarterly'>(showQuarterly ? 'quarterly' : 'yearly');
  const [perShare, setPerShare] = useState(false);
  const [visibleRows, setVisibleRows] = useState<string[]>(DEFAULT_ESTIMATE_ROWS);
  const [qGrowthMode, setQGrowthMode] = useState<'yoy' | 'sequential'>('yoy');

  const currentYear = new Date().getFullYear();
  const defaultYears = [currentYear, currentYear + 1];
  
  // Derive initial estimateYears from saved projections if they exist
  const initialYears = useMemo(() => {
    if (projections.length > 0) {
      const years = [...new Set(projections.map(p => p.year))].sort((a, b) => a - b);
      if (years.length > 0) return years;
    }
    return defaultYears;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const [estimateYears, setEstimateYears] = useState<number[]>(initialYears);

  const addEstimateColumn = () => {
    const maxYear = Math.max(...estimateYears);
    setEstimateYears(prev => [...prev, maxYear + 1]);
  };

  const removeEstimateColumn = (year: number) => {
    if (estimateYears.length <= 1) return;
    setEstimateYears(prev => prev.filter(y => y !== year));
  };

  const columns: ColumnDef[] = useMemo(() => {
    const sortedYears = [...estimateYears].sort((a, b) => a - b);
    if (mode === 'quarterly') {
      const cols: ColumnDef[] = [];
      for (const y of sortedYears) {
        for (let q = 1; q <= 4; q++) {
          cols.push({
            year: y,
            quarter: q,
            label: `${y} Q${q}`,
            sublabel: y === currentYear && q === 1 ? 'Nu' : '',
          });
        }
      }
      return cols;
    }
    return sortedYears.map(year => ({
      year,
      label: year === currentYear ? `${currentYear} (Nu)` : String(year),
      sublabel: `År ${year - currentYear}`,
    }));
  }, [mode, currentYear, estimateYears]);

  const formatNumber = (value: number | undefined, decimals = 2) => {
    if (value === undefined || isNaN(value)) return '—';
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const formatPercent = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return '—';
    const formatted = value.toFixed(2);
    const isPositive = value > 0;
    const isNegative = value < 0;
    return (
      <span className={cn(isPositive && 'text-success', isNegative && 'text-destructive')}>
        {isPositive ? '+' : ''}{formatted}%
      </span>
    );
  };

  const getMOSColor = (mos: number | undefined) => {
    if (mos === undefined || isNaN(mos)) return '';
    if (mos >= 30) return 'bg-emerald-600 text-white';
    if (mos >= 15) return 'bg-emerald-500 text-white';
    if (mos >= 0) return 'bg-amber-500 text-white';
    if (mos >= -15) return 'bg-orange-600 text-white';
    return 'bg-red-600 text-white';
  };

  const findProj = (col: ColumnDef): YearlyProjection => {
    return projections.find(p => p.year === col.year && (p.quarter || undefined) === col.quarter) || { year: col.year, quarter: col.quarter };
  };

  // Get previous period's revenue for growth calculations
  const getPrevRevenue = (colIndex: number): number | undefined => {
    if (colIndex === 0) {
      // Use last historical data point
      if (historicalData.length > 0) {
        return historicalData[historicalData.length - 1].revenue;
      }
      return undefined;
    }
    // Use previous column's calculated revenue
    const prevCol = columns[colIndex - 1];
    const prevProj = findProj(prevCol);
    return prevProj.revenue;
  };

  const calculatedProjections = useMemo(() => {
    const results: (YearlyProjection & ColumnDef & { calculatedRevenue?: number; calculatedEbit?: number; calculatedEps?: number })[] = [];
    
    // Helper: get previous period value based on growth mode
    const getPrev = (i: number, col: ColumnDef, field: 'calculatedRevenue' | 'calculatedEps'): number | undefined => {
      if (mode === 'quarterly' && col.quarter) {
        if (qGrowthMode === 'yoy') {
          // YoY: compare same quarter previous year
          if (i >= 4) return results[i - 4]?.[field];
          const hist = quarterlyHistoricalData.find(h => h.quarter === col.quarter && h.year === col.year - 1);
          if (hist && field === 'calculatedRevenue') return hist.revenue;
          // Fallback: try sequential when no YoY data
          if (i > 0) return results[i - 1]?.[field];
          return undefined;
        } else {
          // Sequential: previous quarter
          if (i > 0) return results[i - 1]?.[field];
          // For first quarter, use last available historical quarter
          if (quarterlyHistoricalData.length > 0 && field === 'calculatedRevenue') {
            const sorted = [...quarterlyHistoricalData].sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter));
            return sorted[0]?.revenue;
          }
          return undefined;
        }
      }
      // Yearly
      if (i === 0 && historicalData.length > 0) {
        if (field === 'calculatedRevenue') return historicalData[historicalData.length - 1].revenue;
        if (field === 'calculatedEps') {
          const lastHist = historicalData[historicalData.length - 1];
          if (lastHist.netIncome && sharesOutstanding > 0) {
            return (lastHist.netIncome * 1_000_000) / sharesOutstanding;
          }
        }
        return undefined;
      }
      if (i > 0) return results[i - 1]?.[field];
      return undefined;
    };

    // Helper: check if two values have the same sign
    const sameSign = (a: number, b: number) => (a > 0 && b > 0) || (a < 0 && b < 0);

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const proj = findProj(col);
      const isFirst = i === 0 && mode === 'yearly';
      const price = isFirst ? currentPrice : proj.price || currentPrice;
      
      // Revenue from growth
      let revenue = proj.revenue;
      const growth = proj.revenueGrowth;
      
      if (revenue === undefined && growth !== undefined) {
        const prevRev = getPrev(i, col, 'calculatedRevenue');
        if (prevRev !== undefined && prevRev !== 0) {
          const computed = prevRev * (1 + growth / 100);
          // Only use if signs don't change
          if (sameSign(prevRev, computed)) {
            revenue = computed;
          }
        }
      }

      let ebit = proj.ebit;
      let ebitda = proj.ebitda;
      const netMargin = proj.netMargin || 0;
      
      const effectiveRevenue = revenue || 0;
      const revenuePerShare = sharesOutstanding > 0 ? (effectiveRevenue * 1_000_000) / sharesOutstanding : 0;
      const earningsPerShare = revenuePerShare * (netMargin / 100);
      const peToUse = proj.targetPE || targetPE;
      const estimatedPrice = earningsPerShare * peToUse;
      const mos = price > 0 ? ((estimatedPrice - price) / price) * 100 : 0;

      // EV = Market Cap + Net Debt (netDebt in MSEK, price * shares = SEK)
      const marketCap = (price * sharesOutstanding) / 1_000_000; // MSEK
      const calculatedEv = marketCap + netDebt; // MSEK
      const ev = proj.ev !== undefined ? proj.ev : calculatedEv; // User override or calculated

      // EV/EBIT and EV/EBITDA
      const evEbit = (ebit && ebit > 0 && ev > 0) ? ev / ebit : undefined;
      const evEbitda = (ebitda && ebitda > 0 && ev > 0) ? ev / ebitda : undefined;

      // Calculate actual revenue growth - skip if sign change
      let actualGrowth = growth;
      if (actualGrowth === undefined && revenue !== undefined) {
        const prevRev = getPrev(i, col, 'calculatedRevenue');
        if (prevRev && prevRev !== 0 && sameSign(prevRev, revenue)) {
          actualGrowth = ((revenue - prevRev) / Math.abs(prevRev)) * 100;
        }
      }

      // EPS growth - skip if sign change
      let epsGrowth: number | undefined;
      const prevEps = getPrev(i, col, 'calculatedEps');
      if (prevEps && prevEps !== 0 && earningsPerShare) {
        if (sameSign(prevEps, earningsPerShare)) {
          epsGrowth = ((earningsPerShare - prevEps) / Math.abs(prevEps)) * 100;
        }
      }

      const dividend = proj.dividend;
      const dividendYield = (dividend && price && price > 0) ? (dividend / price) * 100 : undefined;

      results.push({
        ...proj,
        ...col,
        price,
        revenue,
        ebitda,
        calculatedRevenue: revenue,
        calculatedEbit: ebit,
        calculatedEps: earningsPerShare,
        revenueGrowth: actualGrowth ?? growth ?? 0,
        revenuePerShare,
        netMargin,
        earningsPerShare,
        epsGrowth,
        targetPE: peToUse,
        estimatedPrice,
        mos,
        dividend,
        dividendYield,
        ev,
        evEbit,
        evEbitda,
      });
    }
    return results;
  }, [projections, currentPrice, targetPE, columns, mode, historicalData, sharesOutstanding, qGrowthMode, quarterlyHistoricalData, netDebt]);

  const updateProjection = (col: ColumnDef, field: keyof YearlyProjection, value: number) => {
    const existingIndex = projections.findIndex(p => p.year === col.year && (p.quarter || undefined) === col.quarter);
    const newProjections = [...projections];
    if (existingIndex >= 0) {
      newProjections[existingIndex] = { ...newProjections[existingIndex], [field]: value };
    } else {
      newProjections.push({ year: col.year, quarter: col.quarter, [field]: value });
    }
    onProjectionsChange(newProjections);
  };

  // Build rows dynamically based on perShare toggle and visible rows
  const rows: { label: string; key: string; editable: boolean; bg?: boolean }[] = useMemo(() => {
    const allRows: { label: string; key: string; editable: boolean; bg?: boolean }[] = [
      { label: `Kurs (${currency})`, key: 'price', editable: true, bg: true },
      { label: 'Omsättningstillv (%)', key: 'revenueGrowth', editable: true },
      { label: `Omsättning/aktie (${currency})`, key: 'revenuePerShare', editable: true },
      { label: `Omsättning (M${currency})`, key: 'revenue', editable: true },
      { label: `EBIT (M${currency})`, key: 'ebit', editable: true },
      { label: `EBITDA (M${currency})`, key: 'ebitda', editable: true },
      { label: 'Vinstmarginal (%)', key: 'netMargin', editable: true },
      { label: 'EBIT-marginal (%)', key: 'ebitMargin', editable: true },
      { label: 'EBITDA-marginal (%)', key: 'ebitdaMargin', editable: true },
      { label: `Vinst/aktie (${currency})`, key: 'earningsPerShare', editable: false, bg: true },
      { label: 'VPA-tillväxt (%)', key: 'epsGrowth', editable: false },
      { label: `Utdelning (${currency})`, key: 'dividend', editable: true },
      { label: 'Direktavkastning (%)', key: 'dividendYield', editable: false },
      { label: 'P/E', key: 'pe', editable: false },
      { label: `EV (M${currency})`, key: 'ev', editable: true, bg: true },
      { label: 'EV/EBIT', key: 'evEbit', editable: false },
      { label: 'EV/EBITDA', key: 'evEbitda', editable: false },
      { label: 'Rimlig P/E', key: 'targetPE', editable: true, bg: true },
      { label: `Estimerad kurs (${currency})`, key: 'estimatedPrice', editable: false },
      { label: 'MOS (%)', key: 'mos', editable: false },
    ];

    return allRows.filter(row => {
      if (!visibleRows.includes(row.key)) return false;
      // perShare logic: show revenuePerShare OR (revenue + ebit), not both
      if (perShare && (row.key === 'revenue' || row.key === 'ebit')) return false;
      if (!perShare && row.key === 'revenuePerShare') return false;
      return true;
    });
  }, [perShare, visibleRows, currency]);

  // Check which years have all 4 quarters filled with at least revenue or netMargin
  const yearsWithFullQuarters = useMemo(() => {
    return estimateYears.filter(year => {
      for (let q = 1; q <= 4; q++) {
        const proj = projections.find(p => p.year === year && p.quarter === q);
        if (!proj || (proj.revenue === undefined && proj.revenueGrowth === undefined && proj.netMargin === undefined)) {
          return false;
        }
      }
      return true;
    });
  }, [projections, estimateYears]);

  const convertQuartersToYearly = () => {
    const newProjections = [...projections];

    for (const year of yearsWithFullQuarters) {
      const quarters = [1, 2, 3, 4].map(q => {
        const calc = calculatedProjections.find(p => p.year === year && p.quarter === q);
        const raw = projections.find(p => p.year === year && p.quarter === q);
        return { calc, raw };
      });

      const sumField = (field: string) => {
        const vals = quarters.map(q => (q.calc as any)?.[field]).filter((v: any) => v !== undefined && !isNaN(v));
        return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) : undefined;
      };

      const avgField = (field: string) => {
        const vals = quarters.map(q => (q.calc as any)?.[field]).filter((v: any) => v !== undefined && v !== 0 && !isNaN(v));
        return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : undefined;
      };

      const yearlyProj: YearlyProjection = {
        year,
        revenue: sumField('revenue'),
        ebit: sumField('ebit'),
        ebitda: sumField('ebitda'),
        netMargin: avgField('netMargin'),
        price: quarters[3].calc?.price || quarters[3].raw?.price || currentPrice,
        dividend: sumField('dividend'),
        targetPE: quarters[3].raw?.targetPE || quarters[3].calc?.targetPE,
        ev: quarters[3].calc?.ev,
      };

      const existingIdx = newProjections.findIndex(p => p.year === year && !p.quarter);
      if (existingIdx >= 0) {
        newProjections[existingIdx] = { ...newProjections[existingIdx], ...yearlyProj };
      } else {
        newProjections.push(yearlyProj);
      }
    }

    onProjectionsChange(newProjections);
    setMode('yearly');
    toast.success(`${yearsWithFullQuarters.length} år konverterade från kvartal till helårsbasis`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Estimat
              </CardTitle>
              <CardDescription>
                {analysisDate ? `Analysis date: ${analysisDate}` : 'Skriv in dina estimat'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'yearly' | 'quarterly')}>
                <TabsList className="h-8">
                  <TabsTrigger value="yearly" className="text-xs px-3 h-7">Helår</TabsTrigger>
                  <TabsTrigger value="quarterly" className="text-xs px-3 h-7">Kvartal</TabsTrigger>
                </TabsList>
              </Tabs>
              {mode === 'quarterly' && (
                <Tabs value={qGrowthMode} onValueChange={(v) => setQGrowthMode(v as 'yoy' | 'sequential')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="yoy" className="text-xs px-3 h-7">YoY</TabsTrigger>
                    <TabsTrigger value="sequential" className="text-xs px-3 h-7">Sekventiell</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              {mode === 'quarterly' && yearsWithFullQuarters.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={convertQuartersToYearly}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Översätt kvartal till helårsbasis
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Per aktie</Label>
                <Switch checked={perShare} onCheckedChange={setPerShare} />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Rader
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="end">
                  <div className="space-y-3">
                    {Object.entries(
                      ALL_ESTIMATE_ROWS.reduce((acc, row) => {
                        if (!acc[row.group]) acc[row.group] = [];
                        acc[row.group].push(row);
                        return acc;
                      }, {} as Record<string, typeof ALL_ESTIMATE_ROWS>)
                    ).map(([group, groupRows]) => (
                      <div key={group}>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">{group}</p>
                        {groupRows.map(row => (
                          <label key={row.key} className="flex items-center gap-2 py-0.5 cursor-pointer">
                            <Checkbox
                              checked={visibleRows.includes(row.key)}
                              onCheckedChange={(checked) => {
                                setVisibleRows(prev =>
                                  checked ? [...prev, row.key] : prev.filter(k => k !== row.key)
                                );
                              }}
                            />
                            <span className="text-xs">{row.label}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Target P/E:</span>
                <Input
                  type="number"
                  className="w-20 h-8"
                  value={targetPE}
                  onChange={(e) => setTargetPE(parseFloat(e.target.value) || 15)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground w-48">Metric</th>
                  {calculatedProjections.map((proj, i) => {
                    // Only allow removing the last (rightmost) year, shown on Q1 in quarterly mode
                    const maxYear = Math.max(...estimateYears);
                    const showRemove = estimateYears.length > 1 && proj.year === maxYear
                      && (mode === 'yearly' || proj.quarter === 1);
                    return (
                      <th key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3 font-medium min-w-[110px]">
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-xs">{proj.label}</span>
                            {showRemove && (
                              <button
                                onClick={() => removeEstimateColumn(proj.year)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Ta bort"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          {proj.sublabel && <span className="text-[10px] text-muted-foreground font-normal">{proj.sublabel}</span>}
                        </div>
                      </th>
                    );
                  })}
                  <th className="py-2 px-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addEstimateColumn} title="Lägg till år">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.key} className={cn('border-b', row.bg && 'bg-muted/30')}>
                    <td className="py-2 px-3 font-medium">{row.label}</td>
                    {calculatedProjections.map((proj, i) => {
                      const col = columns[i];
                      const isFirstYearly = i === 0 && mode === 'yearly';

                      if (row.key === 'pe') {
                        let ttmEps: number | undefined;
                        if (mode === 'quarterly') {
                          // Trailing 12 months: sum current + previous 3 quarters' EPS
                          // Look back through calculated projections and quarterly historical data
                          const allQuarterEps: number[] = [];
                          // Gather EPS from calculated projections up to and including current index
                          for (let j = i; j >= 0 && allQuarterEps.length < 4; j--) {
                            const ep = calculatedProjections[j]?.earningsPerShare;
                            if (ep !== undefined) allQuarterEps.push(ep);
                          }
                          // If we still need more quarters, look at quarterly historical data
                          if (allQuarterEps.length < 4 && quarterlyHistoricalData.length > 0) {
                            const sorted = [...quarterlyHistoricalData].sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter));
                            for (const qh of sorted) {
                              if (allQuarterEps.length >= 4) break;
                              // Skip if this quarter is already covered by projections
                              const alreadyCovered = calculatedProjections.slice(0, i + 1).some(
                                p => p.year === qh.year && p.quarter === qh.quarter
                              );
                              if (alreadyCovered) continue;
                              if (qh.netIncome && sharesOutstanding > 0) {
                                allQuarterEps.push((qh.netIncome * 1_000_000) / sharesOutstanding);
                              }
                            }
                          }
                          if (allQuarterEps.length === 4) {
                            ttmEps = allQuarterEps.reduce((sum, v) => sum + v, 0);
                          }
                        } else {
                          ttmEps = proj.earningsPerShare;
                        }
                        const pe = ttmEps && ttmEps > 0 && proj.price ? proj.price / ttmEps : undefined;
                        return (
                          <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3 font-mono">
                            {pe !== undefined ? formatNumber(pe, 1) : '—'}
                          </td>
                        );
                      }

                      if (row.key === 'mos') {
                        const mosVal = proj.mos;
                        return (
                          <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3">
                            <Badge className={cn('font-mono text-white', getMOSColor(mosVal))}>
                              {mosVal !== undefined && !isNaN(mosVal) ? `${mosVal >= 0 ? '+' : ''}${mosVal.toFixed(2)}%` : '—'}
                            </Badge>
                          </td>
                        );
                      }

                      if (row.key === 'epsGrowth') {
                        const val = (proj as any).epsGrowth;
                        return (
                          <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3 font-mono">
                            {formatPercent(val)}
                          </td>
                        );
                      }

                      if (!row.editable) {
                        const val = (proj as any)[row.key];
                        return (
                          <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3 font-mono font-semibold">
                            {formatNumber(val, row.key === 'earningsPerShare' ? 3 : 2)}
                          </td>
                        );
                      }

                      if (row.key === 'price' && isFirstYearly) {
                        return (
                          <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3">
                            <span className="font-mono">{formatNumber(proj.price)}</span>
                          </td>
                        );
                      }

                      // For revenue row: show hint of growth-calculated value
                      const currentVal = (proj as any)[row.key];

                      return (
                        <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3">
                          <Input
                            type="text"
                            inputMode="decimal"
                            className="w-24 h-8 mx-auto text-center font-mono"
                            placeholder="—"
                            defaultValue={currentVal !== undefined && currentVal !== 0 ? String(currentVal) : ''}
                            key={`${proj.year}-${proj.quarter || ''}-${row.key}-${currentVal}`}
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value.replace(',', '.'));
                              if (!isNaN(v)) updateProjection(col, row.key as keyof YearlyProjection, v);
                            }}
                          />
                        </td>
                      );
                    })}
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Rating */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Stämpel (Rating)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button variant={rating === 'buy' ? 'default' : 'outline'} className={cn('flex-1', rating === 'buy' && 'bg-success hover:bg-success/90')} onClick={() => onRatingChange?.('buy')}>
              <TrendingUp className="h-4 w-4 mr-2" />KÖP
            </Button>
            <Button variant={rating === 'sell' ? 'default' : 'outline'} className={cn('flex-1', rating === 'sell' && 'bg-destructive hover:bg-destructive/90')} onClick={() => onRatingChange?.('sell')}>
              <TrendingDown className="h-4 w-4 mr-2" />SÄLJ
            </Button>
            <Button variant={rating === 'hold' ? 'default' : 'outline'} className={cn('flex-1', rating === 'hold' && 'bg-warning hover:bg-warning/90 text-warning-foreground')} onClick={() => onRatingChange?.('hold')}>
              <Minus className="h-4 w-4 mr-2" />AVVAKTA
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Anteckningar</CardTitle>
        </CardHeader>
        <CardContent>
          <RichTextEditor value={notes || ''} onChange={(val) => onNotesChange?.(val)} placeholder="Skriv dina anteckningar här..." minHeight="100px" />
        </CardContent>
      </Card>
    </div>
  );
}
