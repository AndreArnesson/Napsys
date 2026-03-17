import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = [
  'hsl(142, 71%, 45%)',  // emerald
  'hsl(217, 91%, 60%)',  // blue
  'hsl(38, 92%, 50%)',   // amber
  'hsl(280, 65%, 60%)',  // purple
  'hsl(346, 77%, 50%)',  // rose
  'hsl(172, 66%, 50%)',  // teal
  'hsl(25, 95%, 53%)',   // orange
  'hsl(199, 89%, 48%)',  // sky
  'hsl(326, 80%, 55%)',  // pink
  'hsl(47, 96%, 53%)',   // yellow
  'hsl(258, 62%, 59%)',  // violet
  'hsl(160, 60%, 45%)',  // green
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

function groupSmallEntries(
  data: { name: string; value: number }[],
  groupSmall: boolean,
  sv: boolean
): { name: string; value: number }[] {
  if (!groupSmall) return data;
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return data;

  const threshold = total * 0.01;
  const large: { name: string; value: number }[] = [];
  let otherValue = 0;

  for (const entry of data) {
    if (entry.value < threshold) {
      otherValue += entry.value;
    } else {
      large.push(entry);
    }
  }

  if (otherValue > 0) {
    large.push({ name: sv ? 'Övrigt' : 'Other', value: Math.round(otherValue * 100) / 100 });
  }

  return large.sort((a, b) => b.value - a.value);
}

const CustomTooltipContent = ({ active, payload, useValue, sv }: any) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const percent = entry.payload?.percent;

  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 shadow-xl">
      <p className="text-sm font-medium text-foreground mb-1">{entry.name}</p>
      <p className="text-xs text-muted-foreground">
        {useValue
          ? `${Number(entry.value).toLocaleString('sv-SE')} kr`
          : `${entry.value}%`}
      </p>
      {percent != null && (
        <p className="text-xs text-muted-foreground">
          {(percent * 100).toFixed(1)}% {sv ? 'av totalt' : 'of total'}
        </p>
      )}
    </div>
  );
};

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent, name,
}: any) => {
  if (percent < 0.04) return null;
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="hsl(var(--foreground))"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={500}
    >
      {name.length > 18 ? name.slice(0, 16) + '…' : name} {(percent * 100).toFixed(0)}%
    </text>
  );
};

const renderLegendContent = (props: any) => {
  const { payload } = props;
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2">
      {payload?.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-1.5 text-xs">
          <div
            className="h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export function PortfolioOverview({ portfolios }: { portfolios: Portfolio[] }) {
  const { language } = useLanguage();
  const sv = language === 'sv';
  const [groupSmall, setGroupSmall] = useState(true);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set(portfolios.map(p => p.id)));

  const togglePortfolio = (id: string) => {
    setIncludedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: portfolioHoldings, isLoading } = useQuery({
    queryKey: ['portfolio-overview-holdings', portfolios.map(p => p.id)],
    queryFn: async () => {
      const results: PortfolioWithHoldings[] = [];

      for (const portfolio of portfolios) {
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

  const useValue = portfolioHoldings.every(({ holdings }) =>
    holdings.every(h => h.weight_percent == null || h.weight_percent === 0)
  );

  const toChartValue = (h: Holding) => {
    if (useValue) return h.value_sek || 0;
    return h.weight_percent || 0;
  };

  // Aggregate only included portfolios
  const aggregatedMap = new Map<string, number>();
  portfolioHoldings
    .filter(({ portfolio }) => includedIds.has(portfolio.id))
    .forEach(({ holdings }) => {
      holdings.forEach(h => {
        const name = h.company_name || (sv ? 'Okänt' : 'Unknown');
        aggregatedMap.set(name, (aggregatedMap.get(name) || 0) + toChartValue(h));
      });
    });
  const rawAggregated = Array.from(aggregatedMap.entries())
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
  const aggregatedData = groupSmallEntries(rawAggregated, groupSmall, sv);

  const renderPieChart = (data: { name: string; value: number }[], size = 220, showLabels = true) => (
    <ResponsiveContainer width="100%" height={size + 60}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={size * 0.22}
          outerRadius={size * 0.38}
          paddingAngle={1.5}
          dataKey="value"
          nameKey="name"
          label={showLabels ? renderCustomLabel : false}
          labelLine={false}
          strokeWidth={1}
          stroke="hsl(var(--background))"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltipContent useValue={useValue} sv={sv} />} />
        {!showLabels && (
          <Legend content={renderLegendContent} />
        )}
      </PieChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-4">
      {/* Group toggle */}
      <div className="flex items-center gap-2 justify-end">
        <Switch
          id="group-small"
          checked={groupSmall}
          onCheckedChange={setGroupSmall}
        />
        <Label htmlFor="group-small" className="text-sm text-muted-foreground cursor-pointer">
          {sv ? 'Gruppera < 1% som Övrigt' : 'Group < 1% as Other'}
        </Label>
      </div>

      {/* Aggregated total */}
      {aggregatedData.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">
              {sv ? 'Totalt alla portföljer' : 'All Portfolios Combined'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {sv ? 'Baserat på senaste snapshot per portfölj' : 'Based on latest snapshot per portfolio'}
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            {renderPieChart(aggregatedData, 280, true)}
          </CardContent>
        </Card>
      )}

      {/* Per portfolio */}
      <div className="grid gap-4 md:grid-cols-2">
        {portfolioHoldings
          .filter(p => p.holdings.length > 0)
          .map(({ portfolio, holdings }) => {
            const rawData = holdings
              .map(h => ({
                name: h.company_name || (sv ? 'Okänt' : 'Unknown'),
                value: toChartValue(h),
              }))
              .sort((a, b) => b.value - a.value);
            const data = groupSmallEntries(rawData, groupSmall, sv);

            const total = data.reduce((s, d) => s + d.value, 0);

            return (
              <Card key={portfolio.id}>
                <CardHeader className="pb-0">
                  <CardTitle className="text-base">{portfolio.name}</CardTitle>
                  {useValue && (
                    <p className="text-xs text-muted-foreground">
                      {sv ? 'Totalt' : 'Total'}: {total.toLocaleString('sv-SE')} kr
                    </p>
                  )}
                </CardHeader>
                <CardContent className="pt-2">
                  {renderPieChart(data, 200, false)}
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
