import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

export interface YearlyProjection {
  year: number;
  price?: number;
  revenueGrowth?: number;
  revenuePerShare?: number;
  netMargin?: number;
  earningsPerShare?: number;
  targetPE?: number;
  estimatedPrice?: number;
  mos?: number;
}

interface SpreadsheetAnalysisProps {
  analysisDate?: string;
  currentPrice: number;
  sharesOutstanding: number;
  historicalData?: {
    year: number;
    revenue: number;
    netIncome: number;
  }[];
  projections: YearlyProjection[];
  onProjectionsChange: (projections: YearlyProjection[]) => void;
  rating?: 'buy' | 'hold' | 'sell';
  onRatingChange?: (rating: 'buy' | 'hold' | 'sell') => void;
  notes?: string;
  onNotesChange?: (notes: string) => void;
  currency?: string;
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
}: SpreadsheetAnalysisProps) {
  const { t, language } = useLanguage();
  const [targetPE, setTargetPE] = useState(15);
  
  const currentYear = new Date().getFullYear();
  const years = [0, 1, 2, 3]; // Year 0 is current, 1-3 are projections

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
      <span className={cn(
        isPositive && 'text-success',
        isNegative && 'text-destructive'
      )}>
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

  // Calculate derived values
  const calculatedProjections = useMemo(() => {
    return years.map((yearOffset) => {
      const proj = projections.find(p => p.year === currentYear + yearOffset) || { year: currentYear + yearOffset };
      
      const price = yearOffset === 0 ? currentPrice : proj.price || currentPrice;
      const revenueGrowth = proj.revenueGrowth || 0;
      const revenuePerShare = proj.revenuePerShare || 0;
      const netMargin = proj.netMargin || 8;
      
      // Calculate EPS
      const earningsPerShare = revenuePerShare * (netMargin / 100);
      
      // Calculate estimated price using target PE
      const peToUse = proj.targetPE || targetPE;
      const estimatedPrice = earningsPerShare * peToUse;
      
      // Calculate MOS
      const mos = price > 0 ? ((estimatedPrice - price) / price) * 100 : 0;
      
      return {
        ...proj,
        year: currentYear + yearOffset,
        price,
        revenueGrowth,
        revenuePerShare,
        netMargin,
        earningsPerShare,
        targetPE: peToUse,
        estimatedPrice,
        mos,
      };
    });
  }, [projections, currentPrice, targetPE, currentYear, years]);

  const updateProjection = (yearOffset: number, field: keyof YearlyProjection, value: number) => {
    const year = currentYear + yearOffset;
    const existingIndex = projections.findIndex(p => p.year === year);
    const newProjections = [...projections];
    
    if (existingIndex >= 0) {
      newProjections[existingIndex] = { ...newProjections[existingIndex], [field]: value };
    } else {
      newProjections.push({ year, [field]: value });
    }
    
    onProjectionsChange(newProjections);
  };

  return (
    <div className="space-y-6">
      {/* Analysis Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Analysis
              </CardTitle>
              <CardDescription>
                {analysisDate ? `Analysis date: ${analysisDate}` : 'Set your estimates'}
              </CardDescription>
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
        </CardHeader>
      </Card>

      {/* Spreadsheet-like Grid */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground w-48">Metric</th>
                  {calculatedProjections.map((proj) => (
                    <th key={proj.year} className="text-center py-2 px-3 font-medium min-w-[120px]">
                      <div className="flex flex-col items-center">
                        <span>{proj.year === currentYear ? `${proj.year} (Now)` : proj.year}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          År {proj.year - currentYear}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Price Row */}
                <tr className="border-b bg-muted/30">
                  <td className="py-2 px-3 font-medium">Kurs</td>
                  {calculatedProjections.map((proj, i) => (
                    <td key={proj.year} className="text-center py-2 px-3">
                      {i === 0 ? (
                        <span className="font-mono">{formatNumber(proj.price)}</span>
                      ) : (
                        <Input
                          type="number"
                          step="0.1"
                          className="w-24 h-8 mx-auto text-center font-mono"
                          placeholder={formatNumber(currentPrice)}
                          value={proj.price === currentPrice ? '' : proj.price || ''}
                          onChange={(e) => updateProjection(i, 'price', parseFloat(e.target.value) || currentPrice)}
                        />
                      )}
                    </td>
                  ))}
                </tr>

                {/* Revenue Growth */}
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">Omsättningstillv (%)</td>
                  {calculatedProjections.map((proj, i) => (
                    <td key={proj.year} className="text-center py-2 px-3">
                      <Input
                        type="number"
                        step="1"
                        className="w-24 h-8 mx-auto text-center font-mono"
                        placeholder="10"
                        value={proj.revenueGrowth || ''}
                        onChange={(e) => updateProjection(i, 'revenueGrowth', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                  ))}
                </tr>

                {/* Revenue per Share */}
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">Omsättning/aktie</td>
                  {calculatedProjections.map((proj, i) => (
                    <td key={proj.year} className="text-center py-2 px-3">
                      <Input
                        type="number"
                        step="0.1"
                        className="w-24 h-8 mx-auto text-center font-mono"
                        placeholder="0"
                        value={proj.revenuePerShare || ''}
                        onChange={(e) => updateProjection(i, 'revenuePerShare', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                  ))}
                </tr>

                {/* Net Margin */}
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">Vinstmarginal (%)</td>
                  {calculatedProjections.map((proj, i) => (
                    <td key={proj.year} className="text-center py-2 px-3">
                      <Input
                        type="number"
                        step="0.5"
                        className="w-24 h-8 mx-auto text-center font-mono"
                        placeholder="8"
                        value={proj.netMargin || ''}
                        onChange={(e) => updateProjection(i, 'netMargin', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                  ))}
                </tr>

                {/* Calculated EPS */}
                <tr className="border-b bg-muted/30">
                  <td className="py-2 px-3 font-medium">Vinst/aktie</td>
                  {calculatedProjections.map((proj) => (
                    <td key={proj.year} className="text-center py-2 px-3 font-mono">
                      {formatNumber(proj.earningsPerShare, 3)}
                    </td>
                  ))}
                </tr>

                {/* P/E */}
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">P/E</td>
                  {calculatedProjections.map((proj) => (
                    <td key={proj.year} className="text-center py-2 px-3 font-mono">
                      {proj.earningsPerShare > 0 
                        ? formatNumber(proj.price! / proj.earningsPerShare, 1) 
                        : '—'}
                    </td>
                  ))}
                </tr>

                {/* Target P/E */}
                <tr className="border-b bg-muted/30">
                  <td className="py-2 px-3 font-medium">Rimlig P/E</td>
                  {calculatedProjections.map((proj, i) => (
                    <td key={proj.year} className="text-center py-2 px-3">
                      <Input
                        type="number"
                        step="1"
                        className="w-24 h-8 mx-auto text-center font-mono"
                        placeholder={String(targetPE)}
                        value={proj.targetPE !== targetPE ? proj.targetPE : ''}
                        onChange={(e) => updateProjection(i, 'targetPE', parseFloat(e.target.value) || targetPE)}
                      />
                    </td>
                  ))}
                </tr>

                {/* Estimated Price */}
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">Estimerad kurs</td>
                  {calculatedProjections.map((proj) => (
                    <td key={proj.year} className="text-center py-2 px-3 font-mono font-semibold">
                      {formatNumber(proj.estimatedPrice)}
                    </td>
                  ))}
                </tr>

                {/* MOS */}
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">MOS</td>
                  {calculatedProjections.map((proj) => (
                    <td key={proj.year} className="text-center py-2 px-3">
                      <Badge className={cn('font-mono', getMOSColor(proj.mos))}>
                        {formatPercent(proj.mos)}
                      </Badge>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Rating Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Stämpel (Rating)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              variant={rating === 'buy' ? 'default' : 'outline'}
              className={cn(
                'flex-1',
                rating === 'buy' && 'bg-success hover:bg-success/90'
              )}
              onClick={() => onRatingChange?.('buy')}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              KÖP
            </Button>
            <Button
              variant={rating === 'sell' ? 'default' : 'outline'}
              className={cn(
                'flex-1',
                rating === 'sell' && 'bg-destructive hover:bg-destructive/90'
              )}
              onClick={() => onRatingChange?.('sell')}
            >
              <TrendingDown className="h-4 w-4 mr-2" />
              SÄLJ
            </Button>
            <Button
              variant={rating === 'hold' ? 'default' : 'outline'}
              className={cn(
                'flex-1',
                rating === 'hold' && 'bg-warning hover:bg-warning/90 text-warning-foreground'
              )}
              onClick={() => onRatingChange?.('hold')}
            >
              <Minus className="h-4 w-4 mr-2" />
              AVVAKTA
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
          <Textarea
            placeholder="Skriv dina anteckningar här..."
            className="min-h-[100px]"
            value={notes || ''}
            onChange={(e) => onNotesChange?.(e.target.value)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
