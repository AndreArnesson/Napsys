import { useState, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { MOSBadge } from '@/components/company/MOSBadge';
import { AISummaryCard } from '@/components/company/AISummaryCard';
import { RatingBadge } from '@/components/company/RatingBadge';
import { CEOSection } from '@/components/company/CEOSection';
import { PilotskolanSection } from '@/components/company/PilotskolanSection';
import { KeyDataEditor } from '@/components/company/KeyDataEditor';
import { InsiderTable, InsiderTrade } from '@/components/company/InsiderTable';
import { InsiderOwnership, OwnershipEntry } from '@/components/company/InsiderOwnership';
import { FileImportDialog, ParsedFinancialData, ParsedInsiderTrade, ParsedCompanyInfo } from '@/components/company/FileImportDialog';
import { ImageUpload } from '@/components/company/ImageUpload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Loader2, Clock, ChevronDown, Plus, Trash2, FileText, Settings2, Eye, EyeOff } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { Pencil } from 'lucide-react';

function AnalysisListItem({ analysis, companyId, locale, onDelete, onRename }: {
  analysis: any;
  companyId: string;
  locale: any;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState((analysis as any).name || '');

  return (
    <Card className="hover:border-primary/20 transition-colors">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <Link to={`/company/${companyId}/analysis/${analysis.id}`} className="flex items-center gap-3 flex-1 cursor-pointer">
            <RatingBadge rating={analysis.rating as 'buy' | 'hold' | 'sell' | null} />
            {!editing && (analysis as any).name && (
              <span className="font-medium">{(analysis as any).name}</span>
            )}
            <MOSBadge value={analysis.margin_of_safety} size="sm" />
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(analysis.updated_at), { addSuffix: true, locale })}
            </span>
            {analysis.is_draft && <span className="text-xs bg-muted px-2 py-0.5 rounded">Draft</span>}
          </Link>
          <div className="flex items-center gap-1">
            {editing ? (
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); onRename(editName); setEditing(false); }}>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 w-40 text-sm" autoFocus placeholder="Analysnamn..." />
                <Button type="submit" variant="ghost" size="sm" className="h-7 px-2 text-xs">OK</Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>✕</Button>
              </form>
            ) : (
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ta bort analys?</AlertDialogTitle>
                  <AlertDialogDescription>Analysen och all kopplad data tas bort permanent.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>Ta bort</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        {analysis.summary_comment && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{analysis.summary_comment}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface CEOData {
  name: string;
  since?: string;
  background?: string;
  compensation?: string;
  ownership?: string;
  notes?: string;
}

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const locale = language === 'sv' ? sv : enUS;

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'overview';
  // Insider trades from DB
  const { data: insiderTrades = [] } = useQuery({
    queryKey: ['insider_trades', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('insider_trades' as any).select('*').eq('company_id', id!).order('date', { ascending: false });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        id: d.id,
        date: d.date,
        person: d.person,
        position: d.position,
        type: d.type,
        volume: Number(d.volume),
        price: Number(d.price),
        currency: d.currency,
        instrument: d.instrument,
        isin: d.isin,
        nature: d.nature,
      })) as InsiderTrade[];
    },
    enabled: !!id,
  });
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [moatsOpen, setMoatsOpen] = useState(true);
  const [creatingAnalysis, setCreatingAnalysis] = useState(false);
  const [localDescription, setLocalDescription] = useState('');
  const [localMoats, setLocalMoats] = useState('');
  const [localBusinessModel, setLocalBusinessModel] = useState('');
  const [localCompetition, setLocalCompetition] = useState('');
  const [richTextInited, setRichTextInited] = useState(false);
  const [generatingFinSummary, setGeneratingFinSummary] = useState(false);
  const [generatingInsiderSummary, setGeneratingInsiderSummary] = useState(false);
  const [generatingBalanceSummary, setGeneratingBalanceSummary] = useState(false);
  const [localFinSummary, setLocalFinSummary] = useState('');
  const [localInsiderSummary, setLocalInsiderSummary] = useState('');
  const [localBalanceSummary, setLocalBalanceSummary] = useState('');
  const [finSummaryInited, setFinSummaryInited] = useState(false);

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Init rich text values when company loads
  if (company && !richTextInited) {
    setLocalDescription(company.description || '');
    setLocalMoats(company.moats || '');
    setLocalBusinessModel((company as any)?.business_model || '');
    setLocalCompetition((company as any)?.competition || '');
    setRichTextInited(true);
  }
  if (company && !finSummaryInited) {
    setLocalFinSummary((company as any)?.financial_summary || '');
    setLocalInsiderSummary((company as any)?.insider_summary || '');
    setLocalBalanceSummary((company as any)?.balance_sheet_summary || '');
    setFinSummaryInited(true);
  }

  const { data: allAnalyses } = useQuery({
    queryKey: ['all-analyses', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('analyses').select('*').eq('company_id', id).order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const latestAnalysis = allAnalyses?.[0];

  const { data: incomeData } = useQuery({
    queryKey: ['income_statement', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('income_statement').select('*').eq('company_id', id).is('analysis_id', null).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: balanceSheetData } = useQuery({
    queryKey: ['balance_sheet', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('balance_sheet').select('*').eq('company_id', id).is('analysis_id', null).order('fiscal_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: timelineEvents } = useQuery({
    queryKey: ['timeline', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('timeline_events').select('*').eq('company_id', id).order('event_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const updateCompany = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from('companies').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id] });
      toast.success(t.common.success);
    },
    onError: () => toast.error(t.common.error),
  });

  const ceoData: CEOData = company?.management
    ? (typeof company.management === 'object' ? (company.management as unknown as CEOData) : { name: String(company.management) })
    : { name: '' };

  const handleCEOUpdate = (newCeo: CEOData) => { updateCompany.mutate({ management: JSON.stringify(newCeo) }); };
  const handleKeyDataUpdate = (updates: Record<string, any>) => {
    // Map camelCase keys from KeyDataEditor to snake_case DB columns
    const mapped: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'reportingCurrency') mapped.reporting_currency = value;
      else if (key === 'tradingCurrency') mapped.trading_currency = value;
      else if (key === 'currentPrice') mapped.current_price = value;
      else if (key === 'exchange') mapped.exchange = value;
      else mapped[key] = value;
    }
    updateCompany.mutate(mapped);
  };
  const handleOwnershipUpdate = (data: OwnershipEntry[]) => { updateCompany.mutate({ insider_ownership: data }); };

  const rawOwnership = (company as any)?.insider_ownership;
  const ownershipData: OwnershipEntry[] = Array.isArray(rawOwnership)
    ? rawOwnership.map((o: any) => ({ name: o.name || '', role: o.role || '', shares: o.shares || 0, percentage: o.percentage || 0 }))
    : [];

  const companyImages: string[] = ((company as any)?.images as string[]) || [];

  const generateFinancialSummary = async () => {
    if (!incomeData || incomeData.length === 0) return;
    setGeneratingFinSummary(true);
    try {
      const payload = {
        type: 'financial',
        companyName: company?.name,
        data: {
          income: incomeData,
          balance: balanceSheetData || [],
          currentPrice: company?.current_price,
          sharesOutstanding: company?.shares_outstanding,
        },
      };
      const { data: result, error } = await supabase.functions.invoke('ai-summary', { body: payload });
      if (error) throw error;
      if (result?.summary) {
        setLocalFinSummary(result.summary);
        toast.success('AI-sammanfattning genererad');
      }
    } catch (e: any) {
      console.error('Financial summary error:', e);
      toast.error(e?.message || 'Kunde inte generera sammanfattning');
    } finally {
      setGeneratingFinSummary(false);
    }
  };

  const saveFinancialSummary = async () => {
    await supabase.from('companies').update({ financial_summary: localFinSummary } as any).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['company', id] });
    toast.success('Sammanfattning sparad');
  };

  const generateInsiderSummary = async () => {
    if (!insiderTrades || insiderTrades.length === 0) return;
    setGeneratingInsiderSummary(true);
    try {
      const payload = {
        type: 'insider',
        companyName: company?.name,
        data: insiderTrades.slice(0, 100),
      };
      const { data: result, error } = await supabase.functions.invoke('ai-summary', { body: payload });
      if (error) throw error;
      if (result?.summary) {
        setLocalInsiderSummary(result.summary);
        toast.success('AI-sammanfattning genererad');
      }
    } catch (e: any) {
      console.error('Insider summary error:', e);
      toast.error(e?.message || 'Kunde inte generera sammanfattning');
    } finally {
      setGeneratingInsiderSummary(false);
    }
  };

  const saveInsiderSummary = async () => {
    await supabase.from('companies').update({ insider_summary: localInsiderSummary } as any).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['company', id] });
    toast.success('Sammanfattning sparad');
  };

  const generateBalanceSummary = async () => {
    if (!balanceSheetData || balanceSheetData.length === 0) return;
    setGeneratingBalanceSummary(true);
    try {
      const payload = {
        type: 'balance_sheet',
        companyName: company?.name,
        data: balanceSheetData,
      };
      const { data: result, error } = await supabase.functions.invoke('ai-summary', { body: payload });
      if (error) throw error;
      if (result?.summary) {
        setLocalBalanceSummary(result.summary);
        toast.success('AI-sammanfattning genererad');
      }
    } catch (e: any) {
      console.error('Balance summary error:', e);
      toast.error(e?.message || 'Kunde inte generera sammanfattning');
    } finally {
      setGeneratingBalanceSummary(false);
    }
  };

  const saveBalanceSummary = async () => {
    await supabase.from('companies').update({ balance_sheet_summary: localBalanceSummary } as any).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['company', id] });
    toast.success('Sammanfattning sparad');
  };

  const handleImportFinancials = async (data: ParsedFinancialData[], companyInfo?: ParsedCompanyInfo) => {
    if (!id || !user) return;

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
    }

    // Fallback: check parsed data rows for shares_outstanding
    if (!companyInfo?.sharesOutstanding) {
      const sortedYearly = [...data.filter(d => !d.quarter)].sort((a, b) => b.fiscal_year - a.fiscal_year);
      const latestShares = sortedYearly.find(d => d.shares_outstanding)?.shares_outstanding;
      if (latestShares) {
        await supabase.from('companies').update({ shares_outstanding: Math.round(latestShares) }).eq('id', id);
        queryClient.invalidateQueries({ queryKey: ['company', id] });
      }
    }

    const yearly = data.filter(d => !d.quarter);
    const quarterly = data.filter(d => !!d.quarter);

    if (yearly.length > 0) {
      const incomeRows = yearly.map(d => ({
        company_id: id,
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

      await supabase.from('income_statement').delete().eq('company_id', id).is('analysis_id', null);
      const { error } = await supabase.from('income_statement').insert(incomeRows as any);
      if (error) { console.error('[Import] Insert error:', error); toast.error('Failed to save income data'); return; }

      const balanceRows = yearly
        .filter(d => d.total_assets || d.total_equity || d.total_liabilities || d.cash_equivalents)
        .map(d => ({
          company_id: id,
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
        await supabase.from('balance_sheet').delete().eq('company_id', id).is('analysis_id', null);
        await supabase.from('balance_sheet').insert(balanceRows as any);
      }
    }

    if (quarterly.length > 0) {
      const qRows = quarterly.map(d => ({
        company_id: id,
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
      await supabase.from('quarterly_income_statement' as any).delete().eq('company_id', id);
      await supabase.from('quarterly_income_statement' as any).insert(qRows);
    }

    queryClient.invalidateQueries({ queryKey: ['income_statement', id] });
    queryClient.invalidateQueries({ queryKey: ['balance_sheet', id] });
    toast.success(`Imported ${data.length} periods of financial data`);
  };

  const handleImportInsiders = async (data: ParsedInsiderTrade[]) => {
    if (!id) return;
    // Delete existing trades for this company, then insert new ones
    await supabase.from('insider_trades' as any).delete().eq('company_id', id);
    const rows = data.map(d => ({
      company_id: id,
      date: d.date,
      person: d.person,
      position: d.position || '',
      type: d.type,
      volume: d.volume,
      price: d.price,
      currency: d.currency || 'SEK',
      instrument: d.instrument || null,
      isin: d.isin || null,
      nature: d.nature || null,
    }));
    const { error } = await supabase.from('insider_trades' as any).insert(rows);
    if (error) { console.error('[Import] Insider insert error:', error); toast.error('Failed to save insider trades'); return; }
    queryClient.invalidateQueries({ queryKey: ['insider_trades', id] });
    toast.success(`Imported ${data.length} insider transactions`);
  };

  if (isLoading) {
    return <MainLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  }

  if (!company) {
    return <MainLayout><div className="text-center py-20"><p className="text-muted-foreground">Company not found</p><Link to="/" className="text-primary hover:underline">{t.common.back}</Link></div></MainLayout>;
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return `${(value * 100).toFixed(1)}%`;
  };

  const hasIncomeData = incomeData && incomeData.length > 0;
  const hasBalanceData = balanceSheetData && balanceSheetData.length > 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />{t.common.back}
            </Link>
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">{company.name}</h1>
              {company.ticker && <span className="text-lg font-mono text-muted-foreground">{company.ticker}</span>}
              {latestAnalysis && (
                <Link
                  to={`/company/${id}/analysis/${latestAnalysis.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {(latestAnalysis as any).name || 'Senaste analys'}
                </Link>
              )}
            </div>
            <div className="flex items-center gap-4">
              <RatingBadge rating={latestAnalysis?.rating as 'buy' | 'hold' | 'sell' | null} size="lg" />
              <MOSBadge value={latestAnalysis?.margin_of_safety} size="lg" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <FileImportDialog companyId={id!} onImportFinancials={handleImportFinancials} onImportInsiders={handleImportInsiders} />
          </div>
        </div>

        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">{t.company.overview}</TabsTrigger>
            <TabsTrigger value="financials">{t.company.financials}</TabsTrigger>
            <TabsTrigger value="balance-sheet">{t.company.balanceSheet}</TabsTrigger>
            <TabsTrigger value="insiders">{t.company.insiders}</TabsTrigger>
            <TabsTrigger value="timeline">{t.company.timeline}</TabsTrigger>
            <TabsTrigger value="analysis">{t.analysis.title}</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Section visibility settings */}
            {(() => {
              const defaultSections = { description: true, moats: true, ceo: true, pilotskolan: true, insiderOwnership: true, images: true, foundedYear: false, businessModel: false, competition: false, management: true };
              const sections = { ...defaultSections, ...((company as any)?.visible_sections || {}) };
              const toggleSection = (key: string) => {
                const updated = { ...sections, [key]: !sections[key as keyof typeof sections] };
                updateCompany.mutate({ visible_sections: updated } as any);
              };
              const sectionLabels: Record<string, string> = {
                description: 'Beskrivning', moats: 'Vallgravar', competition: 'Konkurrens', management: 'Ledning & Styrelse',
                images: 'Bilder', foundedYear: 'Grundat', businessModel: 'Affärsmodell',
              };
              return (
                <>
                  <div className="flex justify-end">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Settings2 className="h-4 w-4" />Sektioner
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64" align="end">
                        <div className="space-y-3">
                          <p className="text-sm font-medium">Visa/dölj sektioner</p>
                          {Object.entries(sectionLabels).map(([key, label]) => (
                            <div key={key} className="flex items-center justify-between">
                              <Label className="text-sm">{label}</Label>
                              <Switch checked={sections[key as keyof typeof sections] as boolean} onCheckedChange={() => toggleSection(key)} />
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <KeyDataEditor data={{ ticker: company.ticker || undefined, reportingCurrency: company.reporting_currency, tradingCurrency: company.trading_currency, currentPrice: company.current_price, exchange: (company as any).exchange || 'stockholm' }} onUpdate={handleKeyDataUpdate} companyId={id} />

                  {sections.foundedYear && (
                    <div className="flex items-center gap-3">
                      <Label className="text-sm font-medium whitespace-nowrap">Grundat</Label>
                      <Input
                        type="number"
                        placeholder="t.ex. 1999"
                        defaultValue={(company as any)?.founded_year || ''}
                        onBlur={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          if (val !== ((company as any)?.founded_year || null)) updateCompany.mutate({ founded_year: val } as any);
                        }}
                        className="max-w-[120px] font-mono h-8"
                      />
                    </div>
                  )}

                  {sections.businessModel && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle>Affärsmodell</CardTitle></CardHeader>
                      <CardContent>
                        <RichTextEditor
                          value={localBusinessModel}
                          onChange={setLocalBusinessModel}
                          onBlur={() => { if (localBusinessModel !== ((company as any)?.business_model || '')) updateCompany.mutate({ business_model: localBusinessModel } as any); }}
                          placeholder="Beskriv bolagets affärsmodell..."
                          minHeight="150px"
                        />
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid gap-6 lg:grid-cols-2">
                    {sections.description && (
                      <Collapsible open={descriptionOpen} onOpenChange={setDescriptionOpen}>
                        <Card>
                          <CardHeader className="pb-2">
                            <CollapsibleTrigger className="flex items-center justify-between w-full">
                              <CardTitle>{t.company.description}</CardTitle>
                              <ChevronDown className={`h-4 w-4 transition-transform ${descriptionOpen ? 'rotate-180' : ''}`} />
                            </CollapsibleTrigger>
                          </CardHeader>
                          <CollapsibleContent>
                            <CardContent>
                              <RichTextEditor value={localDescription} onChange={setLocalDescription} onBlur={() => { if (localDescription !== (company.description || '')) updateCompany.mutate({ description: localDescription }); }} placeholder="Add a detailed description..." minHeight="200px" />
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    )}
                    {sections.moats && (
                      <Collapsible open={moatsOpen} onOpenChange={setMoatsOpen}>
                        <Card>
                          <CardHeader className="pb-2">
                            <CollapsibleTrigger className="flex items-center justify-between w-full">
                              <CardTitle>{t.company.moats}</CardTitle>
                              <ChevronDown className={`h-4 w-4 transition-transform ${moatsOpen ? 'rotate-180' : ''}`} />
                            </CollapsibleTrigger>
                            <CardDescription>Competitive advantages</CardDescription>
                          </CardHeader>
                          <CollapsibleContent>
                            <CardContent>
                              <RichTextEditor value={localMoats} onChange={setLocalMoats} onBlur={() => { if (localMoats !== (company.moats || '')) updateCompany.mutate({ moats: localMoats }); }} placeholder="Describe the company's moats..." minHeight="200px" />
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    )}
                  </div>

                  {sections.competition && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2">Konkurrens</CardTitle></CardHeader>
                      <CardContent>
                        <RichTextEditor
                          value={localCompetition}
                          onChange={setLocalCompetition}
                          onBlur={() => { if (localCompetition !== ((company as any)?.competition || '')) updateCompany.mutate({ competition: localCompetition } as any); }}
                          placeholder="Beskriv konkurrenslandskapet, huvudkonkurrenter, marknadsposition..."
                          minHeight="150px"
                        />
                      </CardContent>
                    </Card>
                  )}

                  {sections.management && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2">Ledning & Styrelse</CardTitle>
                        <CardDescription>VD, insiders och ägande</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <CEOSection ceo={ceoData} onUpdate={handleCEOUpdate} />
                        <PilotskolanSection
                          value={(company as any)?.pilotskolan || ''}
                          onUpdate={(val) => updateCompany.mutate({ pilotskolan: val } as any)}
                        />
                        <InsiderOwnership data={ownershipData} onUpdate={handleOwnershipUpdate} currentPrice={company?.current_price} tradingCurrency={(company as any)?.trading_currency || 'SEK'} />
                      </CardContent>
                    </Card>
                  )}

                  {sections.images && (
                    <ImageUpload
                      images={companyImages}
                      onImagesChange={(imgs) => updateCompany.mutate({ images: imgs })}
                      title="Bilder"
                      folder={`company/${id}`}
                    />
                  )}
                </>
              );
            })()}
          </TabsContent>

          {/* Financials Tab */}
          <TabsContent value="financials" className="space-y-6">
            {!hasIncomeData ? (
              <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground mb-4">No financial data yet. Import from Börsdata to get started.</p><FileImportDialog companyId={id!} onImportFinancials={handleImportFinancials} onImportInsiders={handleImportInsiders} /></CardContent></Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t.financials.incomeStatement}</CardTitle>
                  <CardDescription>{incomeData!.length} years ({incomeData![0].fiscal_year}–{incomeData![incomeData!.length - 1].fiscal_year})</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="fiscal_year" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                        <Bar dataKey="revenue" name={t.financials.revenue} fill="hsl(var(--primary))" />
                        <Bar dataKey="ebit" name={t.financials.ebit} fill="hsl(var(--success))" />
                        <Bar dataKey="net_income" name={t.financials.netIncome} fill="hsl(var(--warning))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.financials.fiscalYear}</TableHead>
                          <TableHead className="text-right">{t.financials.revenue}</TableHead>
                          <TableHead className="text-right">{t.financials.ebit}</TableHead>
                          <TableHead className="text-right">{t.financials.ebitda}</TableHead>
                          <TableHead className="text-right">{t.financials.netIncome}</TableHead>
                          <TableHead className="text-right">{t.financials.operatingMargin}</TableHead>
                          <TableHead className="text-right">{t.financials.netMargin}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {incomeData!.map((row) => (
                          <TableRow key={row.fiscal_year}>
                            <TableCell className="font-medium">{row.fiscal_year}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.revenue)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.ebit)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.ebitda)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.net_income)}</TableCell>
                            <TableCell className="text-right font-mono">{formatPercent(row.operating_margin)}</TableCell>
                            <TableCell className="text-right font-mono">{formatPercent(row.net_margin)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Financial Summary */}
            {hasIncomeData && (
              <AISummaryCard
                title="AI-sammanfattning"
                summary={localFinSummary}
                onGenerate={generateFinancialSummary}
                onSave={saveFinancialSummary}
                generating={generatingFinSummary}
                hasUnsavedChanges={!!localFinSummary && localFinSummary !== ((company as any)?.financial_summary || '')}
                emptyText="Klicka &quot;Generera&quot; för att få en AI-sammanfattning av den finansiella datan."
              />
            )}

            {/* AI Balance Sheet Summary */}
            {hasBalanceData && (
              <AISummaryCard
                title="AI-sammanfattning Balansräkning"
                summary={localBalanceSummary}
                onGenerate={generateBalanceSummary}
                onSave={saveBalanceSummary}
                generating={generatingBalanceSummary}
                hasUnsavedChanges={!!localBalanceSummary && localBalanceSummary !== ((company as any)?.balance_sheet_summary || '')}
                emptyText="Klicka &quot;Generera&quot; för att få en AI-sammanfattning av balansräkningen."
              />
            )}
          </TabsContent>

          {/* Balance Sheet Tab */}
          <TabsContent value="balance-sheet" className="space-y-6">
            {!hasBalanceData ? (
              <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground mb-4">No balance sheet data yet.</p><FileImportDialog companyId={id!} onImportFinancials={handleImportFinancials} onImportInsiders={handleImportInsiders} /></CardContent></Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t.financials.balanceSheet}</CardTitle>
                  <CardDescription>{balanceSheetData!.length} years</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={balanceSheetData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="fiscal_year" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                        <Line type="monotone" dataKey="total_assets" name={t.financials.totalAssets} stroke="hsl(var(--primary))" strokeWidth={2} />
                        <Line type="monotone" dataKey="shareholders_equity" name={t.financials.shareholdersEquity} stroke="hsl(var(--success))" strokeWidth={2} />
                        <Line type="monotone" dataKey="total_liabilities" name={t.financials.totalLiabilities} stroke="hsl(var(--destructive))" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.financials.fiscalYear}</TableHead>
                          <TableHead className="text-right">{t.financials.totalAssets}</TableHead>
                          <TableHead className="text-right">{t.financials.totalLiabilities}</TableHead>
                          <TableHead className="text-right">{t.financials.shareholdersEquity}</TableHead>
                          <TableHead className="text-right">{t.financials.cashEquivalents}</TableHead>
                          <TableHead className="text-right">{t.financials.equityRatio}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {balanceSheetData!.map((row) => (
                          <TableRow key={row.fiscal_year}>
                            <TableCell className="font-medium">{row.fiscal_year}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.total_assets)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.total_liabilities)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.shareholders_equity)}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.cash_equivalents)}</TableCell>
                            <TableCell className="text-right font-mono">{formatPercent(row.equity_ratio)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Insiders Tab */}
          <TabsContent value="insiders" className="space-y-6">
            {insiderTrades.length === 0 ? (
              <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground mb-4">No insider trades imported yet.</p><FileImportDialog companyId={id!} onImportFinancials={handleImportFinancials} onImportInsiders={handleImportInsiders} /></CardContent></Card>
            ) : (
              <>
                <InsiderTable trades={insiderTrades} />
                <AISummaryCard
                  title="AI-sammanfattning"
                  summary={localInsiderSummary}
                  onGenerate={generateInsiderSummary}
                  onSave={saveInsiderSummary}
                  generating={generatingInsiderSummary}
                  hasUnsavedChanges={!!localInsiderSummary && localInsiderSummary !== ((company as any)?.insider_summary || '')}
                  emptyText="Klicka &quot;Generera&quot; för att få en AI-sammanfattning av insynshandeln."
                />
              </>
            )}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-6">
            <Card>
              <CardHeader><CardTitle>{t.timeline.title}</CardTitle></CardHeader>
              <CardContent>
                {!timelineEvents?.length ? (
                  <p className="text-muted-foreground text-center py-8">{t.timeline.noEvents}</p>
                ) : (
                  <div className="relative space-y-4">
                    <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                    {timelineEvents.map((event) => (
                      <div key={event.id} className="relative pl-10">
                        <div className="absolute left-2 top-2 h-4 w-4 rounded-full border-2 border-primary bg-background" />
                        <Card>
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(event.event_date), { addSuffix: true, locale })}</span>
                              {event.rating && <RatingBadge rating={event.rating as 'buy' | 'hold' | 'sell'} size="sm" />}
                            </div>
                            {event.comment && <p className="text-sm">{event.comment}</p>}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t.analysis.title}</h2>
              <Button
                className="gap-2"
                disabled={creatingAnalysis}
                onClick={async () => {
                  if (!user) return;
                  setCreatingAnalysis(true);

                  // Fetch fresh stock price before creating analysis
                  let freshPrice = company.current_price ?? null;
                  if (company.ticker) {
                    try {
                      const { data: priceData } = await supabase.functions.invoke('fetch-stock-price', {
                        body: { ticker: company.ticker, exchange: 'stockholm' },
                      });
                      if (priceData?.price) {
                        freshPrice = priceData.price;
                        // Update company price too
                        await supabase.from('companies').update({ current_price: priceData.price }).eq('id', id);
                        queryClient.invalidateQueries({ queryKey: ['company', id] });
                      }
                    } catch { /* use existing price */ }
                  }

                  const { data, error } = await supabase
                    .from('analyses')
                    .insert({
                      company_id: id!,
                      user_id: user.id,
                      is_draft: true,
                      current_price: freshPrice,
                      shares_outstanding: company.shares_outstanding ?? null,
                    } as any)
                    .select()
                    .single();
                  if (error) { setCreatingAnalysis(false); toast.error('Failed to create analysis'); return; }

                  // Snapshot company-level financial data into this analysis
                  const newAnalysisId = data.id;
                  const { data: companyIncome } = await supabase.from('income_statement').select('*').eq('company_id', id!).is('analysis_id', null);
                  if (companyIncome && companyIncome.length > 0) {
                    const snapshotIncome = companyIncome.map((row: any) => {
                      const { id: _id, created_at: _ca, ...rest } = row;
                      return { ...rest, analysis_id: newAnalysisId };
                    });
                    await supabase.from('income_statement').insert(snapshotIncome as any);
                  }
                  const { data: companyBalance } = await supabase.from('balance_sheet').select('*').eq('company_id', id!).is('analysis_id', null);
                  if (companyBalance && companyBalance.length > 0) {
                    const snapshotBalance = companyBalance.map((row: any) => {
                      const { id: _id, created_at: _ca, ...rest } = row;
                      return { ...rest, analysis_id: newAnalysisId };
                    });
                    await supabase.from('balance_sheet').insert(snapshotBalance as any);
                  }

                  setCreatingAnalysis(false);
                  navigate(`/company/${id}/analysis/${data.id}`);
                }}
              >
                {creatingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Ny analys
              </Button>
            </div>
            {!allAnalyses?.length ? (
              <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground mb-4">Inga analyser ännu. Klicka på "Ny analys" ovan.</p></CardContent></Card>
            ) : (
              <div className="space-y-3">
                {allAnalyses.map((analysis) => (
                  <AnalysisListItem
                    key={analysis.id}
                    analysis={analysis}
                    companyId={id!}
                    locale={locale}
                    onDelete={async () => {
                      await supabase.from('income_statement').delete().eq('analysis_id', analysis.id);
                      await supabase.from('balance_sheet').delete().eq('analysis_id', analysis.id);
                      await supabase.from('analyses').delete().eq('id', analysis.id);
                      queryClient.invalidateQueries({ queryKey: ['all-analyses', id] });
                      toast.success('Analys borttagen');
                    }}
                    onRename={async (newName: string) => {
                      await supabase.from('analyses').update({ name: newName || null } as any).eq('id', analysis.id);
                      queryClient.invalidateQueries({ queryKey: ['all-analyses', id] });
                      toast.success('Namn uppdaterat');
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
