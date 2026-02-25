import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Search } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

export interface InsiderTrade {
  id?: string;
  date: string;
  person: string;
  position: string;
  type: string;
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

const isAcquisition = (type: string) => type === 'Förvärv' || type === 'acquisition';
const isDisposal = (type: string) => type === 'Avyttring' || type === 'disposal';

const getDisplayType = (type: string) => {
  if (isAcquisition(type)) return 'Köp';
  if (isDisposal(type)) return 'Sälj';
  return type;
};

/** Merge trades with same date + person + type */
function mergeTrades(trades: InsiderTrade[]): InsiderTrade[] {
  const keyMap = new Map<string, InsiderTrade>();

  for (const t of trades) {
    const key = `${t.date}|${t.person}|${t.type}`;
    const existing = keyMap.get(key);
    if (existing) {
      const totalVolume = existing.volume + t.volume;
      // Weighted average price
      const totalValue = existing.volume * existing.price + t.volume * t.price;
      existing.volume = totalVolume;
      existing.price = totalVolume > 0 ? totalValue / totalVolume : 0;
    } else {
      keyMap.set(key, { ...t });
    }
  }

  return [...keyMap.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function InsiderTable({ trades }: InsiderTableProps) {
  const { language } = useLanguage();
  const [search, setSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  const mergedTrades = useMemo(() => mergeTrades(trades), [trades]);

  const uniquePersons = [...new Set(mergedTrades.map(t => t.person))].sort();
  const uniqueTypes = [...new Set(mergedTrades.map(t => t.type))].sort();

  const filteredTrades = mergedTrades.filter(trade => {
    const matchesSearch = trade.person.toLowerCase().includes(search.toLowerCase()) ||
      trade.position.toLowerCase().includes(search.toLowerCase());
    const matchesPerson = selectedPerson === 'all' || trade.person === selectedPerson;
    const matchesType = selectedType === 'all' || trade.type === selectedType;
    return matchesSearch && matchesPerson && matchesType;
  });

  const formatCurrency = (value: number, currency: string = 'SEK') => {
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US', {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US').format(value);
  };

  // Net buy/sell chart data — group by month, only Förvärv/Avyttring
  const netChartData = useMemo(() => {
    const monthMap = new Map<string, number>();

    for (const t of mergedTrades) {
      if (!isAcquisition(t.type) && !isDisposal(t.type)) continue;
      // Extract YYYY-MM
      const month = t.date.substring(0, 7);
      const value = t.volume * t.price;
      const signed = isAcquisition(t.type) ? value : -value;
      monthMap.set(month, (monthMap.get(month) || 0) + signed);
    }

    return [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, net]) => ({ month, net: Math.round(net) }));
  }, [mergedTrades]);

  return (
    <div className="space-y-4">
      {/* Net insider trading chart */}
      {netChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nettoköp / Nettosälj</CardTitle>
            <CardDescription>Månatlig nettosumma (Köp − Sälj)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={netChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => {
                      const [y, m] = v.split('-');
                      return `${m}/${y.slice(2)}`;
                    }}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => {
                      if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                      if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
                      return v;
                    }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Netto']}
                    labelFormatter={(label) => {
                      const [y, m] = label.split('-');
                      return `${m}/${y}`;
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Bar dataKey="net" radius={[3, 3, 0, 0]}>
                    {netChartData.map((entry, index) => (
                      <Cell 
                        key={index} 
                        fill={entry.net >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trades table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Insynshandel</CardTitle>
                <CardDescription>{filteredTrades.length} av {mergedTrades.length} transaktioner från FI</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök på namn..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Alla personer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla personer</SelectItem>
                  {uniquePersons.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Alla typer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla typer</SelectItem>
                  {uniqueTypes.map(t => (
                    <SelectItem key={t} value={t}>{getDisplayType(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTrades.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Inga insynsaffärer att visa</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Volym</TableHead>
                  <TableHead className="text-right">Pris</TableHead>
                  <TableHead className="text-right">Värde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrades.map((trade, i) => {
                  const acq = isAcquisition(trade.type);
                  const disp = isDisposal(trade.type);
                  return (
                    <TableRow key={trade.id || i}>
                      <TableCell className="font-mono text-sm">{trade.date}</TableCell>
                      <TableCell className="font-medium">{trade.person}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{trade.position}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          className={`gap-1 ${acq ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : disp ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : ''}`}
                        >
                          {acq && <TrendingUp className="h-3 w-3" />}
                          {disp && <TrendingDown className="h-3 w-3" />}
                          {getDisplayType(trade.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(trade.volume)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(trade.price, trade.currency)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(trade.volume * trade.price, trade.currency)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
