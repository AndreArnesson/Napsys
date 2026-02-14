import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { MOSBadge } from '@/components/company/MOSBadge';
import { RatingBadge } from '@/components/company/RatingBadge';
import { PreviousAnalysesList } from '@/components/analysis/PreviousAnalysesList';
import { HistoricalDataTable, HistoricalYear } from '@/components/analysis/HistoricalDataTable';
import { SpreadsheetAnalysis, YearlyProjection } from '@/components/analysis/SpreadsheetAnalysis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Save, CheckCircle, TrendingUp, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import debounce from 'lodash/debounce';

// Mock historical data - this would come from database/imports
const generateHistoricalData = (): HistoricalYear[] => {
  const data: HistoricalYear[] = [];
  const baseRevenue = 150;
  const baseEbit = 20;
  
  for (let year = 2019; year <= 2025; year++) {
    const growth = Math.random() * 0.2 - 0.05; // -5% to +15%
    const prevRevenue = data.length > 0 ? data[data.length - 1].revenue! : baseRevenue;
    const revenue = Math.round(prevRevenue * (1 + growth));
    const margin = Math.random() * 0.08 + 0.06; // 6-14%
    const ebit = Math.round(revenue * margin);
    const netIncome = Math.round(ebit * 0.75); // After tax
    const eps = netIncome / 50; // Assuming 50M shares
    
    data.push({
      fiscal_year: year,
      revenue,
      revenue_growth: data.length > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : undefined,
      ebit,
      ebitda: Math.round(ebit * 1.2),
      net_income: netIncome,
      earnings_per_share: eps,
      operating_margin: margin * 100,
      net_margin: (netIncome / revenue) * 100,
    });
  }
  
  return data;
};

export default function AnalysisEditor() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  // Current analysis state
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [rating, setRating] = useState<'buy' | 'hold' | 'sell' | undefined>();
  const [notes, setNotes] = useState('');
  const [projections, setProjections] = useState<YearlyProjection[]>([]);
  
  // Key data inputs
  const [currentPrice, setCurrentPrice] = useState<string>('');
  const [sharesOutstanding, setSharesOutstanding] = useState<string>('');
  
  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const historicalData = useMemo(() => generateHistoricalData(), []);

  // Fetch company
  const { data: company } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch ALL analyses for this company
  const { data: allAnalyses, isLoading } = useQuery({
    queryKey: ['all-analyses', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analyses')
        .select('*')
        .eq('company_id', id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Get the currently selected analysis
  const currentAnalysis = allAnalyses?.find(a => a.id === selectedAnalysisId) || allAnalyses?.[0];

  // Populate form with selected analysis data
  useEffect(() => {
    if (currentAnalysis) {
      setSelectedAnalysisId(currentAnalysis.id);
      setRating(currentAnalysis.rating as 'buy' | 'hold' | 'sell' | undefined);
      setNotes(currentAnalysis.summary_comment || '');
    }
    if (company) {
      setCurrentPrice(company.current_price?.toString() || '');
      setSharesOutstanding(company.shares_outstanding?.toString() || '');
    }
  }, [currentAnalysis, company]);

  // Calculate MOS from projections
  const currentMOS = useMemo(() => {
    const year3Proj = projections.find(p => p.year === new Date().getFullYear() + 3);
    return year3Proj?.mos;
  }, [projections]);

  // Create new analysis
  const createAnalysis = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('analyses')
        .insert({
          company_id: id,
          user_id: user!.id,
          is_draft: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['all-analyses', id] });
      setSelectedAnalysisId(data.id);
      setRating(undefined);
      setNotes('');
      setProjections([]);
      toast.success('New analysis created');
    },
    onError: () => {
      toast.error(t.common.error);
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const mosValue = currentMOS;
      
      if (!selectedAnalysisId) {
        // Create new analysis first
        const { data: newAnalysis, error: createError } = await supabase
          .from('analyses')
          .insert({
            company_id: id,
            user_id: user!.id,
            rating: rating || null,
            summary_comment: notes,
            margin_of_safety: mosValue,
            is_draft: true,
          })
          .select()
          .single();
        
        if (createError) throw createError;
        setSelectedAnalysisId(newAnalysis.id);
        return;
      }

      const { error } = await supabase
        .from('analyses')
        .update({
          rating: rating || null,
          summary_comment: notes,
          margin_of_safety: mosValue,
          is_draft: true,
        })
        .eq('id', selectedAnalysisId);
      
      if (error) throw error;

      // Update company price/shares
      if (company) {
        await supabase
          .from('companies')
          .update({
            current_price: currentPrice ? parseFloat(currentPrice) : null,
            shares_outstanding: sharesOutstanding ? parseInt(sharesOutstanding) : null,
          })
          .eq('id', id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-analyses', id] });
      queryClient.invalidateQueries({ queryKey: ['company', id] });
      setLastSaved(new Date());
      setIsSaving(false);
    },
    onError: () => {
      toast.error(t.common.error);
      setIsSaving(false);
    },
  });

  // Debounced auto-save
  const debouncedSave = useCallback(
    debounce(() => {
      if (!user) return;
      setIsSaving(true);
      saveMutation.mutate();
    }, 3000),
    [user, id, selectedAnalysisId, rating, notes, currentPrice, sharesOutstanding, projections]
  );

  // Trigger auto-save on changes
  useEffect(() => {
    if (user && id && (selectedAnalysisId || notes || rating)) {
      debouncedSave();
    }
    return () => debouncedSave.cancel();
  }, [rating, notes, currentPrice, sharesOutstanding, projections, debouncedSave]);

  const handleSelectAnalysis = (analysis: any) => {
    setSelectedAnalysisId(analysis.id);
  };

  const handleCreateNew = () => {
    createAnalysis.mutate();
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

  const priceNum = parseFloat(currentPrice) || 0;
  const sharesNum = parseInt(sharesOutstanding) || 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <Link
              to={`/company/${id}`}
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
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t.analysis.saveAnalysis}
            </Button>
          </div>
        </div>

        {/* Main Layout - 3 Column */}
        <div className="grid gap-6 xl:grid-cols-4">
          {/* Left Sidebar - Previous Analyses & Key Data */}
          <div className="xl:col-span-1 space-y-6">
            {/* Key Data */}
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
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Antal aktier</Label>
                  <Input
                    type="number"
                    placeholder="1000000"
                    value={sharesOutstanding}
                    onChange={(e) => setSharesOutstanding(e.target.value)}
                    className="font-mono"
                  />
                </div>
                {priceNum > 0 && sharesNum > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Börsvärde</span>
                      <span className="font-mono font-medium">
                        {((priceNum * sharesNum) / 1e9).toFixed(2)} Mdr
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Previous Analyses */}
            <PreviousAnalysesList
              analyses={allAnalyses || []}
              currentAnalysisId={selectedAnalysisId || undefined}
              onSelect={handleSelectAnalysis}
              onCreateNew={handleCreateNew}
            />
          </div>

          {/* Main Content - Historical Data + Spreadsheet Analysis */}
          <div className="xl:col-span-3 space-y-6">
            {/* Historical Data Reference */}
            <HistoricalDataTable
              data={historicalData}
              currency={company?.reporting_currency}
              sharesOutstanding={sharesNum}
            />

            {/* Spreadsheet-style Analysis */}
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
