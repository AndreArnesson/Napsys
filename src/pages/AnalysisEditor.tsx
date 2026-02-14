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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Save, CheckCircle, Settings2 } from 'lucide-react';
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
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

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

  // Fetch real historical data from DB
  const { data: incomeData } = useQuery({
    queryKey: ['income_statement', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('income_statement').select('*').eq('company_id', id).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: balanceData } = useQuery({
    queryKey: ['balance_sheet', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('balance_sheet').select('*').eq('company_id', id).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Transform DB data to HistoricalYear format
  const historicalData: HistoricalYear[] = useMemo(() => {
    if (!incomeData || incomeData.length === 0) return [];
    return incomeData.map((row, index) => {
      const prevRow = incomeData[index - 1];
      const revenueGrowth = prevRow?.revenue && row.revenue
        ? ((row.revenue - prevRow.revenue) / prevRow.revenue) * 100
        : undefined;
      const bs = balanceData?.find(b => b.fiscal_year === row.fiscal_year);
      return {
        fiscal_year: row.fiscal_year,
        revenue: row.revenue ?? undefined,
        revenue_growth: revenueGrowth,
        ebit: row.ebit ?? undefined,
        ebitda: row.ebitda ?? undefined,
        net_income: row.net_income ?? undefined,
        gross_margin: row.gross_margin ? row.gross_margin * 100 : undefined,
        operating_margin: row.operating_margin ? row.operating_margin * 100 : undefined,
        net_margin: row.net_margin ? row.net_margin * 100 : undefined,
        total_debt: bs ? ((bs.long_term_debt ?? 0) + ((bs as any).short_term_debt ?? 0)) || undefined : undefined,
        cash: bs?.cash_equivalents ?? undefined,
        shareholders_equity: bs?.shareholders_equity ?? undefined,
      };
    });
  }, [incomeData, balanceData]);

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

  // Populate form with analysis data
  useEffect(() => {
    if (currentAnalysis) {
      setRating(currentAnalysis.rating as 'buy' | 'hold' | 'sell' | undefined);
      setNotes(currentAnalysis.summary_comment || '');
      // Use analysis-level price/shares, fall back to company-level
      setCurrentPrice((currentAnalysis as any).current_price?.toString() || company?.current_price?.toString() || '');
      setSharesOutstanding((currentAnalysis as any).shares_outstanding?.toString() || company?.shares_outstanding?.toString() || '');
    }
  }, [currentAnalysis, company]);

  // Calculate MOS from projections
  const currentMOS = useMemo(() => {
    const year3Proj = projections.find(p => p.year === new Date().getFullYear() + 3);
    return year3Proj?.mos;
  }, [projections]);

  // Save mutation - now saves price/shares to the analysis record
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
    [user, id, analysisId, rating, notes, currentPrice, sharesOutstanding, projections]
  );

  useEffect(() => {
    if (user && analysisId && (notes || rating)) {
      debouncedSave();
    }
    return () => debouncedSave.cancel();
  }, [rating, notes, currentPrice, sharesOutstanding, projections, debouncedSave]);

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

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <Link
              to={`/company/${id}?tab=analysis`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.common.back}
            </Link>
            <h1 className="text-2xl font-bold">
              {t.analysis.title}: {company?.name}
            </h1>
            <div className="flex items-center gap-3">
              <RatingBadge rating={rating || null} size="lg" />
              {currentMOS !== undefined && <MOSBadge value={currentMOS} size="lg" />}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isSaving ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sparar...</span>
              </div>
            ) : lastSaved ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-success" />
                <span>{t.analysis.autosaved}</span>
              </div>
            ) : null}
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="gap-2"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t.analysis.saveAnalysis}
            </Button>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid gap-6 xl:grid-cols-4">
          {/* Left Sidebar */}
          <div className="xl:col-span-1 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Nyckeldata
                </CardTitle>
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
                      const latestIncome = incomeData?.[incomeData.length - 1];
                      const latestBalance = balanceData?.[balanceData.length - 1];
                      const marketCap = priceNum * sharesNum;
                      const ebit = latestIncome?.ebit;
                      const ebitda = latestIncome?.ebitda;
                      const netDebt = latestBalance ? ((latestBalance.long_term_debt ?? 0) + ((latestBalance as any).short_term_debt ?? 0) - (latestBalance.cash_equivalents ?? 0)) : null;
                      const ev = netDebt !== null ? marketCap + netDebt : null;
                      return (
                        <>
                          {ev !== null && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">EV</span>
                              <span className="font-mono font-medium">{(ev / 1e9).toFixed(2)} Mdr</span>
                            </div>
                          )}
                          {ev !== null && ebit && ebit > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">EV/EBIT</span>
                              <span className="font-mono font-medium">{(ev / ebit).toFixed(1)}x</span>
                            </div>
                          )}
                          {ev !== null && ebitda && ebitda > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">EV/EBITDA</span>
                              <span className="font-mono font-medium">{(ev / ebitda).toFixed(1)}x</span>
                            </div>
                          )}
                          {netDebt !== null && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Nettoskuld</span>
                              <span className="font-mono font-medium">{(netDebt / 1e6).toFixed(0)} M</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="xl:col-span-3 space-y-6">
            <HistoricalDataTable
              data={historicalData}
              currency={company?.reporting_currency}
              sharesOutstanding={sharesNum}
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
              projections={projections}
              onProjectionsChange={setProjections}
              rating={rating}
              onRatingChange={setRating}
              notes={notes}
              onNotesChange={setNotes}
              currency={company?.reporting_currency}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
