import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface FinancialDataPoint {
  period: string;
  year: number;
  quarter?: number;
  revenue?: number;
  ebit?: number;
  ebitda?: number;
  netIncome?: number;
  operatingMargin?: number;
  netMargin?: number;
}

interface FinancialDataPanelProps {
  yearlyData: FinancialDataPoint[];
  quarterlyData: FinancialDataPoint[];
  currency?: string;
}

export function FinancialDataPanel({ yearlyData, quarterlyData, currency = 'SEK' }: FinancialDataPanelProps) {
  const { t, language } = useLanguage();
  const [view, setView] = useState<'yearly' | 'quarterly'>('yearly');

  const data = view === 'yearly' ? yearlyData : quarterlyData;

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return '—';
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: 'compact',
    }).format(value * 1e6); // Assuming MSEK
  };

  const formatPercent = (value: number | undefined) => {
    if (value === undefined || value === null) return '—';
    return `${(value * 100).toFixed(1)}%`;
  };

  const calculateGrowth = (current: number | undefined, previous: number | undefined) => {
    if (!current || !previous) return null;
    return ((current - previous) / previous) * 100;
  };

  // Get last 5 years for display
  const displayData = data.slice(-12);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Historical Data
          </CardTitle>
          <Tabs value={view} onValueChange={(v) => setView(v as 'yearly' | 'quarterly')}>
            <TabsList className="h-8">
              <TabsTrigger value="yearly" className="text-xs px-2 h-6">
                {t.common.year}
              </TabsTrigger>
              <TabsTrigger value="quarterly" className="text-xs px-2 h-6">
                {t.common.quarter}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini chart */}
        <div className="h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="revenue" name={t.financials.revenue} fill="hsl(var(--primary))" />
              <Bar dataKey="ebit" name={t.financials.ebit} fill="hsl(var(--success))" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Data table */}
        <div className="max-h-[300px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 bg-background">Period</TableHead>
                <TableHead className="sticky top-0 bg-background text-right">{t.financials.revenue}</TableHead>
                <TableHead className="sticky top-0 bg-background text-right">{t.financials.ebit}</TableHead>
                <TableHead className="sticky top-0 bg-background text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((row, i) => {
                const prevRow = displayData[i - 1];
                const revenueGrowth = calculateGrowth(row.revenue, prevRow?.revenue);
                
                return (
                  <TableRow key={row.period}>
                    <TableCell className="font-medium">{row.period}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="font-mono text-sm">{formatCurrency(row.revenue)}</span>
                        {revenueGrowth !== null && (
                          <Badge variant={revenueGrowth >= 0 ? 'default' : 'destructive'} className="text-xs">
                            {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth.toFixed(0)}%
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(row.ebit)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPercent(row.operatingMargin)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
