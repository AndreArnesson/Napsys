import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface InvestmentHolding {
  id: string;
  name: string;
  ticker?: string;
  weight_percent?: number;
  conviction?: 'high' | 'medium' | 'low';
  outlook?: string;
  moat?: string;
  profit_comment?: string;
  notes?: string;
  // Valuation fields
  is_listed?: boolean;
  market_cap?: number;
  pe_ratio?: number;
  ev_ebit?: number;
  nav_value?: number;
  valuation_comment?: string;
}

interface InvestmentHoldingsProps {
  holdings: InvestmentHolding[];
  onHoldingsChange: (holdings: InvestmentHolding[]) => void;
  readOnly?: boolean;
}

export function InvestmentHoldings({ holdings, onHoldingsChange, readOnly }: InvestmentHoldingsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addHolding = () => {
    const newHolding: InvestmentHolding = {
      id: crypto.randomUUID(),
      name: '',
      conviction: 'medium',
      is_listed: true,
    };
    onHoldingsChange([...holdings, newHolding]);
    setExpandedId(newHolding.id);
  };

  const updateHolding = (id: string, updates: Partial<InvestmentHolding>) => {
    onHoldingsChange(holdings.map(h => h.id === id ? { ...h, ...updates } : h));
  };

  const removeHolding = (id: string) => {
    onHoldingsChange(holdings.filter(h => h.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const totalWeight = holdings.reduce((sum, h) => sum + (h.weight_percent || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portföljinnehav</CardTitle>
        <CardDescription>
          Investmentbolagets innehav — {holdings.length} bolag
          {totalWeight > 0 && (
            <span className={`ml-2 font-mono ${Math.abs(totalWeight - 100) < 0.5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-warning'}`}>
              ({totalWeight.toFixed(1)}%)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {holdings.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Bolag</TableHead>
                  <TableHead className="w-[90px]">Ticker</TableHead>
                  <TableHead className="w-[70px] text-right">Andel %</TableHead>
                  <TableHead className="w-[80px]">Conviction</TableHead>
                  <TableHead className="w-[70px] text-center">Noterat</TableHead>
                  <TableHead>Framtidsutsikt</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding) => (
                  <TableRow
                    key={holding.id}
                    className="cursor-pointer"
                    onClick={() => setExpandedId(expandedId === holding.id ? null : holding.id)}
                  >
                    <TableCell>
                      <Input
                        value={holding.name}
                        onChange={(e) => updateHolding(holding.id, { name: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Bolagsnamn"
                        className="border-none shadow-none px-0 h-8 focus-visible:ring-0"
                        disabled={readOnly}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={holding.ticker || ''}
                        onChange={(e) => updateHolding(holding.id, { ticker: e.target.value.toUpperCase() })}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="—"
                        className="border-none shadow-none px-0 h-8 focus-visible:ring-0 font-mono text-xs"
                        disabled={readOnly}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={holding.weight_percent ?? ''}
                        onChange={(e) => updateHolding(holding.id, { weight_percent: e.target.value ? parseFloat(e.target.value) : undefined })}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="—"
                        className="border-none shadow-none px-0 h-8 focus-visible:ring-0 font-mono text-right text-xs w-16 ml-auto"
                        disabled={readOnly}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={holding.conviction || 'medium'}
                        onValueChange={(v) => updateHolding(holding.id, { conviction: v as any })}
                        disabled={readOnly}
                      >
                        <SelectTrigger className="border-none shadow-none h-8 px-0 focus:ring-0" onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high"><span className="text-emerald-600 dark:text-emerald-400">Hög</span></SelectItem>
                          <SelectItem value="medium"><span className="text-muted-foreground">Medel</span></SelectItem>
                          <SelectItem value="low"><span className="text-destructive">Låg</span></SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <span className={`text-xs font-medium ${holding.is_listed !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {holding.is_listed !== false ? 'Noterat' : 'Onoterat'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground line-clamp-1">
                        {holding.outlook || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeHolding(holding.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Expanded detail panel */}
        {expandedId && (() => {
          const h = holdings.find(h => h.id === expandedId);
          if (!h) return null;
          return (
            <Card className="border-primary/20 bg-muted/30">
              <CardContent className="pt-4 space-y-4">
                <p className="text-sm font-medium">{h.name || 'Nytt innehav'} — detaljer</p>

                {/* Listed / Unlisted toggle */}
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground">Noterat innehav</Label>
                  <Switch
                    checked={h.is_listed !== false}
                    onCheckedChange={(checked) => updateHolding(h.id, { is_listed: checked })}
                    disabled={readOnly}
                  />
                </div>

                {/* Valuation section */}
                <div className="rounded-md border bg-background p-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Värdering</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {h.is_listed !== false ? (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Börsvärde (Mdr)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={h.market_cap ?? ''}
                            onChange={(e) => updateHolding(h.id, { market_cap: e.target.value ? parseFloat(e.target.value) : undefined })}
                            placeholder="—"
                            className="h-8 font-mono text-xs"
                            disabled={readOnly}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">P/E</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={h.pe_ratio ?? ''}
                            onChange={(e) => updateHolding(h.id, { pe_ratio: e.target.value ? parseFloat(e.target.value) : undefined })}
                            placeholder="—"
                            className="h-8 font-mono text-xs"
                            disabled={readOnly}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">EV/EBIT</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={h.ev_ebit ?? ''}
                            onChange={(e) => updateHolding(h.id, { ev_ebit: e.target.value ? parseFloat(e.target.value) : undefined })}
                            placeholder="—"
                            className="h-8 font-mono text-xs"
                            disabled={readOnly}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs text-muted-foreground">Uppskattat värde (Mdr)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={h.nav_value ?? ''}
                          onChange={(e) => updateHolding(h.id, { nav_value: e.target.value ? parseFloat(e.target.value) : undefined })}
                          placeholder="—"
                          className="h-8 font-mono text-xs"
                          disabled={readOnly}
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Värderingskommentar</Label>
                    <Textarea
                      value={h.valuation_comment || ''}
                      onChange={(e) => updateHolding(h.id, { valuation_comment: e.target.value })}
                      placeholder="Kommentar om värdering, multiplar, jämförelser..."
                      rows={2}
                      disabled={readOnly}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Framtidsutsikt / Outlook</Label>
                    <Textarea
                      value={h.outlook || ''}
                      onChange={(e) => updateHolding(h.id, { outlook: e.target.value })}
                      placeholder="Vad tror du om bolagets framtid?"
                      rows={3}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">MOAT / Konkurrensfördelar</Label>
                    <Textarea
                      value={h.moat || ''}
                      onChange={(e) => updateHolding(h.id, { moat: e.target.value })}
                      placeholder="Vilka vallgravar har bolaget?"
                      rows={3}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Vinstkommentar</Label>
                    <Textarea
                      value={h.profit_comment || ''}
                      onChange={(e) => updateHolding(h.id, { profit_comment: e.target.value })}
                      placeholder="Kommentar om vinst, tillväxt, marginaler..."
                      rows={3}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Övrigt</Label>
                    <Textarea
                      value={h.notes || ''}
                      onChange={(e) => updateHolding(h.id, { notes: e.target.value })}
                      placeholder="Övriga anteckningar..."
                      rows={3}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addHolding} className="gap-1.5">
            <Plus className="h-4 w-4" />Lägg till innehav
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
