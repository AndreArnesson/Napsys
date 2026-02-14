import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Landmark } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DebtData {
  fiscal_year: number;
  long_term_debt?: number | null;
  short_term_debt?: number | null;
  cash_equivalents?: number | null;
  total_liabilities?: number | null;
  shareholders_equity?: number | null;
  equity_ratio?: number | null;
}

interface DebtSectionProps {
  data: DebtData[];
}

export function DebtSection({ data }: DebtSectionProps) {
  const { language } = useLanguage();

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />Skuld</CardTitle>
          <CardDescription>Importera balansräkning för att se skulddata</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">Ingen skulddata tillgänglig.</p>
        </CardContent>
      </Card>
    );
  }

  const formatNum = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', { maximumFractionDigits: 0 }).format(val);
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return `${(val * 100).toFixed(1)}%`;
  };

  const chartData = data.map(d => ({
    year: d.fiscal_year,
    'Långfristiga skulder': d.long_term_debt ?? 0,
    'Kortfristiga skulder': d.short_term_debt ?? 0,
    'Kassa': d.cash_equivalents ?? 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />Skuld</CardTitle>
        <CardDescription>{data.length} år av skulddata</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="year" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              <Legend />
              <Bar dataKey="Långfristiga skulder" fill="hsl(var(--destructive))" />
              <Bar dataKey="Kortfristiga skulder" fill="hsl(var(--warning))" />
              <Bar dataKey="Kassa" fill="hsl(var(--success))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>År</TableHead>
                <TableHead className="text-right">Långfristiga</TableHead>
                <TableHead className="text-right">Kortfristiga</TableHead>
                <TableHead className="text-right">Nettoskuld</TableHead>
                <TableHead className="text-right">Kassa</TableHead>
                <TableHead className="text-right">Eget kapital</TableHead>
                <TableHead className="text-right">Soliditet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data].sort((a, b) => b.fiscal_year - a.fiscal_year).map(row => {
                const netDebt = ((row.long_term_debt ?? 0) + (row.short_term_debt ?? 0)) - (row.cash_equivalents ?? 0);
                return (
                  <TableRow key={row.fiscal_year}>
                    <TableCell className="font-medium">{row.fiscal_year}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatNum(row.long_term_debt)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatNum(row.short_term_debt)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatNum(netDebt)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatNum(row.cash_equivalents)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatNum(row.shareholders_equity)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatPercent(row.equity_ratio)}</TableCell>
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
