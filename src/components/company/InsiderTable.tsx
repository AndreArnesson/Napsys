import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, Search } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

export interface InsiderTrade {
  id?: string;
  date: string;
  person: string;
  position: string;
  type: 'Förvärv' | 'Avyttring' | 'acquisition' | 'disposal';
  volume: number;
  price: number;
  currency: string;
  instrument?: string;
  isin?: string;
  nature?: string;
}

interface InsiderTableProps {
  trades: InsiderTrade[];
}

export function InsiderTable({ trades }: InsiderTableProps) {
  const { language } = useLanguage();
  const [search, setSearch] = useState('');

  const filteredTrades = trades.filter(trade =>
    trade.person.toLowerCase().includes(search.toLowerCase()) ||
    trade.position.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (value: number, currency: string = 'SEK') => {
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US').format(value);
  };

  const isAcquisition = (type: string) => type === 'Förvärv' || type === 'acquisition';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Insider Trading</CardTitle>
            <CardDescription>{trades.length} transactions from FI</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredTrades.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No insider trades to display</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Karaktär</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTrades.map((trade, i) => (
                <TableRow key={trade.id || i}>
                  <TableCell className="font-mono text-sm">{trade.date}</TableCell>
                  <TableCell className="font-medium">{trade.person}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{trade.position}</TableCell>
                  <TableCell>
                    <Badge variant={isAcquisition(trade.type) ? 'default' : 'destructive'} className="gap-1">
                      {isAcquisition(trade.type) ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {isAcquisition(trade.type) ? 'Buy' : 'Sell'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{trade.nature || '—'}</TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(trade.volume)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(trade.price, trade.currency)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(trade.volume * trade.price, trade.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
