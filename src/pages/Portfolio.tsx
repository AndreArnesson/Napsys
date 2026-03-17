import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Briefcase, ChevronRight, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { SnapshotEditor } from '@/components/portfolio/SnapshotEditor';
import { PortfolioOverview } from '@/components/portfolio/PortfolioOverview';
import { EconomyOverview } from '@/components/economy/EconomyOverview';

export default function Portfolio() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedPortfolio, setSelectedPortfolio] = useState<{ id: string; name: string } | null>(null);
  const sv = language === 'sv';

  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createPortfolio = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('portfolios').insert({ name, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      setShowCreate(false);
      setNewName('');
    },
    onError: () => toast.error(t.common.error),
  });

  const deletePortfolio = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('portfolios').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      if (selectedPortfolio) setSelectedPortfolio(null);
    },
    onError: () => toast.error(t.common.error),
  });

  if (!user) return <Navigate to="/auth" />;

  if (selectedPortfolio) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedPortfolio(null)}>
              ← {t.common.back}
            </Button>
            <h1 className="text-2xl font-bold">{selectedPortfolio.name}</h1>
          </div>
          <SnapshotEditor portfolioId={selectedPortfolio.id} portfolioName={selectedPortfolio.name} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t.portfolio.title}</h1>

        <Tabs defaultValue="economy">
          <TabsList>
            <TabsTrigger value="economy">
              <Wallet className="h-4 w-4 mr-2" />
              {sv ? 'Ekonomisk översikt' : 'Economy Overview'}
            </TabsTrigger>
            <TabsTrigger value="portfolios">
              <Briefcase className="h-4 w-4 mr-2" />
              {sv ? 'Portföljer' : 'Portfolios'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="economy">
            <EconomyOverview />
          </TabsContent>

          <TabsContent value="portfolios">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{sv ? 'Portföljer' : 'Portfolios'}</h2>
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t.portfolio.createPortfolio}
                </Button>
              </div>

              {isLoading ? (
                <p className="text-muted-foreground">{t.common.loading}</p>
              ) : !portfolios?.length ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">{t.portfolio.noPortfolios}</p>
                    <p className="text-muted-foreground mb-4">{t.portfolio.noPortfoliosDescription}</p>
                    <Button onClick={() => setShowCreate(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t.portfolio.createPortfolio}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {portfolios.map((p) => (
                    <Card key={p.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setSelectedPortfolio({ id: p.id, name: p.name })}>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg">{p.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(t.common.confirm + '?')) deletePortfolio.mutate(p.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString('sv-SE')}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t.portfolio.createPortfolio}</DialogTitle>
                  </DialogHeader>
                  <Input
                    placeholder={t.portfolio.portfolioName}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createPortfolio.mutate(newName.trim())}
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreate(false)}>{t.common.cancel}</Button>
                    <Button onClick={() => newName.trim() && createPortfolio.mutate(newName.trim())} disabled={!newName.trim()}>
                      {t.common.save}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
