import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { CompanyCard } from '@/components/company/CompanyCard';
import { WatchlistSection } from '@/components/watchlist/WatchlistSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Building2, Loader2, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

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

  // Fetch user's companies with their latest analysis
  const { data: companies, isLoading: companiesLoading, refetch: refetchCompanies } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          analyses (
            rating,
            margin_of_safety,
            updated_at,
            created_at,
            imported,
            current_price
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
            rating,
            margin_of_safety,
            updated_at,
            created_at,
            imported
          )
        `)
        .in('id', companyIds)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

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

  // Filter companies based on search
  const filteredCompanies = companies?.filter(company =>
    company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    company.ticker?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredShared = sharedCompanies?.filter(company =>
    company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    company.ticker?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.dashboard.title}</h1>
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

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.dashboard.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* My Companies */}
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
                // Find the latest analysis (most recent by created_at)
                const sortedAnalyses = [...(company.analyses || [])].sort(
                  (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
                const latestAnalysis = sortedAnalyses[0];
                const analysisPriceAtCreation = latestAnalysis?.current_price;
                const currentPrice = company.current_price;
                const priceChangeSinceAnalysis = analysisPriceAtCreation && currentPrice
                  ? ((currentPrice - analysisPriceAtCreation) / analysisPriceAtCreation) * 100
                  : undefined;
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
                const latestAnalysis = company.analyses?.[0];
                return (
                <CompanyCard
                  key={company.id}
                  company={company}
                  analysis={latestAnalysis ? {
                    rating: latestAnalysis.rating as 'buy' | 'hold' | 'sell' | null,
                    margin_of_safety: latestAnalysis.margin_of_safety,
                    created_at: latestAnalysis.created_at,
                  } : null}
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
