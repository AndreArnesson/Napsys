import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { CompanyCard } from '@/components/company/CompanyCard';
import { WatchlistSection } from '@/components/watchlist/WatchlistSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Building2, Loader2, Trash2, Pencil, ArrowUpDown, AlertTriangle, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type SortOption = 'latest_updated' | 'latest_analysis' | 'name_asc' | 'name_desc' | 'price_up' | 'price_down' | 'mos_high' | 'mos_low';
type TypeFilter = 'all' | 'stock' | 'investment_company' | 'fund' | 'etf';

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Alla' },
  { value: 'stock', label: 'Aktier' },
  { value: 'investment_company', label: 'Investmentbolag' },
  { value: 'fund', label: 'Fonder' },
  { value: 'etf', label: 'ETF' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyTicker, setNewCompanyTicker] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('latest_updated');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Fetch user's companies with their latest analysis
  const { data: companies, isLoading: companiesLoading, refetch: refetchCompanies } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          analyses (
            id,
            rating,
            margin_of_safety,
            updated_at,
            created_at,
            imported,
            current_price,
            projections
          )
        `)
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch companies shared with user
  const { data: sharedCompanies, isLoading: sharedLoading } = useQuery({
    queryKey: ['shared-companies', user?.id],
    queryFn: async () => {
      const { data: shares, error: sharesError } = await supabase
        .from('shares')
        .select('company_id')
        .eq('shared_with_user_id', user!.id);

      if (sharesError) throw sharesError;
      if (!shares?.length) return [];

      const companyIds = shares.map(s => s.company_id);
      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          analyses (
            id,
            rating,
            margin_of_safety,
            updated_at,
            created_at,
            imported,
            current_price,
            projections
          )
        `)
        .in('id', companyIds)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch unresolved price fetch errors
  const { data: priceErrors, refetch: refetchErrors } = useQuery({
    queryKey: ['price-fetch-errors', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_fetch_errors')
        .select('id, ticker, error_message, created_at, company_id')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const dismissError = async (errorId: string) => {
    await supabase.from('price_fetch_errors').update({ resolved: true } as any).eq('id', errorId);
    refetchErrors();
  };

  const dismissAllErrors = async () => {
    if (!priceErrors?.length) return;
    const ids = priceErrors.map(e => e.id);
    for (const id of ids) {
      await supabase.from('price_fetch_errors').update({ resolved: true } as any).eq('id', id);
    }
    refetchErrors();
    toast.success('Alla felnotiser markerade som lösta');
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error('Company name is required');
      return;
    }

    setCreating(true);
    const { data: newCompany, error } = await supabase
      .from('companies')
      .insert({
        name: newCompanyName.trim(),
        ticker: newCompanyTicker.trim() || null,
        user_id: user!.id,
      })
      .select()
      .single();
    setCreating(false);

    if (error) {
      toast.error('Failed to create company');
      console.error(error);
    } else {
      toast.success('Company created');
      setNewCompanyName('');
      setNewCompanyTicker('');
      setDialogOpen(false);
      refetchCompanies();

      // Auto-fetch stock price if ticker was provided
      if (newCompanyTicker.trim() && newCompany) {
        supabase.functions.invoke('fetch-stock-price', {
          body: { ticker: newCompanyTicker.trim(), exchange: 'stockholm' },
        }).then(({ data: priceData }) => {
          if (priceData?.price) {
            supabase.from('companies').update({ current_price: priceData.price }).eq('id', newCompany.id)
              .then(() => refetchCompanies());
          }
        }).catch(() => { /* silent fail for auto-fetch */ });
      }
    }
  };

  const getPriceChange = (company: any) => {
    const sorted = [...(company.analyses || [])].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latest = sorted[0];
    if (!latest?.current_price || !company.current_price) return undefined;
    return ((company.current_price - latest.current_price) / latest.current_price) * 100;
  };

  const getLatestAnalysisDate = (company: any) => {
    const sorted = [...(company.analyses || [])].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return sorted[0]?.created_at ? new Date(sorted[0].created_at).getTime() : 0;
  };

  const getLatestMOS = (company: any) => {
    const sorted = [...(company.analyses || [])].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return sorted[0]?.margin_of_safety ?? null;
  };

  const sortCompanies = (list: any[]) => {
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'latest_updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'latest_analysis':
          return getLatestAnalysisDate(b) - getLatestAnalysisDate(a);
        case 'name_asc':
          return a.name.localeCompare(b.name, 'sv');
        case 'name_desc':
          return b.name.localeCompare(a.name, 'sv');
        case 'price_up':
          return (getPriceChange(b) ?? -Infinity) - (getPriceChange(a) ?? -Infinity);
        case 'price_down':
          return (getPriceChange(a) ?? Infinity) - (getPriceChange(b) ?? Infinity);
        case 'mos_high':
          return (getLatestMOS(b) ?? -Infinity) - (getLatestMOS(a) ?? -Infinity);
        case 'mos_low':
          return (getLatestMOS(a) ?? Infinity) - (getLatestMOS(b) ?? Infinity);
        default:
          return 0;
      }
    });
  };

  const matchesFilters = (company: any) => {
    const matchesSearch =
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.ticker?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType =
      typeFilter === 'all' || (company.company_type || 'stock') === typeFilter;
    return matchesSearch && matchesType;
  };

  const filteredCompanies = sortCompanies(companies?.filter(matchesFilters) || []);
  const filteredShared = sortCompanies(sharedCompanies?.filter(matchesFilters) || []);

  const unfinishedAnalyses = useMemo(() => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const result: { companyId: string; companyName: string; analysisId: string; createdAt: string }[] = [];
    for (const company of companies || []) {
      for (const analysis of company.analyses || []) {
        if (!analysis.rating && new Date(analysis.created_at) >= oneMonthAgo) {
          result.push({ companyId: company.id, companyName: company.name, analysisId: analysis.id, createdAt: analysis.created_at });
        }
      }
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [companies]);


  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.dashboard.title}</h1>
            <p className="text-muted-foreground">
              {companies?.length || 0} {t.dashboard.myCompanies.toLowerCase()}
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t.dashboard.addCompany}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.dashboard.addCompany}</DialogTitle>
                <DialogDescription>
                  Add a new company to your investment arsenal
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Name *</Label>
                  <Input
                    id="company-name"
                    placeholder="e.g. Apple Inc."
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-ticker">{t.company.ticker}</Label>
                  <Input
                    id="company-ticker"
                    placeholder="e.g. AAPL"
                    value={newCompanyTicker}
                    onChange={(e) => setNewCompanyTicker(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button onClick={handleCreateCompany} disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t.common.add}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Sort */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t.dashboard.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-[220px] gap-2">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest_updated">Senaste redigerade</SelectItem>
                <SelectItem value="latest_analysis">Senaste analys</SelectItem>
                <SelectItem value="name_asc">Namn A–Ö</SelectItem>
                <SelectItem value="name_desc">Namn Ö–A</SelectItem>
                <SelectItem value="price_up">Högst kursökning</SelectItem>
                <SelectItem value="price_down">Störst kursnedgång</SelectItem>
                <SelectItem value="mos_high">Högst MOS</SelectItem>
                <SelectItem value="mos_low">Lägst MOS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={typeFilter === f.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter(f.value)}
                className="h-7 rounded-full px-3 text-xs"
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Unfinished Analyses */}
        {unfinishedAnalyses.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Oavslutade analyser
            </p>
            <div className="flex flex-wrap gap-2">
              {unfinishedAnalyses.map((item) => {
                const daysAgo = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86_400_000);
                return (
                  <Link
                    key={item.analysisId}
                    to={`/company/${item.companyId}/analysis/${item.analysisId}`}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-sm hover:bg-accent transition-colors"
                  >
                    {item.companyName}
                    <span className="text-xs text-muted-foreground">{daysAgo === 0 ? 'idag' : `${daysAgo}d`}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Price Fetch Error Notifications */}
        {priceErrors && priceErrors.length > 0 && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-destructive font-medium">
                <AlertTriangle className="h-4 w-4" />
                <span>Misslyckade kurshämtningar ({priceErrors.length})</span>
              </div>
              <Button variant="ghost" size="sm" onClick={dismissAllErrors} className="text-xs text-muted-foreground">
                Markera alla som lösta
              </Button>
            </div>
            <div className="space-y-1">
              {priceErrors.map((err) => (
                <div key={err.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-mono font-medium">{err.ticker}</span>
                    <span className="text-muted-foreground ml-2">{err.error_message}</span>
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismissError(err.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}


        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t.dashboard.myCompanies}</h2>
          {companiesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredCompanies.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground/50" />
                <CardTitle className="mt-4 text-lg">{t.dashboard.noCompanies}</CardTitle>
                <CardDescription className="mt-1">
                  {t.dashboard.noCompaniesDescription}
                </CardDescription>
                <Button className="mt-4 gap-2" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {t.dashboard.addCompany}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCompanies.map((company) => {
                const sortedAnalyses = [...(company.analyses || [])].sort(
                  (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
                const latestAnalysis = sortedAnalyses[0];
                const priceChangeSinceAnalysis = getPriceChange(company);
                return (
                  <div key={company.id} className="relative group">
                    {renamingId === company.id ? (
                      <Card className="animate-fade-in">
                        <CardContent className="py-4">
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!renameValue.trim()) return;
                            await supabase.from('companies').update({ name: renameValue.trim() }).eq('id', company.id);
                            queryClient.invalidateQueries({ queryKey: ['companies'] });
                            setRenamingId(null);
                            toast.success('Namn uppdaterat');
                          }} className="flex items-center gap-2">
                            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus className="flex-1" />
                            <Button type="submit" size="sm">OK</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setRenamingId(null)}>✕</Button>
                          </form>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        <CompanyCard
                          company={company}
                          analysis={latestAnalysis ? {
                            rating: latestAnalysis.rating as 'buy' | 'hold' | 'sell' | null,
                            margin_of_safety: latestAnalysis.margin_of_safety,
                            created_at: latestAnalysis.created_at,
                            projections: latestAnalysis.projections as any[],
                            analysis_price: latestAnalysis.current_price,
                          } : null}
                          priceChange={priceChangeSinceAnalysis}
                          onlyImported={company.analyses?.length > 0 && company.analyses.every((a: any) => a.imported)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-10 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground h-7 w-7 z-10"
                          onClick={(e) => { e.preventDefault(); setRenamingId(company.id); setRenameValue(company.name); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive h-7 w-7 z-10"
                               type="button"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Ta bort {company.name}?</AlertDialogTitle>
                              <AlertDialogDescription>Bolaget och alla dess analyser, finansiell data och insynshandel tas bort permanent.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Avbryt</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                                // Delete all related data before company
                                await supabase.from('report_documents').delete().eq('company_id', company.id);
                                await supabase.from('quarterly_income_statement').delete().eq('company_id', company.id);
                                await supabase.from('quarterly_balance_sheet').delete().eq('company_id', company.id);
                                await supabase.from('income_statement').delete().eq('company_id', company.id);
                                await supabase.from('balance_sheet').delete().eq('company_id', company.id);
                                await supabase.from('timeline_events').delete().eq('company_id', company.id);
                                await supabase.from('insider_trades').delete().eq('company_id', company.id);
                                await supabase.from('shares').delete().eq('company_id', company.id);
                                await supabase.from('watchlist').delete().eq('company_id', company.id);
                                await supabase.from('analyses').delete().eq('company_id', company.id);
                                await supabase.from('companies').delete().eq('id', company.id);
                                queryClient.invalidateQueries({ queryKey: ['companies'] });
                                toast.success(`${company.name} borttagen`);
                              }}>Ta bort</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Watchlist */}
        <WatchlistSection />

        {/* Shared With Me */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{t.dashboard.sharedWithMe}</h2>
          {sharedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredShared.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <CardTitle className="text-base text-muted-foreground">
                  {t.dashboard.noSharedCompanies}
                </CardTitle>
                <CardDescription className="mt-1 text-center text-sm">
                  {t.dashboard.noSharedCompaniesDescription}
                </CardDescription>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredShared.map((company) => {
                const sortedAnalyses = [...(company.analyses || [])].sort(
                  (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
                const latestAnalysis = sortedAnalyses[0];
                const priceChangeSinceAnalysis = getPriceChange(company);
                return (
                <CompanyCard
                  key={company.id}
                  company={company}
                  analysis={latestAnalysis ? {
                    rating: latestAnalysis.rating as 'buy' | 'hold' | 'sell' | null,
                    margin_of_safety: latestAnalysis.margin_of_safety,
                    created_at: latestAnalysis.created_at,
                    projections: latestAnalysis.projections as any[],
                    analysis_price: latestAnalysis.current_price,
                  } : null}
                  priceChange={priceChangeSinceAnalysis}
                  onlyImported={company.analyses?.length > 0 && company.analyses.every((a: any) => a.imported)}
                  isShared
                />
              )})}
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
