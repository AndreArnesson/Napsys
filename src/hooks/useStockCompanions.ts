import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type StockCompanion = Database['public']['Functions']['list_stock_companions']['Returns'][number];

export function useStockCompanions(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['stock-companions', user?.id],
    enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_stock_companions');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function refreshCompanionSharing(queryClient: QueryClient) {
  await Promise.all(['stock-companions', 'companion-analysis-sharing', 'shared-companies', 'company-shares']
    .map(key => queryClient.invalidateQueries({ queryKey: [key] })));
}
