import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

export interface HistoricalYear {
  fiscal_year: number;
  revenue?: number;
  revenue_growth?: number;
  ebit?: number;
  ebitda?: number;
  net_income?: number;
  earnings_per_share?: number;
  operating_margin?: number;
  net_margin?: number;
  roe?: number;
}

interface HistoricalDataTableProps {
  data: HistoricalYear[];
  currency?: string;
  sharesOutstanding?: number;
  onRowClick?: (year: number) => void;
}

export function HistoricalDataTable({
  data,
  currency = 'SEK',
  sharesOutstanding,
  onRowClick,
}: HistoricalDataTableProps) {
  const { language } = useLanguage();

  const formatNumber = (value: number | undefined, decimals = 0) => {
    if (value === undefined || value === null) return '—';
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const formatPercent = (value: number | undefined) => {
    if (value === undefined || value === null) return '—';
    return `${value.toFixed(1)}%`;
  };

  const getGrowthBadge = (growth: number | undefined) => {
    if (growth === undefined || growth === null) return null;
    
    if (growth > 10) {
      return (
        <Badge variant="outline" className="text-success border-success/50 gap-1">
          <TrendingUp className="h-3 w-3" />
          {growth.toFixed(0)}%
        </Badge>
      );
    } else if (growth < -10) {
      return (
        <Badge variant="outline" className="text-destructive border-destructive/50 gap-1">
          <TrendingDown className="h-3 w-3" />
          {growth.toFixed(0)}%
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="text-muted-foreground gap-1">
          <Minus className="h-3 w-3" />
          {growth.toFixed(0)}%
        </Badge>
      );
    }
  };

  // Calculate growth rates
  const dataWithGrowth = data.map((row, index) => {
    const prevYear = data[index - 1];
    let revenueGrowth: number | undefined;
    
    if (prevYear && prevYear.revenue && row.revenue) {
      revenueGrowth = ((row.revenue - prevYear.revenue) / prevYear.revenue) * 100;
    }
    
    return {
      ...row,
      revenue_growth: row.revenue_growth ?? revenueGrowth,
    };
  });

  // Sort by year descending for display
  const sortedData = [...dataWithGrowth].sort((a, b) => b.fiscal_year - a.fiscal_year);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Historical Data
          </CardTitle>
          <CardDescription>Import financial data to see historical trends</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No historical data available. Import from Börsdata to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5" />
          Historisk Data
        </CardTitle>
        <CardDescription>
          {sortedData.length} år • {sortedData[sortedData.length - 1]?.fiscal_year} - {sortedData[0]?.fiscal_year}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">År</TableHead>
                <TableHead className="text-right">Omsättning</TableHead>
                <TableHead className="text-center">Tillväxt</TableHead>
                <TableHead className="text-right">EBIT</TableHead>
                <TableHead className="text-right">Nettores.</TableHead>
                <TableHead className="text-right">Vinst/aktie</TableHead>
                <TableHead className="text-right">Marginal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => (
                <TableRow 
                  key={row.fiscal_year}
                  className={cn(
                    onRowClick && 'cursor-pointer hover:bg-muted/50'
                  )}
                  onClick={() => onRowClick?.(row.fiscal_year)}
                >
                  <TableCell className="font-medium">{row.fiscal_year}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(row.revenue)}
                  </TableCell>
                  <TableCell className="text-center">
                    {getGrowthBadge(row.revenue_growth)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(row.ebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(row.net_income)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(row.earnings_per_share, 2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPercent(row.operating_margin || row.net_margin)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
