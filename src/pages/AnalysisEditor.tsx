import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { ImageUpload } from '@/components/company/ImageUpload';
import { FileImportDialog, ParsedFinancialData, ParsedCompanyInfo } from '@/components/company/FileImportDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Loader2, Save, CheckCircle, Settings2, Trash2, LayoutDashboard, BarChart3, FileText } from 'lucide-react';
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

  // Fetch company
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
    enabled: !!id && showQuarterly,
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
      setAnalysisSections({ ...defaultSections, ...((currentAnalysis as any).visible_sections || {}) });
    }
  }, [currentAnalysis, company]);

  const currentMOS = useMemo(() => {
    const year3Proj = projections.find(p => p.year === new Date().getFullYear() + 3);
    return year3Proj?.mos;
  }, [projections]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!analysisId) return;
      const { error } = await supabase
        .from('analyses')
        .update({
          rating: rating || null,
          summary_comment: notes,
          margin_of_safety: currentMOS ?? null,
          is_draft: true,
          current_price: currentPrice ? parseFloat(currentPrice) : null,
          shares_outstanding: sharesOutstanding ? parseInt(sharesOutstanding) : null,
          name: analysisName || null,
          images: analysisImages,
          employees: employees ? parseInt(employees) : null,
          visible_sections: analysisSections,
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
      if (!user || !analysisId) return;
      setIsSaving(true);
      saveMutation.mutate();
    }, 3000),
    [user, id, analysisId, rating, notes, currentPrice, sharesOutstanding, projections, analysisName, analysisImages, employees, analysisSections]
  );

  useEffect(() => {
    if (user && analysisId && (notes || rating || analysisName)) {
      debouncedSave();
    }
    return () => debouncedSave.cancel();
  }, [rating, notes, currentPrice, sharesOutstanding, projections, analysisName, analysisImages, employees, analysisSections, debouncedSave]);

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
            <FileImportDialog companyId={id!} onImportFinancials={handleAnalysisImport} onImportInsiders={async () => {}} />
            {isSaving ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /><span>Sparar...</span>
              </div>
            ) : lastSaved ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-success" /><span>{t.analysis.autosaved}</span>
              </div>
            ) : null}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t.analysis.saveAnalysis}
            </Button>
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
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid gap-6 xl:grid-cols-4">
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

            {/* Quarterly toggle */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Visa kvartalsdata</Label>
                  <Switch checked={showQuarterly} onCheckedChange={setShowQuarterly} />
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
            <HistoricalDataTable
              data={displayData}
              currency={company?.reporting_currency}
              sharesOutstanding={sharesNum}
              currentPrice={priceNum}
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
              onProjectionsChange={setProjections}
              rating={rating}
              onRatingChange={setRating}
              notes={notes}
              onNotesChange={setNotes}
              currency={company?.reporting_currency}
              showQuarterly={showQuarterly}
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
