import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(210, 70%, 50%)',
  'hsl(150, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(340, 65%, 50%)',
  'hsl(270, 55%, 55%)',
  'hsl(180, 50%, 45%)',
  'hsl(60, 70%, 45%)',
  'hsl(0, 60%, 50%)',
];

interface Portfolio {
  id: string;
  name: string;
}

interface Holding {
  company_name: string | null;
  weight_percent: number | null;
  value_sek: number | null;
}

interface PortfolioWithHoldings {
  portfolio: Portfolio;
  holdings: Holding[];
}

export function PortfolioOverview({ portfolios }: { portfolios: Portfolio[] }) {
  const { language } = useLanguage();
  const sv = language === 'sv';

  const { data: portfolioHoldings, isLoading } = useQuery({
    queryKey: ['portfolio-overview-holdings', portfolios.map(p => p.id)],
    queryFn: async () => {
      const results: PortfolioWithHoldings[] = [];

      for (const portfolio of portfolios) {
        // Get latest snapshot
        const { data: snapshot } = await supabase
          .from('portfolio_snapshots')
          .select('id')
          .eq('portfolio_id', portfolio.id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .single();

        if (!snapshot) {
          results.push({ portfolio, holdings: [] });
          continue;
        }

        const { data: holdings } = await supabase
          .from('portfolio_holdings')
          .select('company_name, weight_percent, value_sek')
          .eq('snapshot_id', snapshot.id);

        results.push({ portfolio, holdings: holdings || [] });
      }

      return results;
    },
    enabled: portfolios.length > 0,
  });

  if (isLoading || !portfolioHoldings) return null;

  const hasAnyHoldings = portfolioHoldings.some(p => p.holdings.length > 0);
  if (!hasAnyHoldings) return null;

  // Determine if we should use value_sek (when weight_percent is mostly null)
  const useValue = portfolioHoldings.every(({ holdings }) =>
    holdings.every(h => h.weight_percent == null || h.weight_percent === 0)
  );

  const toChartValue = (h: Holding) => {
    if (useValue) return h.value_sek || 0;
    return h.weight_percent || 0;
  };

  const valueLabel = useValue ? 'SEK' : '%';

  // Aggregate all holdings
  const aggregatedMap = new Map<string, number>();
  portfolioHoldings.forEach(({ holdings }) => {
    holdings.forEach(h => {
      const name = h.company_name || (sv ? 'Okänt' : 'Unknown');
      aggregatedMap.set(name, (aggregatedMap.get(name) || 0) + toChartValue(h));
    });
  });
  const aggregatedData = Array.from(aggregatedMap.entries())
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  const renderPieChart = (data: { name: string; value: number }[], size = 200) => (
    <ResponsiveContainer width="100%" height={size}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={size * 0.25}
          outerRadius={size * 0.4}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
          style={{ fontSize: '11px' }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [useValue ? `${value.toLocaleString()} kr` : `${value}%`, sv ? 'Vikt' : 'Weight']}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      {/* Aggregated total */}
      {aggregatedData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{sv ? 'Totalt alla portföljer' : 'All Portfolios Combined'}</CardTitle>
          </CardHeader>
          <CardContent>
            {renderPieChart(aggregatedData, 250)}
          </CardContent>
        </Card>
      )}

      {/* Per portfolio */}
      <div className="grid gap-4 md:grid-cols-2">
        {portfolioHoldings
          .filter(p => p.holdings.length > 0)
          .map(({ portfolio, holdings }) => {
            const data = holdings
              .map(h => ({
                name: h.company_name || (sv ? 'Okänt' : 'Unknown'),
                value: h.weight_percent || 0,
              }))
              .sort((a, b) => b.value - a.value);

            return (
              <Card key={portfolio.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{portfolio.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderPieChart(data, 200)}
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
