import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, History, Trash2, Plus, ArrowUpDown, Save, Loader2, Bookmark, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';

const CATS = [
  { value: 'bank_account', sv: 'Bankkonto', en: 'Bank Account' },
  { value: 'savings', sv: 'Sparande', en: 'Savings' },
  { value: 'investment', sv: 'Investering', en: 'Investment' },
  { value: 'debt', sv: 'Skuld', en: 'Debt' },
];

interface SnapshotEntry {
  category: string;
  label: string;
  amount: number;
  notes?: string;
}

interface PortfolioHolding {
  company_name: string;
  ticker?: string | null;
  shares_count?: number | null;
  value_sek?: number | null;
  conviction?: string | null;
}

interface PortfolioSnapshot {
  portfolio_name: string;
  snapshot_id: string;
  holdings: PortfolioHolding[];
}

interface Snapshot {
  id: string;
  snapshot_date: string;
  entries: SnapshotEntry[];
  note: string | null;
  portfolio_data: PortfolioSnapshot[];
}

interface EditState {
  date: string;
  note: string;
  entries: SnapshotEntry[];
}

interface Props {
  currentEntries: Array<{ category: string; label: string; amount: number; notes?: string | null; entry_date: string }>;
}

function netWorth(entries: SnapshotEntry[]) {
  return entries.reduce((s, e) => s + (e.category === 'debt' ? -Number(e.amount) : Number(e.amount)), 0);
}

function formatNum(val: number) {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(val);
}

export function EconomySnapshotHistory({ currentEntries }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const sv = language === 'sv';

  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [openPortfolios, setOpenPortfolios] = useState<Set<string>>(new Set());
  const [editMap, setEditMap] = useState<Record<string, EditState>>({});
  const [sortAsc, setSortAsc] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const [snapshotDate, setSnapshotDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [snapshotNote, setSnapshotNote] = useState('');
  const [recordingSnapshot, setRecordingSnapshot] = useState(false);

  const { data: snapshots = [] } = useQuery<Snapshot[]>({
    queryKey: ['economy_snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('economy_snapshots')
        .select('id, snapshot_date, entries, note, portfolio_data')
        .order('snapshot_date', { ascending: true });
      if (error) throw error;
      return data as Snapshot[];
    },
    enabled: !!user,
  });

  const recordSnapshot = async () => {
    if (!snapshotDate) return;
    setRecordingSnapshot(true);
    try {
      const dates = currentEntries.map(e => e.entry_date).sort().reverse();
      const latestDate = dates[0];
      const prefilled: SnapshotEntry[] = currentEntries
        .filter(e => e.entry_date === latestDate)
        .map(e => ({ category: e.category, label: e.label, amount: Number(e.amount), notes: e.notes || undefined }));

      // Fetch latest portfolio snapshot per portfolio on or before snapshot date
      const { data: latestSnapshots } = await supabase
        .from('portfolio_snapshots')
        .select('id, snapshot_date, portfolio_id')
        .lte('snapshot_date', snapshotDate)
        .order('snapshot_date', { ascending: false });

      const latestByPortfolio = new Map<string, string>();
      for (const s of latestSnapshots || []) {
        if (!latestByPortfolio.has(s.portfolio_id)) {
          latestByPortfolio.set(s.portfolio_id, s.id);
        }
      }
      const snapshotIds = Array.from(latestByPortfolio.values());

      let portfolioData: PortfolioSnapshot[] = [];
      if (snapshotIds.length > 0) {
        const [{ data: holdings }, { data: portfolios }] = await Promise.all([
          supabase
            .from('portfolio_holdings')
            .select('snapshot_id, company_name, ticker, shares_count, value_sek, conviction')
            .in('snapshot_id', snapshotIds),
          supabase
            .from('portfolios')
            .select('id, name')
            .in('id', Array.from(latestByPortfolio.keys())),
        ]);

        portfolioData = (portfolios || []).map(p => ({
          portfolio_name: p.name,
          snapshot_id: latestByPortfolio.get(p.id)!,
          holdings: (holdings || [])
            .filter(h => h.snapshot_id === latestByPortfolio.get(p.id))
            .map(h => ({
              company_name: h.company_name,
              ticker: h.ticker,
              shares_count: h.shares_count,
              value_sek: h.value_sek,
              conviction: h.conviction,
            }))
            .sort((a, b) => (b.value_sek || 0) - (a.value_sek || 0)),
        }));
      }

      const { error } = await supabase
        .from('economy_snapshots')
        .upsert(
          { user_id: user!.id, snapshot_date: snapshotDate, entries: prefilled, note: snapshotNote || null, portfolio_data: portfolioData },
          { onConflict: 'user_id,snapshot_date' }
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['economy_snapshots'] });
      toast.success(sv ? 'Ögonblicksbild sparad' : 'Snapshot saved');
      setSnapshotNote('');
    } catch {
      toast.error(sv ? 'Kunde inte spara' : 'Failed to save snapshot');
    } finally {
      setRecordingSnapshot(false);
    }
  };

  const toggle = (snap: Snapshot) => {
    const id = snap.id;
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!editMap[id]) {
          setEditMap(em => ({
            ...em,
            [id]: { date: snap.snapshot_date, note: snap.note || '', entries: snap.entries.map(e => ({ ...e })) },
          }));
        }
      }
      return next;
    });
  };

  const setEdit = (id: string, patch: Partial<EditState>) => {
    setEditMap(em => ({ ...em, [id]: { ...em[id], ...patch } }));
  };

  const updateEntry = (id: string, idx: number, field: keyof SnapshotEntry, raw: string) => {
    setEditMap(em => {
      const state = em[id];
      if (!state) return em;
      const entries = state.entries.map((e, i) => {
        if (i !== idx) return e;
        if (field === 'amount') return { ...e, amount: parseFloat(raw) || 0 };
        return { ...e, [field]: raw };
      });
      return { ...em, [id]: { ...state, entries } };
    });
  };

  const addEntry = (id: string) => {
    setEditMap(em => {
      const state = em[id];
      if (!state) return em;
      return { ...em, [id]: { ...state, entries: [...state.entries, { category: 'bank_account', label: '', amount: 0 }] } };
    });
  };

  const removeEntry = (id: string, idx: number) => {
    setEditMap(em => {
      const state = em[id];
      if (!state) return em;
      return { ...em, [id]: { ...state, entries: state.entries.filter((_, i) => i !== idx) } };
    });
  };

  const saveSnapshot = async (id: string) => {
    const state = editMap[id];
    if (!state) return;
    setSaving(s => ({ ...s, [id]: true }));
    try {
      const { error } = await supabase
        .from('economy_snapshots')
        .update({ snapshot_date: state.date, note: state.note || null, entries: state.entries })
        .eq('id', id);
      if (error) throw error;
      setEditMap(em => { const { [id]: _, ...rest } = em; return rest; });
      queryClient.invalidateQueries({ queryKey: ['economy_snapshots'] });
      toast.success(sv ? 'Uppdaterad' : 'Updated');
    } catch {
      toast.error(sv ? 'Kunde inte spara' : 'Failed to update');
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const deleteSnapshot = async (id: string) => {
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      const { error } = await supabase.from('economy_snapshots').delete().eq('id', id);
      if (error) throw error;
      setOpenIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setEditMap(em => { const { [id]: _, ...rest } = em; return rest; });
      queryClient.invalidateQueries({ queryKey: ['economy_snapshots'] });
      toast.success(sv ? 'Borttagen' : 'Deleted');
    } catch {
      toast.error(sv ? 'Kunde inte ta bort' : 'Failed to delete');
    } finally {
      setDeleting(d => ({ ...d, [id]: false }));
    }
  };

  const togglePortfolio = (key: string) => {
    setOpenPortfolios(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const sorted = sortAsc ? [...snapshots] : [...snapshots].reverse();
  const chartData = snapshots.map(s => ({
    date: format(parseISO(s.snapshot_date), 'MMM yyyy'),
    nw: Math.round(netWorth(s.entries)),
  }));

  return (
    <div className="space-y-4 border-t pt-6 mt-2">
      <div className="flex items-center gap-2 font-semibold text-base">
        <History className="h-5 w-5" />
        {sv ? 'Historik & ögonblicksbilder' : 'History & Snapshots'}
      </div>

      {/* Record snapshot bar */}
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg border bg-muted/30">
        <Bookmark className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          type="date"
          value={snapshotDate}
          onChange={e => setSnapshotDate(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Input
          placeholder={sv ? 'Anteckning (valfri)' : 'Note (optional)'}
          value={snapshotNote}
          onChange={e => setSnapshotNote(e.target.value)}
          className="h-8 flex-1 min-w-[140px] max-w-[240px]"
        />
        <Button size="sm" variant="outline" onClick={recordSnapshot} disabled={recordingSnapshot || !snapshotDate} className="gap-1 shrink-0">
          {recordingSnapshot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
          {sv ? 'Spara ögonblicksbild' : 'Record snapshot'}
        </Button>
        <p className="text-xs text-muted-foreground w-full">
          {sv ? 'Sparar nuläget (senaste poster + portföljinnehav) som en fryst bild.' : 'Saves the current state (latest entries + portfolio holdings) as a frozen snapshot.'}
        </p>
      </div>

      {snapshots.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {sv ? 'Inga ögonblicksbilder ännu.' : 'No snapshots yet.'}
        </p>
      )}

      {/* Net worth chart */}
      {snapshots.length >= 2 && (
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${formatNum(v)}`} width={70} />
              <Tooltip formatter={(v: number) => [`${formatNum(v)} kr`, sv ? 'Nettovärde' : 'Net Worth']} />
              <Line type="monotone" dataKey="nw" stroke="hsl(var(--primary))" strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Snapshot list */}
      {snapshots.length > 0 && (
        <>
          <div className="flex items-center justify-end">
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setSortAsc(a => !a)}>
              <ArrowUpDown className="h-3 w-3" />
              {sortAsc ? (sv ? 'Äldst först' : 'Oldest first') : (sv ? 'Nyast först' : 'Newest first')}
            </Button>
          </div>

          <div className="space-y-1">
            {sorted.map(snap => {
              const isOpen = openIds.has(snap.id);
              const edit = editMap[snap.id];
              const displayDate = edit?.date ?? snap.snapshot_date;
              const displayNote = edit?.note ?? (snap.note || '');
              const displayEntries = edit?.entries ?? snap.entries;
              const nw = netWorth(displayEntries);
              const portfolios = snap.portfolio_data || [];

              return (
                <Collapsible key={snap.id} open={isOpen} onOpenChange={() => toggle(snap)}>
                  <div className="flex items-center gap-1">
                    <CollapsibleTrigger asChild>
                      <button className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 text-sm text-left">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-medium">{format(parseISO(displayDate), 'd MMM yyyy')}</span>
                        <span className={`font-mono text-xs ${nw >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatNum(nw)} kr</span>
                        {portfolios.length > 0 && (
                          <span className="text-muted-foreground text-xs flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {portfolios.length}
                          </span>
                        )}
                        {displayNote && <span className="text-muted-foreground truncate text-xs">— {displayNote}</span>}
                      </button>
                    </CollapsibleTrigger>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={e => { e.stopPropagation(); deleteSnapshot(snap.id); }} disabled={deleting[snap.id]}>
                      {deleting[snap.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  <CollapsibleContent>
                    <div className="ml-5 mt-1 mb-3 space-y-3">
                      {/* Date + note editors */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={edit?.date ?? snap.snapshot_date}
                          onChange={e => setEdit(snap.id, { date: e.target.value })}
                          className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <Input
                          placeholder={sv ? 'Anteckning' : 'Note'}
                          value={edit?.note ?? (snap.note || '')}
                          onChange={e => setEdit(snap.id, { note: e.target.value })}
                          className="h-8 flex-1 min-w-[140px] max-w-[240px]"
                        />
                      </div>

                      {/* Economy entries */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">{sv ? 'Ekonomiposter' : 'Economy entries'}</p>
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{sv ? 'Kategori' : 'Category'}</TableHead>
                                <TableHead>{sv ? 'Namn' : 'Name'}</TableHead>
                                <TableHead className="text-right">{sv ? 'Belopp' : 'Amount'}</TableHead>
                                <TableHead>{sv ? 'Not' : 'Notes'}</TableHead>
                                <TableHead className="w-8" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayEntries.map((e, i) => (
                                <TableRow key={i}>
                                  <TableCell className="py-1">
                                    <Select value={e.category} onValueChange={v => updateEntry(snap.id, i, 'category', v)}>
                                      <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {CATS.map(c => <SelectItem key={c.value} value={c.value}>{sv ? c.sv : c.en}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="py-1">
                                    <Input value={e.label} onChange={ev => updateEntry(snap.id, i, 'label', ev.target.value)} className="h-7" placeholder={sv ? 'Namn' : 'Name'} />
                                  </TableCell>
                                  <TableCell className="py-1">
                                    <Input type="number" value={e.amount || ''} onChange={ev => updateEntry(snap.id, i, 'amount', ev.target.value)} className="h-7 text-right font-mono w-28" />
                                  </TableCell>
                                  <TableCell className="py-1">
                                    <Input value={e.notes || ''} onChange={ev => updateEntry(snap.id, i, 'notes', ev.target.value)} className="h-7" placeholder="—" />
                                  </TableCell>
                                  <TableCell className="py-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEntry(snap.id, i)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addEntry(snap.id)}>
                            <Plus className="h-3 w-3" />{sv ? 'Lägg till rad' : 'Add row'}
                          </Button>
                          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => saveSnapshot(snap.id)} disabled={saving[snap.id]}>
                            {saving[snap.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            {sv ? 'Spara' : 'Save'}
                          </Button>
                        </div>
                      </div>

                      {/* Portfolio holdings */}
                      {portfolios.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {sv ? 'Portföljinnehav' : 'Portfolio holdings'}
                          </p>
                          <div className="space-y-1">
                            {portfolios.map((portfolio, pi) => {
                              const key = `${snap.id}-${pi}`;
                              const isPortfolioOpen = openPortfolios.has(key);
                              const totalValue = portfolio.holdings.reduce((s, h) => s + (h.value_sek || 0), 0);
                              return (
                                <Collapsible key={key} open={isPortfolioOpen} onOpenChange={() => togglePortfolio(key)}>
                                  <CollapsibleTrigger asChild>
                                    <button className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 text-xs text-left">
                                      {isPortfolioOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                                      <span className="font-medium flex-1">{portfolio.portfolio_name}</span>
                                      <span className="font-mono text-muted-foreground">{formatNum(totalValue)} kr</span>
                                      <span className="text-muted-foreground">{portfolio.holdings.length} {sv ? 'innehav' : 'holdings'}</span>
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="ml-4 mt-1 mb-2 rounded-md border overflow-hidden">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="py-1 text-xs">{sv ? 'Bolag' : 'Company'}</TableHead>
                                            <TableHead className="py-1 text-xs">Ticker</TableHead>
                                            <TableHead className="py-1 text-xs text-right">{sv ? 'Antal' : 'Shares'}</TableHead>
                                            <TableHead className="py-1 text-xs text-right">{sv ? 'Värde (kr)' : 'Value (SEK)'}</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {portfolio.holdings.map((h, hi) => (
                                            <TableRow key={hi}>
                                              <TableCell className="py-0.5 text-xs">{h.company_name}</TableCell>
                                              <TableCell className="py-0.5 text-xs font-mono text-muted-foreground">{h.ticker || '—'}</TableCell>
                                              <TableCell className="py-0.5 text-xs text-right font-mono">
                                                {h.shares_count != null ? h.shares_count.toLocaleString('sv-SE') : '—'}
                                              </TableCell>
                                              <TableCell className="py-0.5 text-xs text-right font-mono">
                                                {h.value_sek != null ? formatNum(h.value_sek) : '—'}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
