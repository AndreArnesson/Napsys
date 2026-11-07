import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StockCompanionsManager } from '@/components/companions/StockCompanionsManager';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';

export default function StockCompanions() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  if (loading) return <MainLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></MainLayout>;
  if (!user) return <Navigate to="/auth" replace />;

  return <MainLayout>
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t.companions.title}</h1>
      <StockCompanionsManager />
    </div>
  </MainLayout>;
}
