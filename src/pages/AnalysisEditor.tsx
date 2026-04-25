import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { MOSBadge } from '@/components/company/MOSBadge';
import { RatingBadge } from '@/components/company/RatingBadge';
import { HistoricalDataTable, HistoricalYear } from '@/components/analysis/HistoricalDataTable';
import { SpreadsheetAnalysis, YearlyProjection } from '@/components/analysis/SpreadsheetAnalysis';
import { DebtSection } from '@/components/analysis/DebtSection';
import { AdjustmentsEditor, Adjustment } from '@/components/analysis/AdjustmentsEditor';
import { ImageUpload } from '@/components/company/ImageUpload';
import { ReportAnalyzer } from '@/components/analysis/ReportAnalyzer';
import { InvestmentHoldings, InvestmentHolding } from '@/components/analysis/InvestmentHoldings';
import { NapkinCalculation, NapkinAssumption } from '@/components/analysis/NapkinCalculation';
import { FileImportDialog, ParsedFinancialData, ParsedCompanyInfo } from '@/components/company/FileImportDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Loader2, Save, CheckCircle, Settings2, Trash2, LayoutDashboard, BarChart3, FileText, Lock, Unlock, Calculator } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import debounce from 'lodash/debounce';

export default function AnalysisEditor() {
  const { id, analysisId } = useParams<{ id: string; analysisId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [rating, setRating] = useState<'buy' | 'hold' | 'sell' | undefined>();
  const [notes, setNotes] = useState('');
  const [projections, setProjections] = useState<YearlyProjection[]>([]);
  const [currentPrice, setCurrentPrice] = useState<string>('');
  const [sharesOutstanding, setSharesOutstanding] = useState<string>('');
  const [analysisName, setAnalysisName] = useState('');
  const [analysisImages, setAnalysisImages] = useState<string[]>([]);
  const [showQuarterly, setShowQuarterly] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [employees, setEmployees] = useState<string>('');
  const [analysisSections, setAnalysisSections] = useState<Record<string, boolean>>({ debt: true, images: true, employees: false });
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [investmentHoldings, setInvestmentHoldings] = useState<InvestmentHolding[]>([]);
  const [navDiscount, setNavDiscount] = useState<string>('');
  const [napkinMode, setNapkinMode] = useState<boolean>(false);
  const [napkinAssumptions, setNapkinAssumptions] = useState<NapkinAssumption[]>([]);

  // Undo/Redo stacks for projections
  const undoStackRef = useRef<YearlyProjection[][]>([]);
  const redoStackRef = useRef<YearlyProjection[][]>([]);
  const handleProjectionsChange = useCallback((newProjections: YearlyProjection[]) => {
    undoStackRef.current.push([...projections]);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = []; // Clear redo on new change
    setProjections(newProjections);
  }, [projections]);

  // Ctrl+Z / Ctrl+Shift+Z handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'z') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();

      if (e.shiftKey) {
        // Redo
        const next = redoStackRef.current.pop();
        if (next) {
          undoStackRef.current.push([...projections]);
          setProjections(next);
        }
      } else {
        // Undo
        const prev = undoStackRef.current.pop();
        if (prev) {
          redoStackRef.current.push([...projections]);
          setProjections(prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projections]);

  const { data: company } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch analysis-scoped income data first, fall back to company-level
  const { data: incomeData } = useQuery({
    queryKey: ['income_statement', id, analysisId],
    queryFn: async () => {
      // Try analysis-specific data first
      const { data: analysisData } = await supabase.from('income_statement').select('*').eq('company_id', id!).eq('analysis_id', analysisId!).order('fiscal_year', { ascending: true });
      if (analysisData && analysisData.length > 0) return analysisData;
      // Fall back to company-level (analysis_id is null)
      const { data, error } = await supabase.from('income_statement').select('*').eq('company_id', id!).is('analysis_id', null).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id && !!analysisId,
  });

  const { data: balanceData } = useQuery({
    queryKey: ['balance_sheet', id, analysisId],
    queryFn: async () => {
      const { data: analysisData } = await supabase.from('balance_sheet').select('*').eq('company_id', id!).eq('analysis_id', analysisId!).order('fiscal_year', { ascending: true });
      if (analysisData && analysisData.length > 0) return analysisData;
      const { data, error } = await supabase.from('balance_sheet').select('*').eq('company_id', id!).is('analysis_id', null).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id && !!analysisId,
  });

  // Fetch quarterly data
  const { data: quarterlyIncomeData } = useQuery({
    queryKey: ['quarterly_income', id, analysisId],
    queryFn: async () => {
      const { data, error } = await supabase.from('quarterly_income_statement' as any).select('*').eq('company_id', id!).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!id,
  });

  // Transform DB data to HistoricalYear format
  const historicalData: HistoricalYear[] = useMemo(() => {
    if (!incomeData || incomeData.length === 0) return [];
    return incomeData.map((row: any, index: number) => {
      const prevRow = incomeData[index - 1] as any;
      const revenueGrowth = prevRow?.revenue && row.revenue
        ? ((row.revenue - prevRow.revenue) / prevRow.revenue) * 100 : undefined;
      const bs = balanceData?.find((b: any) => b.fiscal_year === row.fiscal_year) as any;
      return {
        fiscal_year: row.fiscal_year,
        revenue: row.revenue ?? undefined,
        revenue_growth: revenueGrowth,
        ebit: row.ebit ?? undefined,
        ebitda: row.ebitda ?? undefined,
        net_income: row.net_income ?? undefined,
        earnings_per_share: row.earnings_per_share ?? undefined,
        dividend: row.dividend ?? undefined,
        gross_margin: row.gross_margin ? row.gross_margin * 100 : undefined,
        operating_margin: row.operating_margin ? row.operating_margin * 100 : undefined,
        net_margin: row.net_margin ? row.net_margin * 100 : undefined,
        total_debt: bs ? ((bs.long_term_debt ?? 0) + (bs.short_term_debt ?? 0)) || undefined : undefined,
        cash: bs?.cash_equivalents ?? undefined,
        shareholders_equity: bs?.shareholders_equity ?? undefined,
      };
    });
  }, [incomeData, balanceData]);

  const quarterlyHistoricalData: HistoricalYear[] = useMemo(() => {
    if (!quarterlyIncomeData || quarterlyIncomeData.length === 0) return [];
    return quarterlyIncomeData.map((row: any) => ({
      fiscal_year: row.fiscal_year,
      quarter: row.quarter,
      revenue: row.revenue ?? undefined,
      ebit: row.ebit ?? undefined,
      ebitda: row.ebitda ?? undefined,
      net_income: row.net_income ?? undefined,
      earnings_per_share: row.earnings_per_share ?? undefined,
      dividend: row.dividend ?? undefined,
      gross_margin: row.gross_margin ? row.gross_margin * 100 : undefined,
      operating_margin: row.operating_margin ? row.operating_margin * 100 : undefined,
      net_margin: row.net_margin ? row.net_margin * 100 : undefined,
    }));
  }, [quarterlyIncomeData]);

  // Fetch the analysis record
  const { data: currentAnalysis, isLoading } = useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: async () => {
      const { data, error } = await supabase.from('analyses').select('*').eq('id', analysisId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!analysisId,
  });

  useEffect(() => {
    if (currentAnalysis) {
      setRating(currentAnalysis.rating as 'buy' | 'hold' | 'sell' | undefined);
      setNotes(currentAnalysis.summary_comment || '');
      setCurrentPrice((currentAnalysis as any).current_price?.toString() || company?.current_price?.toString() || '');
      setSharesOutstanding((currentAnalysis as any).shares_outstanding?.toString() || company?.shares_outstanding?.toString() || '');
      setAnalysisName((currentAnalysis as any).name || '');
      setAnalysisImages(((currentAnalysis as any).images as string[]) || []);
      setEmployees((currentAnalysis as any).employees?.toString() || '');
      const defaultSections = { debt: true, images: true, employees: false };
      const loadedSections = (currentAnalysis as any).visible_sections || {};
      setAnalysisSections({ ...defaultSections, ...loadedSections });
      setNapkinMode(loadedSections.napkin_mode === true);
      if (Array.isArray(loadedSections.napkin_assumptions)) {
        setNapkinAssumptions(loadedSections.napkin_assumptions);
      }
      // Load adjustments
      const savedAdjustments = (currentAnalysis as any).adjustments;
      if (Array.isArray(savedAdjustments)) {
        // Check if these are investment holdings (have 'name' key) or regular adjustments
        const isInvestmentType = (company as any)?.company_type === 'investment_company';
        if (isInvestmentType) {
          // Investment holdings stored in adjustments
          setInvestmentHoldings(savedAdjustments.filter((a: any) => a._type === 'investment_holding').map((a: any) => ({ ...a, _type: undefined })));
          // Extract nav discount
          const discountEntry = savedAdjustments.find((a: any) => a._type === 'nav_discount');
          if (discountEntry) setNavDiscount(String(discountEntry.value ?? ''));
          setAdjustments(savedAdjustments.filter((a: any) => a._type !== 'investment_holding' && a._type !== 'nav_discount'));
        } else {
          setAdjustments(savedAdjustments);
        }
      }
      // Load persisted projections
      const savedProjections = (currentAnalysis as any).projections;
      if (Array.isArray(savedProjections) && savedProjections.length > 0) {
        // Check if it's investment holdings data
        if (savedProjections[0]?.name !== undefined && savedProjections[0]?.id !== undefined) {
          setInvestmentHoldings(savedProjections as any);
        } else {
          setProjections(savedProjections);
        }
      }
      setIsLocked((currentAnalysis as any).locked === true);
    }
  }, [currentAnalysis, company]);

  const currentMOS = useMemo(() => {
    const year3Proj = projections.find(p => p.year === new Date().getFullYear() + 3);
    return year3Proj?.mos;
  }, [projections]);

  const isInvestmentCompany = (company as any)?.company_type === 'investment_company';

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!analysisId || isLocked) return;
      const { error } = await supabase
        .from('analyses')
        .update({
          rating: rating || null,
          summary_comment: notes,
          margin_of_safety: currentMOS ?? null,
          is_draft: !rating,
          projections: isInvestmentCompany ? investmentHoldings : projections,
          current_price: currentPrice ? parseFloat(currentPrice) : null,
          shares_outstanding: sharesOutstanding ? parseInt(sharesOutstanding) : null,
          name: analysisName || null,
          images: analysisImages,
          employees: employees ? parseInt(employees) : null,
          visible_sections: analysisSections,
          adjustments: isInvestmentCompany
            ? [...adjustments, ...(navDiscount ? [{ _type: 'nav_discount', value: parseFloat(navDiscount) }] : [])]
            : adjustments,
        } as any)
        .eq('id', analysisId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-analyses', id] });
      queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
      setLastSaved(new Date());
      setIsSaving(false);
    },
    onError: () => {
      toast.error(t.common.error);
      setIsSaving(false);
    },
  });

  const debouncedSave = useCallback(
    debounce(() => {
      if (!user || !analysisId || isLocked) return;
      setIsSaving(true);
      saveMutation.mutate();
    }, 3000),
    [user, id, analysisId, rating, notes, currentPrice, sharesOutstanding, projections, analysisName, analysisImages, employees, analysisSections, adjustments, isLocked, investmentHoldings, navDiscount]
  );

  const toggleLock = async () => {
    if (!analysisId) return;
    const newLocked = !isLocked;
    const { error } = await supabase.from('analyses').update({ locked: newLocked } as any).eq('id', analysisId);
    if (error) { toast.error('Kunde inte uppdatera'); return; }
    setIsLocked(newLocked);
    queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
    toast.success(newLocked ? 'Analysen är nu låst' : 'Analysen är nu upplåst');
  };

  useEffect(() => {
    if (user && analysisId && (notes || rating || analysisName)) {
      debouncedSave();
    }
    return () => debouncedSave.cancel();
  }, [rating, notes, currentPrice, sharesOutstanding, projections, analysisName, analysisImages, employees, analysisSections, adjustments, investmentHoldings, navDiscount, debouncedSave]);

  // Handle per-analysis financial import
  const handleAnalysisImport = async (data: ParsedFinancialData[], companyInfo?: ParsedCompanyInfo) => {
    if (!id || !user || !analysisId) return;

    const yearly = data.filter(d => !d.quarter);
    const quarterly = data.filter(d => !!d.quarter);

    if (yearly.length > 0) {
      const incomeRows = yearly.map(d => ({
        company_id: id,
        analysis_id: analysisId,
        fiscal_year: d.fiscal_year,
        revenue: d.revenue ?? null,
        ebit: d.ebit ?? d.operating_income ?? null,
        ebitda: d.ebitda ?? null,
        net_income: d.net_income ?? null,
        gross_margin: d.gross_margin ?? null,
        operating_margin: d.operating_margin ?? null,
        net_margin: d.net_margin ?? null,
        dividend: d.dividend ?? null,
        earnings_per_share: d.earnings_per_share ?? null,
        shares_outstanding: d.shares_outstanding ? Math.round(d.shares_outstanding) : null,
      }));

      // Delete existing analysis-scoped data
      await supabase.from('income_statement').delete().eq('company_id', id).eq('analysis_id', analysisId);
      const { error } = await supabase.from('income_statement').insert(incomeRows as any);
      if (error) { console.error('[Import] Insert error:', error); toast.error('Failed to save income data'); return; }

      const balanceRows = yearly
        .filter(d => d.total_assets || d.total_equity || d.total_liabilities || d.cash_equivalents)
        .map(d => ({
          company_id: id,
          analysis_id: analysisId,
          fiscal_year: d.fiscal_year,
          total_assets: d.total_assets ?? null,
          total_liabilities: d.total_liabilities ?? null,
          shareholders_equity: d.total_equity ?? null,
          current_assets: d.current_assets ?? null,
          current_liabilities: d.current_liabilities ?? null,
          long_term_debt: d.non_current_liabilities ?? null,
          cash_equivalents: d.cash_equivalents ?? null,
          equity_ratio: d.equity_ratio ?? null,
        }));

      if (balanceRows.length > 0) {
        await supabase.from('balance_sheet').delete().eq('company_id', id).eq('analysis_id', analysisId);
        await supabase.from('balance_sheet').insert(balanceRows as any);
      }
    }

    if (quarterly.length > 0) {
      const qRows = quarterly.map(d => ({
        company_id: id,
        analysis_id: analysisId,
        fiscal_year: d.fiscal_year,
        quarter: d.quarter,
        revenue: d.revenue ?? null,
        ebit: d.ebit ?? d.operating_income ?? null,
        ebitda: d.ebitda ?? null,
        net_income: d.net_income ?? null,
        earnings_per_share: d.earnings_per_share ?? null,
        dividend: d.dividend ?? null,
        gross_margin: d.gross_margin ?? null,
        operating_margin: d.operating_margin ?? null,
        net_margin: d.net_margin ?? null,
      }));
      await supabase.from('quarterly_income_statement' as any).delete().eq('company_id', id).eq('analysis_id', analysisId);
      await supabase.from('quarterly_income_statement' as any).insert(qRows);
    }

    // Auto-fill company info
    if (companyInfo) {
      const updates: Record<string, any> = {};
      if (companyInfo.ticker) updates.ticker = companyInfo.ticker;
      if (companyInfo.reportingCurrency) updates.reporting_currency = companyInfo.reportingCurrency;
      if (companyInfo.tradingCurrency) updates.trading_currency = companyInfo.tradingCurrency;
      if (companyInfo.latestPrice) updates.current_price = companyInfo.latestPrice;
      if (companyInfo.sharesOutstanding) updates.shares_outstanding = companyInfo.sharesOutstanding;
      if (Object.keys(updates).length > 0) {
        await supabase.from('companies').update(updates).eq('id', id);
        queryClient.invalidateQueries({ queryKey: ['company', id] });
      }
      // Also set on analysis level
      if (companyInfo.latestPrice) setCurrentPrice(String(companyInfo.latestPrice));
      if (companyInfo.sharesOutstanding) {
        setSharesOutstanding(String(companyInfo.sharesOutstanding));
      }
    }

    // Fallback: if sharesOutstanding not in companyInfo, check parsed data rows
    if (!companyInfo?.sharesOutstanding) {
      const sortedYearly = [...data.filter(d => !d.quarter)].sort((a, b) => b.fiscal_year - a.fiscal_year);
      const latestShares = sortedYearly.find(d => d.shares_outstanding)?.shares_outstanding;
      if (latestShares) {
        setSharesOutstanding(String(Math.round(latestShares)));
        await supabase.from('companies').update({ shares_outstanding: Math.round(latestShares) }).eq('id', id);
        queryClient.invalidateQueries({ queryKey: ['company', id] });
      }
    }

    queryClient.invalidateQueries({ queryKey: ['income_statement', id, analysisId] });
    queryClient.invalidateQueries({ queryKey: ['balance_sheet', id, analysisId] });
    queryClient.invalidateQueries({ queryKey: ['quarterly_income', id, analysisId] });
    toast.success(`Imported financial data for this analysis`);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!analysisId || !currentAnalysis) {
    return (
      <MainLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Analysis not found</p>
          <Link to={`/company/${id}`} className="text-primary hover:underline">{t.common.back}</Link>
        </div>
      </MainLayout>
    );
  }

  const priceNum = parseFloat(currentPrice) || 0;
  const sharesNum = parseInt(sharesOutstanding) || 0;

  const displayData = showQuarterly && quarterlyHistoricalData.length > 0 ? quarterlyHistoricalData : historicalData;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            {/* Quick navigation bar */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              <Link
                to={`/company/${id}?tab=overview`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />Översikt
              </Link>
              <Link
                to={`/company/${id}?tab=financials`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              >
                <BarChart3 className="h-3.5 w-3.5" />Finansiell data
              </Link>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-background text-foreground font-medium shadow-sm">
                <FileText className="h-3.5 w-3.5" />Analys
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="Namnge din analys..."
                value={analysisName}
                onChange={(e) => setAnalysisName(e.target.value)}
                className="text-2xl font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0 max-w-md"
              />
            </div>
            <h2 className="text-lg text-muted-foreground">{company?.name}</h2>
            <div className="flex items-center gap-3">
              <RatingBadge rating={rating || null} size="lg" />
              {currentMOS !== undefined && <MOSBadge value={currentMOS} size="lg" />}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isLocked && <FileImportDialog companyId={id!} onImportFinancials={handleAnalysisImport} onImportInsiders={async () => {}} />}
            {!isLocked && (isSaving ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /><span>Sparar...</span>
              </div>
            ) : lastSaved ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-success" /><span>{t.analysis.autosaved}</span>
              </div>
            ) : null)}
            {!isLocked && (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t.analysis.saveAnalysis}
              </Button>
            )}
            <Button variant={isLocked ? "secondary" : "outline"} size="sm" onClick={toggleLock} className="gap-1.5">
              {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              {isLocked ? 'Låst' : 'Lås'}
            </Button>
            {!isLocked && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Ta bort analys?</AlertDialogTitle>
                    <AlertDialogDescription>Analysen och all kopplad data tas bort permanent.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                      await supabase.from('income_statement').delete().eq('analysis_id', analysisId!);
                      await supabase.from('balance_sheet').delete().eq('analysis_id', analysisId!);
                      await supabase.from('analyses').delete().eq('id', analysisId!);
                      queryClient.invalidateQueries({ queryKey: ['all-analyses', id] });
                      toast.success('Analys borttagen');
                      navigate(`/company/${id}?tab=analysis`);
                    }}>Ta bort</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {isLocked && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Denna analys är låst och kan inte redigeras. Klicka på "Låst" ovan för att låsa upp.
          </div>
        )}

        {/* Main Layout */}
        <div className={`grid gap-6 xl:grid-cols-4 ${isLocked ? 'pointer-events-none opacity-60' : ''}`}>
          {/* Left Sidebar */}
          <div className="xl:col-span-1 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-4 w-4" />Nyckeldata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Kurs ({company?.trading_currency})</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Antal aktier</Label>
                  <Input type="number" placeholder="1000000" value={sharesOutstanding} onChange={(e) => setSharesOutstanding(e.target.value)} className="font-mono" />
                </div>
                {priceNum > 0 && sharesNum > 0 && (
                  <div className="pt-2 border-t space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Börsvärde</span>
                      <span className="font-mono font-medium">{((priceNum * sharesNum) / 1e9).toFixed(2)} Mdr</span>
                    </div>
                    {(() => {
                      const latestIncome = incomeData?.[incomeData.length - 1] as any;
                      const latestBalance = balanceData?.[balanceData.length - 1] as any;
                      const marketCapMSEK = (priceNum * sharesNum) / 1_000_000;
                      const ebit = latestIncome?.ebit;
                      const ebitda = latestIncome?.ebitda;
                      const netDebt = latestBalance ? ((latestBalance.long_term_debt ?? 0) + (latestBalance.short_term_debt ?? 0) - (latestBalance.cash_equivalents ?? 0)) : null;
                      const ev = netDebt !== null ? marketCapMSEK + netDebt : null;
                      return (
                        <>
                          {ev !== null && <div className="flex justify-between text-sm"><span className="text-muted-foreground">EV</span><span className="font-mono font-medium">{(ev / 1e3).toFixed(2)} Mdr</span></div>}
                          {ev !== null && ebit && ebit > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">EV/EBIT</span><span className="font-mono font-medium">{(ev / ebit).toFixed(1)}x</span></div>}
                          {ev !== null && ebitda && ebitda > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">EV/EBITDA</span><span className="font-mono font-medium">{(ev / ebitda).toFixed(1)}x</span></div>}
                          {netDebt !== null && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Nettoskuld</span><span className="font-mono font-medium">{netDebt.toFixed(0)} MSEK</span></div>}
                        </>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* NAV Discount for investment companies */}
            {isInvestmentCompany && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Substansrabatt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Aktuell rabatt/premie (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="T.ex. -15 för 15% rabatt"
                      value={navDiscount}
                      onChange={(e) => setNavDiscount(e.target.value)}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Negativt = rabatt, positivt = premie. Beräknas som (aktiekurs − substansvärde) / substansvärde.
                    </p>
                  </div>
                  {navDiscount && (
                    <div className="pt-2 border-t">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <span className={`font-medium ${parseFloat(navDiscount) < 0 ? 'text-emerald-600 dark:text-emerald-400' : parseFloat(navDiscount) > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {parseFloat(navDiscount) < 0 ? `${Math.abs(parseFloat(navDiscount)).toFixed(1)}% rabatt` : parseFloat(navDiscount) > 0 ? `${parseFloat(navDiscount).toFixed(1)}% premie` : 'Handlas till substansvärde'}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}


            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Visa kvartalsdata</Label>
                  <Switch checked={showQuarterly} onCheckedChange={setShowQuarterly} />
                </div>
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Rensa data</p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full gap-1 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />Rensa kvartalsdata
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rensa kvartalsdata?</AlertDialogTitle>
                        <AlertDialogDescription>All kvartalsdata för detta bolag tas bort. Denna åtgärd kan inte ångras.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                          await supabase.from('quarterly_income_statement' as any).delete().eq('company_id', id!);
                          await supabase.from('quarterly_balance_sheet' as any).delete().eq('company_id', id!);
                          queryClient.invalidateQueries({ queryKey: ['quarterly_income', id, analysisId] });
                          toast.success('Kvartalsdata rensad');
                        }}>Rensa</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full gap-1 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />Rensa årsdata
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rensa årsdata?</AlertDialogTitle>
                        <AlertDialogDescription>All årsdata (resultaträkning och balansräkning) för denna analys tas bort.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                          if (analysisId) {
                            await supabase.from('income_statement').delete().eq('company_id', id!).eq('analysis_id', analysisId);
                            await supabase.from('balance_sheet').delete().eq('company_id', id!).eq('analysis_id', analysisId);
                          }
                          // Also clear company-level data
                          await supabase.from('income_statement').delete().eq('company_id', id!).is('analysis_id', null);
                          await supabase.from('balance_sheet').delete().eq('company_id', id!).is('analysis_id', null);
                          queryClient.invalidateQueries({ queryKey: ['income_statement', id, analysisId] });
                          queryClient.invalidateQueries({ queryKey: ['balance_sheet', id, analysisId] });
                          toast.success('Årsdata rensad');
                        }}>Rensa</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>

            {/* Section toggles */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="h-4 w-4" />Sektioner</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: 'debt', label: 'Skuldsättning' },
                  { key: 'employees', label: 'Anställda' },
                  { key: 'images', label: 'Bilder' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-sm">{label}</Label>
                    <Switch
                      checked={analysisSections[key] ?? false}
                      onCheckedChange={() => setAnalysisSections(prev => ({ ...prev, [key]: !prev[key] }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Employees input */}
            {analysisSections.employees && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Anställda</CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    type="number"
                    placeholder="Antal anställda"
                    value={employees}
                    onChange={(e) => setEmployees(e.target.value)}
                    className="font-mono"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Main Content */}
          <div className="xl:col-span-3 space-y-6">
            {isInvestmentCompany ? (
              <>
                <InvestmentHoldings
                  holdings={investmentHoldings}
                  onHoldingsChange={setInvestmentHoldings}
                  readOnly={isLocked}
                  companyName={company?.name}
                />
                {/* Rating & Notes for investment company */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Betyg & Kommentar</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      {(['buy', 'hold', 'sell'] as const).map((r) => (
                        <Button
                          key={r}
                          variant={rating === r ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setRating(r)}
                          className={rating === r ? (r === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' : r === 'sell' ? 'bg-destructive hover:bg-destructive/90' : '') : ''}
                        >
                          {r === 'buy' ? 'Köp' : r === 'hold' ? 'Behåll' : 'Sälj'}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Övergripande kommentar om investmentbolaget..."
                      rows={4}
                    />
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <HistoricalDataTable
                  data={displayData}
                  currency={company?.reporting_currency}
                  sharesOutstanding={sharesNum}
                  currentPrice={priceNum}
                  adjustments={adjustments}
                />
                <AdjustmentsEditor
                  adjustments={adjustments}
                  onAdjustmentsChange={setAdjustments}
                />
                <SpreadsheetAnalysis
                  analysisDate={currentAnalysis?.created_at?.split('T')[0]}
                  currentPrice={priceNum}
                  sharesOutstanding={sharesNum}
                  historicalData={historicalData.map(h => ({
                    year: h.fiscal_year,
                    revenue: h.revenue || 0,
                    netIncome: h.net_income || 0,
                  }))}
                  quarterlyHistoricalData={quarterlyHistoricalData.map(h => ({
                    year: h.fiscal_year,
                    quarter: h.quarter || 1,
                    revenue: h.revenue || 0,
                    netIncome: h.net_income || 0,
                  }))}
                  projections={projections}
                  onProjectionsChange={handleProjectionsChange}
                  rating={rating}
                  onRatingChange={setRating}
                  notes={notes}
                  onNotesChange={setNotes}
                  currency={company?.reporting_currency}
                  showQuarterly={showQuarterly}
                  adjustments={adjustments}
                  netDebt={(() => {
                    const latestBalance = balanceData?.[balanceData.length - 1] as any;
                    if (!latestBalance) return 0;
                    return ((latestBalance.long_term_debt ?? 0) + (latestBalance.short_term_debt ?? 0) - (latestBalance.cash_equivalents ?? 0));
                  })()}
                />
                {analysisSections.debt && (
                  <DebtSection data={(balanceData || []).map((b: any) => ({
                    fiscal_year: b.fiscal_year,
                    long_term_debt: b.long_term_debt,
                    short_term_debt: b.short_term_debt,
                    cash_equivalents: b.cash_equivalents,
                    total_liabilities: b.total_liabilities,
                    shareholders_equity: b.shareholders_equity,
                    equity_ratio: b.equity_ratio,
                  }))} />
                )}
              </>
            )}
            <ReportAnalyzer
              companyId={id!}
              analysisId={analysisId!}
              companyName={company?.name}
              readOnly={isLocked}
            />
            {analysisSections.images && (
              <ImageUpload
                images={analysisImages}
                onImagesChange={setAnalysisImages}
                title="Analysbilder"
                folder={`analysis/${analysisId}`}
              />
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
