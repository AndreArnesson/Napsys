import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { SnapshotEditor } from '@/components/portfolio/SnapshotEditor';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();

  const { data: portfolio, isLoading } = useQuery({
    queryKey: ['portfolio', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });

  if (!user) return <Navigate to="/auth" />;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!portfolio) {
    return (
      <MainLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Portfolio not found</p>
          <Link to="/portfolio" className="text-primary hover:underline">{t.common.back}</Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link
            to="/portfolio"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />{t.common.back}
          </Link>
          <h1 className="text-2xl font-bold">{portfolio.name}</h1>
        </div>
        <SnapshotEditor portfolioId={portfolio.id} portfolioName={portfolio.name} />
      </div>
    </MainLayout>
  );
}
