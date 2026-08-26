import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { NumericInput } from '@/components/ui/numeric-input';
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical, ClipboardPaste, ArrowUpDown, Sparkles, Loader2 } from 'lucide-react';
import { InvestmentHoldingsImport } from './InvestmentHoldingsImport';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type HoldingCategory = 'company' | 'investment_company' | 'fund' | 'cash' | 'other';

const CATEGORY_LABELS: Record<HoldingCategory, string> = {
  company: 'Bolag',
  investment_company: 'Investmentbolag',
  fund: 'Fond / Investeringsfirma',
  cash: 'Kassa / Likvida medel',
  other: 'Övrigt',
};

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
  category?: HoldingCategory;
  is_listed?: boolean;
  market_cap?: number;
  pe_ratio?: number;
  ev_ebit?: number;
  nav_value?: number;
  valuation_comment?: string;
  description?: string;
}

type SortField = 'name' | 'category' | 'weight_percent' | 'conviction' | null;
type SortDir = 'asc' | 'desc';

interface InvestmentHoldingsProps {
  holdings: InvestmentHolding[];
  onHoldingsChange: (holdings: InvestmentHolding[]) => void;
  readOnly?: boolean;
  companyName?: string;
}

const CONVICTION_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function InvestmentHoldings({ holdings, onHoldingsChange, readOnly, companyName }: InvestmentHoldingsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [fetchingDescriptionId, setFetchingDescriptionId] = useState<string | null>(null);

  const handleImport = (imported: InvestmentHolding[]) => {
    onHoldingsChange([...holdings, ...imported]);
  };

  const addHolding = () => {
    const newHolding: InvestmentHolding = {
      id: crypto.randomUUID(),
      name: '',
      conviction: 'medium',
      is_listed: true,
      category: 'company',
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

  const moveHolding = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= holdings.length) return;
    const updated = [...holdings];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onHoldingsChange(updated);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(null); setSortDir('asc'); }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedHoldings = (() => {
    if (!sortField) return holdings;
    return [...holdings].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '', 'sv');
          break;
        case 'category':
          cmp = (CATEGORY_LABELS[a.category || 'company'] || '').localeCompare(CATEGORY_LABELS[b.category || 'company'] || '', 'sv');
          break;
        case 'weight_percent':
          cmp = (a.weight_percent || 0) - (b.weight_percent || 0);
          break;
        case 'conviction':
          cmp = (CONVICTION_ORDER[a.conviction || 'medium'] || 0) - (CONVICTION_ORDER[b.conviction || 'medium'] || 0);
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  })();

  const fetchDescription = async (holding: InvestmentHolding) => {
    if (!holding.name) {
      toast.error('Ange ett namn först');
      return;
    }
    setFetchingDescriptionId(holding.id);
    try {
      const { data, error } = await supabase.functions.invoke('describe-holding', {
        body: {
          holdingName: holding.name,
          ticker: holding.ticker,
          category: holding.category,
          parentCompanyName: companyName,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      updateHolding(holding.id, { description: data.description });
      toast.success('Beskrivning hämtad');
    } catch (e: any) {
      toast.error(e.message || 'Kunde inte hämta beskrivning');
    } finally {
      setFetchingDescriptionId(null);
    }
  };

  const totalWeight = holdings.reduce((sum, h) => sum + (h.weight_percent || 0), 0);
  const isCashOrOther = (h: InvestmentHolding) => h.category === 'cash' || h.category === 'other';

  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors text-left w-full"
        onClick={(e) => { e.stopPropagation(); toggleSort(field); }}
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 shrink-0 ${sortField === field ? 'text-primary' : 'text-muted-foreground/50'}`} />
      </button>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Portföljinnehav</CardTitle>
            <CardDescription>
              {companyName ? `${companyName} — ` : ''}Investmentbolagets innehav — {holdings.length} poster
              {totalWeight > 0 && (
                <span className={`ml-2 font-mono ${Math.abs(totalWeight - 100) < 0.5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-warning'}`}>
                  ({totalWeight.toFixed(1)}%)
                </span>
              )}
            </CardDescription>
          </div>
          {holdings.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => {
                const sorted = [...holdings].sort((a, b) => (b.weight_percent || 0) - (a.weight_percent || 0));
                onHoldingsChange(sorted);
              }}
            >
              <ArrowDown className="h-3 w-3" />Sortera på andel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {holdings.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {!readOnly && <TableHead className="w-[60px]" />}
                  <SortableHead field="name" className="w-[160px]">Namn</SortableHead>
                  <SortableHead field="category" className="w-[110px]">Kategori</SortableHead>
                  <TableHead className="w-[90px]">Noterat</TableHead>
                  <SortableHead field="weight_percent" className="w-[70px] text-right">Andel %</SortableHead>
                  <SortableHead field="conviction" className="w-[80px]">Conviction</SortableHead>
                  <TableHead>Framtidsutsikt</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedHoldings.map((holding, index) => (
                  <TableRow
                    key={holding.id}
                    className="cursor-pointer"
                    onClick={() => setExpandedId(holding.id)}
                  >
                    {!readOnly && (
                      <TableCell className="px-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" disabled={index === 0} onClick={() => moveHolding(index, 'up')}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" disabled={index === holdings.length - 1} onClick={() => moveHolding(index, 'down')}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <Input value={holding.name} onChange={(e) => updateHolding(holding.id, { name: e.target.value })} onClick={(e) => e.stopPropagation()} placeholder="Namn" className="border-none shadow-none px-0 h-8 focus-visible:ring-0" disabled={readOnly} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={holding.category || 'company'} onValueChange={(v) => updateHolding(holding.id, { category: v as HoldingCategory })} disabled={readOnly}>
                        <SelectTrigger className="border-none shadow-none h-8 px-0 focus:ring-0 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!isCashOrOther(holding) ? (
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => updateHolding(holding.id, { is_listed: !holding.is_listed })}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                            holding.is_listed !== false
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          } disabled:cursor-default disabled:pointer-events-none`}
                        >
                          {holding.is_listed !== false ? 'Noterat' : 'Onoterat'}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <NumericInput value={holding.weight_percent} onChange={(v) => updateHolding(holding.id, { weight_percent: v })} onClick={(e) => e.stopPropagation()} placeholder="—" className="border-none shadow-none px-0 h-8 focus-visible:ring-0 font-mono text-right text-xs w-16 ml-auto" disabled={readOnly} />
                    </TableCell>
                    <TableCell>
                      {!isCashOrOther(holding) ? (
                        <Select value={holding.conviction || 'medium'} onValueChange={(v) => updateHolding(holding.id, { conviction: v as any })} disabled={readOnly}>
                          <SelectTrigger className="border-none shadow-none h-8 px-0 focus:ring-0" onClick={(e) => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high"><span className="text-emerald-600 dark:text-emerald-400">Hög</span></SelectItem>
                            <SelectItem value="medium"><span className="text-muted-foreground">Medel</span></SelectItem>
                            <SelectItem value="low"><span className="text-destructive">Låg</span></SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground line-clamp-1">{holding.outlook || '—'}</span>
                    </TableCell>
                    <TableCell>
                      {!readOnly && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeHolding(holding.id); }}>
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

        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addHolding} className="gap-1.5">
              <Plus className="h-4 w-4" />Lägg till post
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" />Importera med AI
            </Button>
          </div>
        )}

        <InvestmentHoldingsImport open={importOpen} onOpenChange={setImportOpen} onImport={handleImport} />
      </CardContent>

      {/* Detail drawer — slides in from the right, table stays visible */}
      <Sheet open={!!expandedId} onOpenChange={(o) => { if (!o) setExpandedId(null); }}>
        <SheetContent side="right" className="w-full sm:w-[480px] overflow-y-auto">
          {(() => {
            const h = holdings.find(h => h.id === expandedId);
            if (!h) return null;
            const showValuation = !isCashOrOther(h);
            return (
              <>
                <SheetHeader className="mb-4">
                  <SheetTitle>{h.name || 'Ny post'}</SheetTitle>
                  <p className="text-sm text-muted-foreground">
                    {CATEGORY_LABELS[h.category || 'company']}
                    {companyName && ` — via ${companyName}`}
                  </p>
                </SheetHeader>

                <div className="space-y-5">
                  {/* Description */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Beskrivning</Label>
                      {!readOnly && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                          onClick={() => fetchDescription(h)} disabled={fetchingDescriptionId === h.id || !h.name}>
                          {fetchingDescriptionId === h.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Hämta med AI
                        </Button>
                      )}
                    </div>
                    <Textarea value={h.description || ''} onChange={(e) => updateHolding(h.id, { description: e.target.value })}
                      placeholder="Kort beskrivning av innehavet..." rows={3} disabled={readOnly} />
                  </div>

                  {showValuation && (
                    <>
                      <div className="flex items-center gap-3">
                        <Label className="text-xs text-muted-foreground">Noterat innehav</Label>
                        <Switch checked={h.is_listed !== false} onCheckedChange={(checked) => updateHolding(h.id, { is_listed: checked })} disabled={readOnly} />
                      </div>

                      <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Värdering</p>
                        <div className="grid gap-3 grid-cols-3">
                          {h.is_listed !== false ? (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Börsvärde (Mdr)</Label>
                                <NumericInput value={h.market_cap} onChange={(v) => updateHolding(h.id, { market_cap: v })} placeholder="—" className="h-8 font-mono text-xs" disabled={readOnly} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">P/E</Label>
                                <NumericInput value={h.pe_ratio} onChange={(v) => updateHolding(h.id, { pe_ratio: v })} placeholder="—" className="h-8 font-mono text-xs" disabled={readOnly} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">EV/EBIT</Label>
                                <NumericInput value={h.ev_ebit} onChange={(v) => updateHolding(h.id, { ev_ebit: v })} placeholder="—" className="h-8 font-mono text-xs" disabled={readOnly} />
                              </div>
                            </>
                          ) : (
                            <div className="space-y-1 col-span-2">
                              <Label className="text-xs text-muted-foreground">Uppskattat värde (Mdr)</Label>
                              <NumericInput value={h.nav_value} onChange={(v) => updateHolding(h.id, { nav_value: v })} placeholder="—" className="h-8 font-mono text-xs" disabled={readOnly} />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Värderingskommentar</Label>
                          <Textarea value={h.valuation_comment || ''} onChange={(e) => updateHolding(h.id, { valuation_comment: e.target.value })} placeholder="Kommentar om värdering, multiplar, jämförelser..." rows={2} disabled={readOnly} />
                        </div>
                      </div>

                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Framtidsutsikt / Outlook</Label>
                          <Textarea value={h.outlook || ''} onChange={(e) => updateHolding(h.id, { outlook: e.target.value })} placeholder="Vad tror du om bolagets framtid?" rows={4} disabled={readOnly} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">MOAT / Konkurrensfördelar</Label>
                          <Textarea value={h.moat || ''} onChange={(e) => updateHolding(h.id, { moat: e.target.value })} placeholder="Vilka vallgravar har bolaget?" rows={4} disabled={readOnly} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Vinstkommentar</Label>
                          <Textarea value={h.profit_comment || ''} onChange={(e) => updateHolding(h.id, { profit_comment: e.target.value })} placeholder="Kommentar om vinst, tillväxt, marginaler..." rows={4} disabled={readOnly} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Övrigt</Label>
                          <Textarea value={h.notes || ''} onChange={(e) => updateHolding(h.id, { notes: e.target.value })} placeholder="Övriga anteckningar..." rows={4} disabled={readOnly} />
                        </div>
                      </div>
                    </>
                  )}

                  {isCashOrOther(h) && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Anteckningar</Label>
                      <Textarea value={h.notes || ''} onChange={(e) => updateHolding(h.id, { notes: e.target.value })} placeholder="Beskriv posten..." rows={4} disabled={readOnly} />
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
