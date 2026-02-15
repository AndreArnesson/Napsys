import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calculator, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

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
  targetPE?: number;
  estimatedPrice?: number;
  mos?: number;
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
}: SpreadsheetAnalysisProps) {
  const { t, language } = useLanguage();
  const [targetPE, setTargetPE] = useState(15);
  const [mode, setMode] = useState<'yearly' | 'quarterly'>(showQuarterly ? 'quarterly' : 'yearly');
  const [perShare, setPerShare] = useState(false);
  const [showEbitMargin, setShowEbitMargin] = useState(false);
  const [showEbitdaMargin, setShowEbitdaMargin] = useState(false);

  const currentYear = new Date().getFullYear();

  const columns: ColumnDef[] = useMemo(() => {
    if (mode === 'quarterly') {
      const cols: ColumnDef[] = [];
      for (let y = currentYear; y <= currentYear + 2; y++) {
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
    return [0, 1, 2, 3].map(offset => ({
      year: currentYear + offset,
      label: offset === 0 ? `${currentYear} (Nu)` : String(currentYear + offset),
      sublabel: `År ${offset}`,
    }));
  }, [mode, currentYear]);

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
    if (mos >= 30) return 'bg-success text-success-foreground';
    if (mos >= 15) return 'bg-success/60 text-success-foreground';
    if (mos >= 0) return 'bg-warning text-warning-foreground';
    if (mos >= -15) return 'bg-orange-500 text-white';
    return 'bg-destructive text-destructive-foreground';
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
    // We need to calculate sequentially because each depends on the previous
    const results: (YearlyProjection & ColumnDef & { calculatedRevenue?: number; calculatedEbit?: number })[] = [];
    
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const proj = findProj(col);
      const isFirst = i === 0 && mode === 'yearly';
      const price = isFirst ? currentPrice : proj.price || currentPrice;
      
      // Revenue: if user set explicit revenue, use it. If only growth% is set, calculate from previous
      let revenue = proj.revenue;
      const growth = proj.revenueGrowth;
      
      if (revenue === undefined && growth !== undefined) {
        let prevRev: number | undefined;
        if (mode === 'quarterly' && col.quarter) {
          // In quarterly mode, find same quarter from previous year (YoY)
          if (i >= 4) {
            // We have a result 4 quarters back (same quarter, previous year)
            prevRev = results[i - 4].calculatedRevenue;
          } else {
            // Look in quarterly historical data for same quarter previous year
            const sameQPrevYear = quarterlyHistoricalData.find(
              h => h.quarter === col.quarter && h.year === col.year - 1
            );
            if (sameQPrevYear) {
              prevRev = sameQPrevYear.revenue;
            }
          }
        } else if (i === 0 && historicalData.length > 0) {
          prevRev = historicalData[historicalData.length - 1].revenue;
        } else if (i > 0) {
          prevRev = results[i - 1].calculatedRevenue;
        }
        if (prevRev !== undefined && prevRev > 0) {
          revenue = prevRev * (1 + growth / 100);
        }
      }

      // EBIT: if user set explicit, use it. If net margin is set, calculate from revenue
      let ebit = proj.ebit;
      const netMargin = proj.netMargin || 0;
      
      // Calculate derived values
      const effectiveRevenue = revenue || 0;
      // Revenue is in MSEK, convert to SEK before dividing by shares
      const revenuePerShare = sharesOutstanding > 0 ? (effectiveRevenue * 1_000_000) / sharesOutstanding : 0;
      const earningsPerShare = revenuePerShare * (netMargin / 100);
      const peToUse = proj.targetPE || targetPE;
      const estimatedPrice = earningsPerShare * peToUse;
      const mos = price > 0 ? ((estimatedPrice - price) / price) * 100 : 0;

      // Calculate actual growth from previous period
      let actualGrowth = growth;
      if (actualGrowth === undefined && revenue !== undefined) {
        let prevRev: number | undefined;
        if (mode === 'quarterly' && col.quarter) {
          if (i >= 4) {
            prevRev = results[i - 4].calculatedRevenue;
          } else {
            const sameQPrevYear = quarterlyHistoricalData.find(
              h => h.quarter === col.quarter && h.year === col.year - 1
            );
            if (sameQPrevYear) prevRev = sameQPrevYear.revenue;
          }
        } else if (i === 0 && historicalData.length > 0) {
          prevRev = historicalData[historicalData.length - 1].revenue;
        } else if (i > 0) {
          prevRev = results[i - 1].calculatedRevenue;
        }
        if (prevRev && prevRev > 0) {
          actualGrowth = ((revenue - prevRev) / prevRev) * 100;
        }
      }

      results.push({
        ...proj,
        ...col,
        price,
        revenue,
        calculatedRevenue: revenue,
        calculatedEbit: ebit,
        revenueGrowth: actualGrowth ?? growth ?? 0,
        revenuePerShare,
        netMargin,
        earningsPerShare,
        targetPE: peToUse,
        estimatedPrice,
        mos,
      });
    }
    return results;
  }, [projections, currentPrice, targetPE, columns, mode, historicalData, sharesOutstanding]);

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

  // Build rows dynamically based on perShare toggle and margin options
  const rows: { label: string; key: string; editable: boolean; bg?: boolean }[] = useMemo(() => {
    const base: { label: string; key: string; editable: boolean; bg?: boolean }[] = [
      { label: `Kurs (${currency})`, key: 'price', editable: true, bg: true },
      { label: 'Omsättningstillv (%)', key: 'revenueGrowth', editable: true },
    ];
    
    if (perShare) {
      base.push({ label: `Omsättning/aktie (${currency})`, key: 'revenuePerShare', editable: true });
    } else {
      base.push({ label: `Omsättning (M${currency})`, key: 'revenue', editable: true });
      base.push({ label: `EBIT (M${currency})`, key: 'ebit', editable: true });
    }

    base.push({ label: 'Vinstmarginal (%)', key: 'netMargin', editable: true });
    
    if (showEbitMargin) {
      base.push({ label: 'EBIT-marginal (%)', key: 'ebitMargin', editable: true });
    }
    if (showEbitdaMargin) {
      base.push({ label: 'EBITDA-marginal (%)', key: 'ebitdaMargin', editable: true });
    }

    base.push(
      { label: `Vinst/aktie (${currency})`, key: 'earningsPerShare', editable: false, bg: true },
      { label: 'P/E', key: 'pe', editable: false },
      { label: 'Rimlig P/E', key: 'targetPE', editable: true, bg: true },
      { label: `Estimerad kurs (${currency})`, key: 'estimatedPrice', editable: false },
      { label: 'MOS (%)', key: 'mos', editable: false },
    );

    return base;
  }, [perShare, showEbitMargin, showEbitdaMargin]);

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
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Per aktie</Label>
                <Switch checked={perShare} onCheckedChange={setPerShare} />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">EBIT-marginal</Label>
                <Switch checked={showEbitMargin} onCheckedChange={setShowEbitMargin} />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">EBITDA-marginal</Label>
                <Switch checked={showEbitdaMargin} onCheckedChange={setShowEbitdaMargin} />
              </div>
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
                  {calculatedProjections.map((proj) => (
                    <th key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3 font-medium min-w-[110px]">
                      <div className="flex flex-col items-center">
                        <span className="text-xs">{proj.label}</span>
                        {proj.sublabel && <span className="text-[10px] text-muted-foreground font-normal">{proj.sublabel}</span>}
                      </div>
                    </th>
                  ))}
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
                        const pe = proj.earningsPerShare && proj.earningsPerShare > 0 ? proj.price! / proj.earningsPerShare : undefined;
                        return (
                          <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3 font-mono">
                            {pe !== undefined ? formatNumber(pe, 1) : '—'}
                          </td>
                        );
                      }

                      if (row.key === 'mos') {
                        return (
                          <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3">
                            <Badge className={cn('font-mono', getMOSColor(proj.mos))}>
                              {formatPercent(proj.mos)}
                            </Badge>
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
                            type="number"
                            step={row.key === 'netMargin' || row.key === 'revenueGrowth' ? '0.5' : '0.1'}
                            className="w-24 h-8 mx-auto text-center font-mono"
                            placeholder="—"
                            defaultValue={currentVal || ''}
                            key={`${proj.year}-${proj.quarter || ''}-${row.key}-${currentVal}`}
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) updateProjection(col, row.key as keyof YearlyProjection, v);
                            }}
                          />
                        </td>
                      );
                    })}
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
          <Textarea placeholder="Skriv dina anteckningar här..." className="min-h-[100px]" value={notes || ''} onChange={(e) => onNotesChange?.(e.target.value)} />
        </CardContent>
      </Card>
    </div>
  );
}
