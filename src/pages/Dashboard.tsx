import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { CompanyCard } from '@/components/company/CompanyCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyTicker, setNewCompanyTicker] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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
            updated_at
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
            updated_at
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
    const { error } = await supabase
      .from('companies')
      .insert({
        name: newCompanyName.trim(),
        ticker: newCompanyTicker.trim() || null,
        user_id: user!.id,
      });
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
                const latestAnalysis = company.analyses?.[0];
                return (
                <CompanyCard
                  key={company.id}
                  company={company}
                  analysis={latestAnalysis ? {
                    rating: latestAnalysis.rating as 'buy' | 'hold' | 'sell' | null,
                    margin_of_safety: latestAnalysis.margin_of_safety,
                    updated_at: latestAnalysis.updated_at,
                  } : null}
                  priceChange={Math.random() * 10 - 5} // Mock price change for now
                />
              )})}
            </div>
          )}
        </section>

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
                    updated_at: latestAnalysis.updated_at,
                  } : null}
                  priceChange={Math.random() * 10 - 5}
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
