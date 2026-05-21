import { useState, useMemo, useEffect } from 'react';
import type { Adjustment } from './AdjustmentsEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
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
  { key: 'adjustedEbit', label: 'Justerad EBIT', group: 'Justerat' },
  { key: 'adjustedEbitda', label: 'Justerad EBITDA', group: 'Justerat' },
  { key: 'adjustedNetIncome', label: 'Justerat nettoresultat', group: 'Justerat' },
  { key: 'adjustedEbitMargin', label: 'Justerad EBIT-marginal', group: 'Justerat' },
  { key: 'adjustedEvEbit', label: 'Justerad EV/EBIT', group: 'Justerat' },
  { key: 'adjustedEvEbitda', label: 'Justerad EV/EBITDA', group: 'Justerat' },
];

const DEFAULT_ESTIMATE_ROWS = [
  'price', 'revenueGrowth', 'revenue', 'ebit', 'ebitda', 'netMargin',
  'earningsPerShare', 'epsGrowth', 'dividend', 'dividendYield',
  'pe', 'ev', 'evEbit', 'evEbitda', 'targetPE', 'estimatedPrice', 'mos',
  'adjustedEbit', 'adjustedEbitda', 'adjustedNetIncome', 'adjustedEbitMargin', 'adjustedEvEbit', 'adjustedEvEbitda',
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
  adjustedEbit?: number;
  adjustedEbitda?: number;
  adjustedNetIncome?: number;
  adjustedEbitMargin?: number;
  adjustedEvEbit?: number;
  adjustedEvEbitda?: number;
}

interface SpreadsheetAnalysisProps {
  analysisDate?: string;
  currentPrice: number;
  sharesOutstanding: number;
  historicalData?: {
    year: number;
    revenue: number;
    netIncome: number;
    ebit?: number;
    ebitda?: number;
    earningsPerShare?: number;
    netMargin?: number;
    ebitMargin?: number;
    ebitdaMargin?: number;
    revenueGrowth?: number;
    dividend?: number;
  }[];
  quarterlyHistoricalData?: {
    year: number;
    quarter: number;
    revenue: number;
    netIncome: number;
    ebit?: number;
    ebitda?: number;
    earningsPerShare?: number;
    netMargin?: number;
    ebitMargin?: number;
    ebitdaMargin?: number;
    dividend?: number;
  }[];
  projections: YearlyProjection[];
  onProjectionsChange: (projections: YearlyProjection[]) => void;
  rating?: 'buy' | 'hold' | 'sell';
  onRatingChange?: (rating: 'buy' | 'hold' | 'sell') => void;
  notes?: string;
  onNotesChange?: (notes: string) => void;
  currency?: string;
  showQuarterly?: boolean;
  netDebt?: number;
  adjustments?: Adjustment[];
  /** Servettkalkyl: only show the most basic rows (revenue, net margin, EPS, P/E, MOS). */
  napkinMode?: boolean;
  analysisId?: string;
}

// Rows kept when napkinMode is on — keep it ultra-basic
const NAPKIN_ROWS = ['price', 'revenueGrowth', 'revenue', 'netMargin', 'earningsPerShare', 'pe', 'targetPE', 'estimatedPrice', 'mos'];

interface ColumnDef {
  year: number;
  quarter?: number;
  label: string;
  sublabel: string;
  isActual?: boolean;
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
  adjustments = [],
  napkinMode = false,
  analysisId,
}: SpreadsheetAnalysisProps) {
  const { t, language } = useLanguage();

  const storageKey = analysisId ? `ss-settings-${analysisId}` : null;
  const loadSetting = <T,>(key: string, fallback: T): T => {
    if (!storageKey) return fallback;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return key in parsed ? parsed[key] : fallback;
    } catch { return fallback; }
  };

  const [targetPE, setTargetPE] = useState(() => loadSetting('targetPE', 15));
  const [mode, setMode] = useState<'yearly' | 'quarterly'>(() => loadSetting('mode', showQuarterly ? 'quarterly' : 'yearly'));
  const [perShare, setPerShare] = useState(() => loadSetting('perShare', false));
  const [visibleRows, setVisibleRows] = useState<string[]>(() => loadSetting('visibleRows', napkinMode ? NAPKIN_ROWS : DEFAULT_ESTIMATE_ROWS));
  const [qGrowthMode, setQGrowthMode] = useState<'yoy' | 'sequential'>(() => loadSetting('qGrowthMode', 'yoy'));
  const [historyCount, setHistoryCount] = useState(() => loadSetting('historyCount', 0));

  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const defaultYears = [currentYear, currentYear + 1];
  
  // Derive initial estimateYears: localStorage > projections > default
  const [estimateYears, setEstimateYears] = useState<number[]>(() => {
    const fromStorage = loadSetting<number[] | null>('estimateYears', null);
    if (fromStorage && fromStorage.length > 0) return fromStorage;
    if (projections.length > 0) {
      const years = [...new Set(projections.map(p => p.year))].sort((a, b) => a - b);
      if (years.length > 0) return years;
    }
    return defaultYears;
  });

  // Persist display settings to localStorage
  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ targetPE, mode, perShare, visibleRows, qGrowthMode, historyCount, estimateYears }));
  }, [storageKey, targetPE, mode, perShare, visibleRows, qGrowthMode, historyCount, estimateYears]);

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
          const isPast = y < currentYear || (y === currentYear && q < currentQuarter);
          const isCurrent = y === currentYear && q === currentQuarter;
          cols.push({
            year: y,
            quarter: q,
            label: `${y} Q${q}`,
            sublabel: isCurrent ? 'Nu' : isPast ? 'Utfall' : '',
            isActual: isPast,
          });
        }
      }
      return cols;
    }
    return sortedYears.map(year => ({
      year,
      label: year === currentYear ? `${currentYear} (Nu)` : String(year),
      sublabel: `År ${year - currentYear}`,
      isActual: year < currentYear,
    }));
  }, [mode, currentYear, currentQuarter, estimateYears]);

  // Historical columns prepended to the left for context
  const historicalColumns = useMemo((): ColumnDef[] => {
    if (historyCount === 0) return [];
    if (mode === 'quarterly') {
      const sorted = [...quarterlyHistoricalData].sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter));
      // Exclude quarters already shown as Utfall in estimate columns
      const estimateKeys = new Set(columns.filter(c => c.isActual).map(c => `${c.year}-${c.quarter}`));
      const candidates = sorted.filter(h => !estimateKeys.has(`${h.year}-${h.quarter}`));
      return candidates.slice(0, historyCount).reverse().map(h => ({
        year: h.year,
        quarter: h.quarter,
        label: `${h.year} Q${h.quarter}`,
        sublabel: 'Utfall',
        isActual: true,
      }));
    }
    const sorted = [...historicalData].sort((a, b) => b.year - a.year);
    // Exclude years already shown as Utfall in estimate columns
    const estimateYearSet = new Set(columns.filter(c => c.isActual).map(c => c.year));
    const candidates = sorted.filter(h => !estimateYearSet.has(h.year));
    return candidates.slice(0, historyCount).reverse().map(h => ({
      year: h.year,
      label: String(h.year),
      sublabel: 'Utfall',
      isActual: true,
    }));
  }, [mode, historyCount, historicalData, quarterlyHistoricalData, columns]);

  const getHistVal = (col: ColumnDef, key: string): number | undefined => {
    if (col.quarter !== undefined) {
      const h = quarterlyHistoricalData.find(h => h.year === col.year && h.quarter === col.quarter);
      if (!h) return undefined;
      const prevQ = quarterlyHistoricalData.find(p => p.year === h.year - 1 && p.quarter === h.quarter);
      const qRevGrowth = (prevQ?.revenue && h.revenue)
        ? ((h.revenue - prevQ.revenue) / Math.abs(prevQ.revenue)) * 100
        : undefined;
      const qEpsGrowth = (prevQ?.earningsPerShare && h.earningsPerShare)
        ? ((h.earningsPerShare - prevQ.earningsPerShare) / Math.abs(prevQ.earningsPerShare)) * 100
        : undefined;
      const qEv = (currentPrice && sharesOutstanding > 0)
        ? (currentPrice * sharesOutstanding) / 1_000_000 + netDebt
        : undefined;
      // TTM EBIT/EBITDA: sum 4 quarters ending at this quarter
      const sortedForTTM = [...quarterlyHistoricalData]
        .sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter));
      const thisIdx = sortedForTTM.findIndex(q => q.year === h.year && q.quarter === h.quarter);
      const last4 = thisIdx >= 0 ? sortedForTTM.slice(thisIdx, thisIdx + 4) : [];
      const qTtmEbit = last4.length === 4 && last4.every(q => q.ebit !== undefined)
        ? last4.reduce((s, q) => s + q.ebit!, 0) : h.ebit;
      const qTtmEbitda = last4.length === 4 && last4.every(q => q.ebitda !== undefined)
        ? last4.reduce((s, q) => s + q.ebitda!, 0) : h.ebitda;
      return ({
        revenue: h.revenue,
        ebit: h.ebit,
        ebitda: h.ebitda,
        netMargin: h.netMargin,
        ebitMargin: h.ebitMargin,
        ebitdaMargin: h.ebitdaMargin,
        earningsPerShare: h.earningsPerShare,
        dividend: h.dividend,
        revenueGrowth: qRevGrowth,
        epsGrowth: qEpsGrowth,
        revenuePerShare: sharesOutstanding > 0 ? (h.revenue * 1_000_000) / sharesOutstanding : undefined,
        pe: (currentPrice && h.earningsPerShare && h.earningsPerShare > 0) ? currentPrice / h.earningsPerShare : undefined,
        ev: qEv,
        evEbit: (qEv && qTtmEbit && qTtmEbit > 0) ? qEv / qTtmEbit : undefined,
        evEbitda: (qEv && qTtmEbitda && qTtmEbitda > 0) ? qEv / qTtmEbitda : undefined,
        dividendYield: (h.dividend && currentPrice && currentPrice > 0) ? (h.dividend / currentPrice) * 100 : undefined,
      } as any)[key];
    }
    const h = historicalData.find(h => h.year === col.year);
    if (!h) return undefined;
    const prevY = historicalData.find(p => p.year === col.year - 1);
    const yEpsGrowth = (prevY?.earningsPerShare && h.earningsPerShare)
      ? ((h.earningsPerShare - prevY.earningsPerShare) / Math.abs(prevY.earningsPerShare)) * 100
      : undefined;
    const yEv = (currentPrice && sharesOutstanding > 0)
      ? (currentPrice * sharesOutstanding) / 1_000_000 + netDebt
      : undefined;
    return ({
      revenue: h.revenue,
      ebit: h.ebit,
      ebitda: h.ebitda,
      netMargin: h.netMargin,
      ebitMargin: h.ebitMargin,
      ebitdaMargin: h.ebitdaMargin,
      earningsPerShare: h.earningsPerShare,
      revenueGrowth: h.revenueGrowth,
      epsGrowth: yEpsGrowth,
      dividend: h.dividend,
      revenuePerShare: sharesOutstanding > 0 ? (h.revenue * 1_000_000) / sharesOutstanding : undefined,
      pe: (currentPrice && h.earningsPerShare && h.earningsPerShare > 0) ? currentPrice / h.earningsPerShare : undefined,
      ev: yEv,
      evEbit: (yEv && h.ebit && h.ebit > 0) ? yEv / h.ebit : undefined,
      evEbitda: (yEv && h.ebitda && h.ebitda > 0) ? yEv / h.ebitda : undefined,
      dividendYield: (h.dividend && currentPrice && currentPrice > 0) ? (h.dividend / currentPrice) * 100 : undefined,
    } as any)[key];
  };

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

  const formatMargin = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return '—';
    return `${value.toFixed(2)}%`;
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
    const results: (YearlyProjection & ColumnDef & { calculatedRevenue?: number; calculatedEbit?: number; calculatedEbitda?: number; calculatedEps?: number })[] = [];
    
    // Helper: get previous period value based on growth mode
    const getPrev = (i: number, col: ColumnDef, field: 'calculatedRevenue' | 'calculatedEps'): number | undefined => {
      if (mode === 'quarterly' && col.quarter) {
        if (qGrowthMode === 'yoy') {
          // YoY: compare same quarter previous year
          if (i >= 4) return results[i - 4]?.[field];
          const hist = quarterlyHistoricalData.find(h => h.quarter === col.quarter && h.year === col.year - 1);
          if (hist) {
            if (field === 'calculatedRevenue') return hist.revenue;
            if (field === 'calculatedEps' && hist.earningsPerShare) return hist.earningsPerShare;
          }
          // Fallback: try sequential when no YoY data
          if (i > 0) return results[i - 1]?.[field];
          return undefined;
        } else {
          // Sequential: previous quarter
          if (i > 0) return results[i - 1]?.[field];
          // For first quarter, use last available historical quarter
          if (quarterlyHistoricalData.length > 0) {
            const sorted = [...quarterlyHistoricalData].sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter));
            if (field === 'calculatedRevenue') return sorted[0]?.revenue;
            if (field === 'calculatedEps') return sorted[0]?.earningsPerShare;
          }
          return undefined;
        }
      }
      // Yearly
      if (i === 0 && historicalData.length > 0) {
        const lastHist = historicalData[historicalData.length - 1];
        if (field === 'calculatedRevenue') return lastHist.revenue;
        if (field === 'calculatedEps') {
          if (lastHist.earningsPerShare) return lastHist.earningsPerShare;
          if (lastHist.netIncome && sharesOutstanding > 0) return (lastHist.netIncome * 1_000_000) / sharesOutstanding;
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
      let proj = findProj(col);

      // For Utfall columns, seed projection with actual historical data where not manually overridden
      if (col.isActual) {
        const hist = col.quarter
          ? quarterlyHistoricalData.find(h => h.year === col.year && h.quarter === col.quarter)
          : historicalData.find(h => h.year === col.year);
        if (hist) {
          proj = {
            ...proj,
            revenue: proj.revenue ?? hist.revenue,
            ebit: proj.ebit ?? hist.ebit,
            ebitda: proj.ebitda ?? hist.ebitda,
            earningsPerShare: proj.earningsPerShare ?? hist.earningsPerShare,
            netMargin: proj.netMargin ?? hist.netMargin,
            ebitMargin: proj.ebitMargin ?? hist.ebitMargin,
            dividend: proj.dividend ?? hist.dividend,
          };
        }
      }

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
      const effectiveRevenue = revenue || 0;

      // Derive EBIT from margin × revenue if margin entered but absolute not
      if (ebit === undefined && proj.ebitMargin !== undefined && effectiveRevenue) {
        ebit = effectiveRevenue * (proj.ebitMargin / 100);
      }
      // Derive EBITDA from margin × revenue if margin entered but absolute not
      if (ebitda === undefined && proj.ebitdaMargin !== undefined && effectiveRevenue) {
        ebitda = effectiveRevenue * (proj.ebitdaMargin / 100);
      }

      // Net margin: use stored, or derive from EPS × shares / revenue if user entered EPS instead
      let netMargin = proj.netMargin;
      if (netMargin === undefined && proj.earningsPerShare !== undefined && effectiveRevenue && sharesOutstanding > 0) {
        const ni = (proj.earningsPerShare * sharesOutstanding) / 1_000_000;
        netMargin = (ni / effectiveRevenue) * 100;
      }
      const effectiveNetMargin = netMargin || 0;

      const revenuePerShare = sharesOutstanding > 0 ? (effectiveRevenue * 1_000_000) / sharesOutstanding : 0;
      // Use manually entered EPS if provided, otherwise calculate from revenue/margin/shares
      const calculatedEpsFromRevenue = revenuePerShare * (effectiveNetMargin / 100);
      const earningsPerShare = proj.earningsPerShare !== undefined ? proj.earningsPerShare : calculatedEpsFromRevenue;
      const peToUse = proj.targetPE || targetPE;

      // In quarterly mode, MOS should use TTM EPS (4 quarters annualised), not a single quarter
      let epsForValuation = earningsPerShare;
      if (mode === 'quarterly' && col.quarter) {
        const epsVals: number[] = [];
        for (let j = i; j >= 0 && epsVals.length < 4; j--) {
          if (results[j]?.calculatedEps !== undefined) epsVals.push(results[j].calculatedEps!);
        }
        if (epsVals.length < 4) {
          const sortedHist = [...quarterlyHistoricalData]
            .sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter));
          for (const qh of sortedHist) {
            if (epsVals.length >= 4) break;
            const covered = results.slice(0, i + 1).some(p => p.year === qh.year && p.quarter === qh.quarter);
            if (covered) continue;
            if (qh.earningsPerShare !== undefined) epsVals.push(qh.earningsPerShare);
          }
        }
        if (epsVals.length === 4) epsForValuation = epsVals.reduce((s, v) => s + v, 0);
      }

      const estimatedPrice = epsForValuation * peToUse;
      const mos = price > 0 ? ((estimatedPrice - price) / price) * 100 : 0;

      // EV = Market Cap + Net Debt (netDebt in MSEK, price * shares = SEK)
      const marketCap = (price * sharesOutstanding) / 1_000_000; // MSEK
      const calculatedEv = marketCap + netDebt; // MSEK
      const ev = proj.ev !== undefined ? proj.ev : calculatedEv; // User override or calculated

      // EV/EBIT and EV/EBITDA — use TTM (sum of 4 quarters) in quarterly mode
      let ttmEbit = ebit;
      let ttmEbitda = ebitda;
      if (mode === 'quarterly' && col.quarter) {
        const ebitVals: number[] = [];
        const ebitdaVals: number[] = [];
        for (let j = i; j >= 0 && (ebitVals.length < 4 || ebitdaVals.length < 4); j--) {
          if (ebitVals.length < 4 && results[j]?.calculatedEbit !== undefined) ebitVals.push(results[j].calculatedEbit!);
          if (ebitdaVals.length < 4 && results[j]?.calculatedEbitda !== undefined) ebitdaVals.push(results[j].calculatedEbitda!);
        }
        if (ebitVals.length < 4 || ebitdaVals.length < 4) {
          const sortedHist = [...quarterlyHistoricalData]
            .sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter));
          for (const qh of sortedHist) {
            if (ebitVals.length >= 4 && ebitdaVals.length >= 4) break;
            const covered = results.slice(0, i + 1).some(p => p.year === qh.year && p.quarter === qh.quarter);
            if (covered) continue;
            if (ebitVals.length < 4 && qh.ebit !== undefined) ebitVals.push(qh.ebit);
            if (ebitdaVals.length < 4 && qh.ebitda !== undefined) ebitdaVals.push(qh.ebitda);
          }
        }
        if (ebitVals.length === 4) ttmEbit = ebitVals.reduce((s, v) => s + v, 0);
        if (ebitdaVals.length === 4) ttmEbitda = ebitdaVals.reduce((s, v) => s + v, 0);
      }
      const evEbit = (ttmEbit && ttmEbit > 0 && ev > 0) ? ev / ttmEbit : undefined;
      const evEbitda = (ttmEbitda && ttmEbitda > 0 && ev > 0) ? ev / ttmEbitda : undefined;

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

      // Dividend / yield: yield wins if explicitly set, otherwise derive yield from dividend
      let dividend = proj.dividend;
      let dividendYield = proj.dividendYield;
      if (dividendYield !== undefined && dividend === undefined && price && price > 0) {
        dividend = (dividendYield / 100) * price;
      } else if (dividendYield === undefined) {
        dividendYield = (dividend && price && price > 0) ? (dividend / price) * 100 : undefined;
      }

      // Adjusted values from one-time adjustments
      const getAdjSum = (metric: string) => {
        return adjustments
          .filter(a => a.metric === metric && a.year === col.year && (col.quarter ? a.quarter === col.quarter : !a.quarter))
          .reduce((sum, a) => sum + (a.amount || 0), 0);
      };
      const ebitAdj = getAdjSum('ebit');
      const ebitdaAdj = getAdjSum('ebitda');
      const netIncomeAdj = getAdjSum('netIncome');

      const adjustedEbit = ebit !== undefined ? ebit + ebitAdj : (ebitAdj !== 0 ? ebitAdj : undefined);
      const adjustedEbitda = ebitda !== undefined ? ebitda + ebitdaAdj : (ebitdaAdj !== 0 ? ebitdaAdj : undefined);
      const netIncome = effectiveRevenue * (effectiveNetMargin / 100);
      const adjustedNetIncome = netIncome + netIncomeAdj;
      const adjustedEbitMargin = (adjustedEbit !== undefined && effectiveRevenue > 0) ? (adjustedEbit / effectiveRevenue) * 100 : undefined;
      const ttmAdjEbit = (mode === 'quarterly' && col.quarter && ttmEbit !== undefined && ebit !== undefined && adjustedEbit !== undefined)
        ? ttmEbit - ebit + adjustedEbit : adjustedEbit;
      const ttmAdjEbitda = (mode === 'quarterly' && col.quarter && ttmEbitda !== undefined && ebitda !== undefined && adjustedEbitda !== undefined)
        ? ttmEbitda - ebitda + adjustedEbitda : adjustedEbitda;
      const adjustedEvEbit = (ttmAdjEbit && ttmAdjEbit > 0 && ev > 0) ? ev / ttmAdjEbit : undefined;
      const adjustedEvEbitda = (ttmAdjEbitda && ttmAdjEbitda > 0 && ev > 0) ? ev / ttmAdjEbitda : undefined;

      const hasAnyAdj = ebitAdj !== 0 || ebitdaAdj !== 0 || netIncomeAdj !== 0;

      // Compute display margins from absolute (which themselves may have come from margin input)
      const displayEbitMargin = (ebit !== undefined && effectiveRevenue) ? (ebit / effectiveRevenue) * 100 : proj.ebitMargin;
      const displayEbitdaMargin = (ebitda !== undefined && effectiveRevenue) ? (ebitda / effectiveRevenue) * 100 : proj.ebitdaMargin;

      results.push({
        ...proj,
        ...col,
        price,
        revenue,
        ebit,
        ebitda,
        calculatedRevenue: revenue,
        calculatedEbit: ebit,
        calculatedEbitda: ebitda,
        calculatedEps: earningsPerShare,
        revenueGrowth: actualGrowth ?? growth ?? 0,
        revenuePerShare,
        netMargin,
        ebitMargin: displayEbitMargin,
        ebitdaMargin: displayEbitdaMargin,
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
        ...(hasAnyAdj || adjustments.length > 0 ? {
          adjustedEbit,
          adjustedEbitda,
          adjustedNetIncome: netIncomeAdj !== 0 ? adjustedNetIncome : undefined,
          adjustedEbitMargin,
          adjustedEvEbit,
          adjustedEvEbitda,
        } : {}),
      });
    }
    return results;
  }, [projections, currentPrice, targetPE, columns, mode, historicalData, sharesOutstanding, qGrowthMode, quarterlyHistoricalData, netDebt, adjustments]);

  const toggleVisibleRow = (key: string, checked: boolean) => {
    setVisibleRows(prev => {
      const next = checked ? [...prev, key] : prev.filter(k => k !== key);
      if (!checked) {
        const remaining = new Set(next);
        // Cascade: remove derived rows whose inputs are all gone
        if (!remaining.has('ebit') && !remaining.has('ebitMargin')) {
          remaining.delete('evEbit');
          remaining.delete('adjustedEvEbit');
        }
        if (!remaining.has('ebitda') && !remaining.has('ebitdaMargin')) {
          remaining.delete('evEbitda');
          remaining.delete('adjustedEvEbitda');
        }
        if (!remaining.has('adjustedEbit')) remaining.delete('adjustedEvEbit');
        if (!remaining.has('adjustedEbitda')) remaining.delete('adjustedEvEbitda');
        if (!remaining.has('dividend')) remaining.delete('dividendYield');
        if (!remaining.has('earningsPerShare')) remaining.delete('epsGrowth');
        return [...remaining];
      }
      return next;
    });
  };

  const clearProjectionField = (col: ColumnDef, field: keyof YearlyProjection) => {
    const existingIndex = projections.findIndex(p => p.year === col.year && (p.quarter || undefined) === col.quarter);
    if (existingIndex < 0) return;
    const newProjections = [...projections];
    const updated = { ...newProjections[existingIndex] };
    delete (updated as any)[field];
    if (field === 'dividend') delete (updated as any).dividendYield;
    if (field === 'dividendYield') delete (updated as any).dividend;
    newProjections[existingIndex] = updated;
    onProjectionsChange(newProjections);
  };

  const updateProjection = (col: ColumnDef, field: keyof YearlyProjection, value: number) => {
    const existingIndex = projections.findIndex(p => p.year === col.year && (p.quarter || undefined) === col.quarter);
    const newProjections = [...projections];
    // Mutual exclusivity: latest input wins for paired fields (absolute ↔ percentage)
    const patch: Partial<YearlyProjection> = { [field]: value } as Partial<YearlyProjection>;
    if (field === 'dividendYield') (patch as any).dividend = undefined;
    if (field === 'dividend') (patch as any).dividendYield = undefined;
    if (field === 'ebitMargin') (patch as any).ebit = undefined;
    if (field === 'ebit') (patch as any).ebitMargin = undefined;
    if (field === 'ebitdaMargin') (patch as any).ebitda = undefined;
    if (field === 'ebitda') (patch as any).ebitdaMargin = undefined;
    // Net income: entering margin clears EPS override; entering EPS clears netMargin
    if (field === 'netMargin') (patch as any).earningsPerShare = undefined;
    if (field === 'earningsPerShare') (patch as any).netMargin = undefined;
    if (existingIndex >= 0) {
      newProjections[existingIndex] = { ...newProjections[existingIndex], ...patch };
    } else {
      newProjections.push({ year: col.year, quarter: col.quarter, ...patch });
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
      { label: `Vinst/aktie (${currency})`, key: 'earningsPerShare', editable: true, bg: true },
      { label: 'VPA-tillväxt (%)', key: 'epsGrowth', editable: false },
      { label: `Utdelning (${currency})`, key: 'dividend', editable: true },
      { label: 'Direktavkastning (%)', key: 'dividendYield', editable: true },
      { label: 'P/E', key: 'pe', editable: false },
      { label: `EV (M${currency})`, key: 'ev', editable: true, bg: true },
      { label: 'EV/EBIT', key: 'evEbit', editable: false },
      { label: 'EV/EBITDA', key: 'evEbitda', editable: false },
      { label: 'Rimlig P/E', key: 'targetPE', editable: true, bg: true },
      { label: `Estimerad kurs (${currency})`, key: 'estimatedPrice', editable: false },
      { label: 'MOS (%)', key: 'mos', editable: false },
      // Adjusted rows
      { label: `Justerad EBIT (M${currency})`, key: 'adjustedEbit', editable: false, bg: true },
      { label: `Justerad EBITDA (M${currency})`, key: 'adjustedEbitda', editable: false, bg: true },
      { label: `Just. nettoresultat (M${currency})`, key: 'adjustedNetIncome', editable: false, bg: true },
      { label: 'Justerad EBIT-marg (%)', key: 'adjustedEbitMargin', editable: false },
      { label: 'Just. EV/EBIT', key: 'adjustedEvEbit', editable: false },
      { label: 'Just. EV/EBITDA', key: 'adjustedEvEbitda', editable: false },
    ];

    const visible = new Set(visibleRows);
    return allRows.filter(row => {
      if (!visible.has(row.key)) return false;
      // Hide adjusted rows if no adjustments exist
      if (row.key.startsWith('adjusted') && adjustments.length === 0) return false;
      // perShare logic: show revenuePerShare OR (revenue + ebit), not both
      if (perShare && (row.key === 'revenue' || row.key === 'ebit')) return false;
      if (!perShare && row.key === 'revenuePerShare') return false;
      // Hide derived rows when their required inputs are not visible
      if (row.key === 'evEbit' && !visible.has('ebit') && !visible.has('ebitMargin')) return false;
      if (row.key === 'evEbitda' && !visible.has('ebitda') && !visible.has('ebitdaMargin')) return false;
      if (row.key === 'adjustedEvEbit' && !visible.has('adjustedEbit')) return false;
      if (row.key === 'adjustedEvEbitda' && !visible.has('adjustedEbitda')) return false;
      if (row.key === 'dividendYield' && !visible.has('dividend')) return false;
      if (row.key === 'epsGrowth' && !visible.has('earningsPerShare')) return false;
      return true;
    });
  }, [perShare, visibleRows, currency, adjustments.length]);

  // Check which years have all 4 quarters filled (projections or historical data)
  const yearsWithFullQuarters = useMemo(() => {
    return estimateYears.filter(year => {
      for (let q = 1; q <= 4; q++) {
        const proj = projections.find(p => p.year === year && p.quarter === q);
        const hist = quarterlyHistoricalData.find(h => h.year === year && h.quarter === q);
        const hasAnyValue =
          (proj && [proj.revenue, proj.revenueGrowth, proj.netMargin, proj.ebit, proj.ebitda, proj.earningsPerShare, proj.ebitMargin].some(v => v !== undefined)) ||
          (hist && [hist.revenue, hist.netMargin, hist.ebit, hist.ebitda, hist.earningsPerShare].some(v => v !== undefined));
        if (!hasAnyValue) return false;
      }
      return true;
    });
  }, [projections, estimateYears, quarterlyHistoricalData]);

  const convertQuartersToYearly = () => {
    const newProjections = [...projections];

    for (const year of yearsWithFullQuarters) {
      const quarters = [1, 2, 3, 4].map(q => {
        const calc = calculatedProjections.find(p => p.year === year && p.quarter === q);
        const raw = projections.find(p => p.year === year && p.quarter === q);
        const hist = quarterlyHistoricalData.find(h => h.year === year && h.quarter === q);
        return { calc, raw, hist };
      });

      const getVal = (q: typeof quarters[0], field: string): number | undefined => {
        const calcVal = (q.calc as any)?.[field];
        if (calcVal !== undefined) return calcVal;
        return (q.hist as any)?.[field];
      };

      const sumField = (field: string) => {
        const vals = quarters.map(q => getVal(q, field)).filter((v: any) => v !== undefined && !isNaN(v));
        return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) : undefined;
      };

      const avgField = (field: string) => {
        const vals = quarters.map(q => getVal(q, field)).filter((v: any) => v !== undefined && v !== 0 && !isNaN(v));
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
        ev: getVal(quarters[3], 'ev'),
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
                {napkinMode ? '🧻 Servettkalkyl' : 'Estimat'}
              </CardTitle>
              <CardDescription>
                {napkinMode
                  ? 'Snabb värdering: Omsättning × Vinstmarginal × P/E'
                  : (analysisDate ? `Analysis date: ${analysisDate}` : 'Skriv in dina estimat')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {!napkinMode && (
                <Tabs value={mode} onValueChange={(v) => setMode(v as 'yearly' | 'quarterly')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="yearly" className="text-xs px-3 h-7">Helår</TabsTrigger>
                    <TabsTrigger value="quarterly" className="text-xs px-3 h-7">Kvartal</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              {!napkinMode && mode === 'quarterly' && (
                <Tabs value={qGrowthMode} onValueChange={(v) => setQGrowthMode(v as 'yoy' | 'sequential')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="yoy" className="text-xs px-3 h-7">YoY</TabsTrigger>
                    <TabsTrigger value="sequential" className="text-xs px-3 h-7">Sekventiell</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              {!napkinMode && mode === 'quarterly' && yearsWithFullQuarters.length > 0 && (
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
              {!napkinMode && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Per aktie</Label>
                  <Switch checked={perShare} onCheckedChange={setPerShare} />
                </div>
              )}
              {!napkinMode && (
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
                                onCheckedChange={(checked) => toggleVisibleRow(row.key, !!checked)}
                              />
                              <span className="text-xs">{row.label}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {!napkinMode && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Historik:</span>
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setHistoryCount(c => Math.max(0, c - 1))}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-xs w-4 text-center">{historyCount}</span>
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setHistoryCount(c => c + 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Target P/E:</span>
                <NumericInput
                  value={targetPE}
                  onChange={(v) => setTargetPE(v ?? 15)}
                  className="w-20 h-8"
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
                  {historicalColumns.map(col => (
                    <th key={`hist-${col.year}-${col.quarter || ''}`} className="text-center py-2 px-3 font-medium min-w-[110px] opacity-60">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs">{col.label}</span>
                        <span className="text-[10px] text-blue-500 font-normal">{col.sublabel}</span>
                      </div>
                    </th>
                  ))}
                  {historicalColumns.length > 0 && (
                    <th className="w-px px-0 py-2">
                      <div className="w-px h-full bg-border mx-auto" />
                    </th>
                  )}
                  {calculatedProjections.map((proj, i) => {
                    // Only allow removing the last (rightmost) year, shown on Q1 in quarterly mode
                    const maxYear = Math.max(...estimateYears);
                    const showRemove = estimateYears.length > 1 && proj.year === maxYear
                      && (mode === 'yearly' || proj.quarter === 1);
                    const col = columns[i];
                    return (
                      <th key={`${proj.year}-${proj.quarter || ''}`} className={cn("text-center py-2 px-3 font-medium min-w-[110px]", col.isActual && "opacity-60")}>
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
                          {proj.sublabel && (
                            <span className={cn("text-[10px] font-normal", col.isActual ? "text-blue-500" : "text-muted-foreground")}>
                              {proj.sublabel}
                            </span>
                          )}
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
                    {historicalColumns.map(col => {
                      const val = getHistVal(col, row.key);
                      const isGrowthRate = ['revenueGrowth', 'epsGrowth'].includes(row.key);
                      const isMarginPct = ['netMargin', 'ebitMargin', 'ebitdaMargin', 'adjustedEbitMargin'].includes(row.key);
                      const decimals = row.key === 'earningsPerShare' ? 3 : 2;
                      return (
                        <td key={`hist-${col.year}-${col.quarter || ''}`} className="text-center py-2 px-3 opacity-70">
                          <span className="font-mono text-sm">
                            {val !== undefined && val !== 0
                              ? (isGrowthRate ? formatPercent(val) : isMarginPct ? formatMargin(val) : formatNumber(val, decimals))
                              : '—'}
                          </span>
                        </td>
                      );
                    })}
                    {historicalColumns.length > 0 && <td className="w-px px-0"><div className="w-px h-full bg-border mx-auto" /></td>}
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

                      if (col.isActual) {
                        const histVal = getHistVal(col, row.key);
                        const displayVal = histVal !== undefined ? histVal : (currentVal !== 0 ? currentVal : undefined);
                        const isGrowthRate = ['revenueGrowth', 'epsGrowth'].includes(row.key);
                        const isMarginPct = ['netMargin', 'ebitMargin', 'ebitdaMargin', 'adjustedEbitMargin'].includes(row.key);
                        const decimals = row.key === 'earningsPerShare' ? 3 : 2;
                        return (
                          <td key={`${proj.year}-${proj.quarter || ''}`} className="text-center py-2 px-3 opacity-70">
                            <span className="font-mono text-sm">
                              {displayVal !== undefined
                                ? (isGrowthRate ? formatPercent(displayVal) : isMarginPct ? formatMargin(displayVal) : formatNumber(displayVal, decimals))
                                : '—'}
                            </span>
                          </td>
                        );
                      }

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
                              const raw = e.target.value.trim();
                              if (raw === '') {
                                clearProjectionField(col, row.key as keyof YearlyProjection);
                              } else {
                                const v = parseFloat(raw.replace(',', '.'));
                                if (!isNaN(v)) updateProjection(col, row.key as keyof YearlyProjection, v);
                              }
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
