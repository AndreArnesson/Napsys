import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, History, Trash2, Plus, ArrowUpDown, Save, Loader2, Bookmark, Briefcase, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { calculateSnapshotNetWorth, getLatestBalances, isSameUpdateDate } from './economyMath';

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
  snapshot_date?: string;
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
  currentEntries: Array<{ id: string; category: string; label: string; amount: number; notes?: string | null; entry_date: string; created_at: string }>;
  onOpenEntries?: () => void;
}

function formatNum(val: number) {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(val);
}

export function EconomySnapshotHistory({ currentEntries, onOpenEntries }: Props) {
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

  const latestEntryDate = currentEntries.reduce<string | null>(
    (latest, entry) => entry.entry_date <= snapshotDate && (!latest || entry.entry_date > latest) ? entry.entry_date : latest,
    null,
  );
  const latestEntries = latestEntryDate
    ? currentEntries.filter(entry => entry.entry_date === latestEntryDate)
    : [];
  const latestBalancesForSnapshotDate = getLatestBalances(currentEntries, snapshotDate);
  const economyValuesMatchSnapshotDate = latestBalancesForSnapshotDate.length > 0
    && latestBalancesForSnapshotDate.every(entry => isSameUpdateDate(snapshotDate, entry.entry_date));

  const { data: snapshots = [] } = useQuery<Snapshot[]>({
    queryKey: ['economy_snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('economy_snapshots')
        .select('id, snapshot_date, entries, note, portfolio_data')
        .order('snapshot_date', { ascending: true });
      if (error) throw error;
      const savedSnapshots = data as Snapshot[];
      const portfolioSnapshotIds = Array.from(new Set(savedSnapshots.flatMap(snapshot =>
        (snapshot.portfolio_data || []).map(portfolio => portfolio.snapshot_id).filter(Boolean),
      )));
      if (!portfolioSnapshotIds.length) return savedSnapshots;

      const { data: portfolioSnapshots, error: portfolioSnapshotsError } = await supabase
        .from('portfolio_snapshots')
        .select('id, snapshot_date')
        .in('id', portfolioSnapshotIds);
      if (portfolioSnapshotsError) throw portfolioSnapshotsError;
      const portfolioDateById = new Map((portfolioSnapshots || []).map(snapshot => [snapshot.id, snapshot.snapshot_date]));

      return savedSnapshots.map(snapshot => ({
        ...snapshot,
        portfolio_data: (snapshot.portfolio_data || []).map(portfolio => ({
          ...portfolio,
          snapshot_date: portfolio.snapshot_date || portfolioDateById.get(portfolio.snapshot_id),
        })),
      }));
    },
    enabled: !!user,
  });
  const snapshotAlreadyExists = snapshots.some(snapshot => snapshot.snapshot_date === snapshotDate);

  const recordSnapshot = async () => {
    if (!snapshotDate) return;
    setRecordingSnapshot(true);
    try {
      const latestDate = currentEntries
        .filter(e => e.entry_date <= snapshotDate)
        .reduce<string | null>((latest, entry) => !latest || entry.entry_date > latest ? entry.entry_date : latest, null);
      const prefilled: SnapshotEntry[] = currentEntries
        .filter(e => e.entry_date === latestDate)
        .map(e => ({ category: e.category, label: e.label, amount: Number(e.amount), notes: e.notes || undefined }));

      // Link portfolio snapshots only when the economy balances themselves were updated on that date.
      const latestByPortfolio = new Map<string, { id: string; snapshot_date: string }>();
      const latestBalances = getLatestBalances(currentEntries, snapshotDate);
      const economyValuesMatchSnapshotDate = latestBalances.length > 0
        && latestBalances.every(entry => isSameUpdateDate(snapshotDate, entry.entry_date));
      if (economyValuesMatchSnapshotDate) {
        const { data: latestSnapshots, error: portfolioSnapshotsError } = await supabase
          .from('portfolio_snapshots')
          .select('id, snapshot_date, portfolio_id')
          .eq('snapshot_date', snapshotDate)
          .order('created_at', { ascending: false });
        if (portfolioSnapshotsError) throw portfolioSnapshotsError;

        for (const s of latestSnapshots || []) {
          if (!latestByPortfolio.has(s.portfolio_id)) {
            latestByPortfolio.set(s.portfolio_id, { id: s.id, snapshot_date: s.snapshot_date });
          }
        }
      }
      const snapshotIds = Array.from(latestByPortfolio.values()).map(snapshot => snapshot.id);

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
          snapshot_id: latestByPortfolio.get(p.id)!.id,
          snapshot_date: latestByPortfolio.get(p.id)!.snapshot_date,
          holdings: (holdings || [])
            .filter(h => h.snapshot_id === latestByPortfolio.get(p.id)?.id)
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
    nw: Math.round(calculateSnapshotNetWorth(
      s.entries,
      (s.portfolio_data || []).filter(portfolio => isSameUpdateDate(s.snapshot_date, portfolio.snapshot_date)),
    )),
  }));

  return (
    <div className="space-y-4 border-t pt-6 mt-2">
      <div className="flex items-center gap-2 font-semibold text-base">
        <History className="h-5 w-5" />
        {sv ? 'Sparade uppdateringar' : 'Saved updates'}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[260px]">
              <p className="font-semibold mb-1">{sv ? 'Hur fungerar det?' : 'How it works'}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {sv
                  ? 'En portfölj kopplas till ekonomibilden bara när båda har samma datum. Då räknas dess värde in i nettovärdet; annars visas den inte i den bilden.'
                  : 'A portfolio is linked to an economy snapshot only when both have the same date. Its value then counts toward net worth; otherwise it is not shown in that snapshot.'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Guided update flow */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="space-y-1">
          <p className="font-medium">{sv ? 'Steg 2 · Spara uppdateringen' : 'Step 2 · Save the update'}</p>
          <p className="text-sm text-muted-foreground">
            {sv
              ? 'Detta fryser saldona och portföljer som har uppdaterats på samma datum till historiken.'
              : 'This freezes the balances and portfolios updated on the same date into your history.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted-foreground" htmlFor="economy-snapshot-date">{sv ? 'Uppdateringsdatum' : 'Update date'}</label>
          <input
            id="economy-snapshot-date"
            type="date"
            value={snapshotDate}
            onChange={e => setSnapshotDate(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Input
            placeholder={sv ? 'Anteckning, t.ex. månadsskifte' : 'Note, e.g. month end'}
            value={snapshotNote}
            onChange={e => setSnapshotNote(e.target.value)}
            className="h-8 flex-1 min-w-[180px] max-w-[280px]"
          />
          <Button size="sm" onClick={recordSnapshot} disabled={recordingSnapshot || !snapshotDate} className="gap-1 shrink-0">
            {recordingSnapshot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
            {sv ? 'Spara uppdatering' : 'Save update'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {latestEntries.length > 0
              ? (sv
                ? `${latestEntries.length} ekonomiposter från ${latestEntryDate} kommer med.`
                : `${latestEntries.length} economy entries from ${latestEntryDate} will be included.`)
              : (sv ? 'Inga ekonomiposter ännu. Portföljvärden kan fortfarande sparas.' : 'No economy entries yet. Portfolio values can still be saved.')}
          </span>
          {onOpenEntries && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onOpenEntries}>
              {sv ? 'Steg 1: lägg till saldon' : 'Step 1: add balances'}
            </Button>
          )}
        </div>
        {latestEntries.length > 0 && !economyValuesMatchSnapshotDate && (
          <p className="text-xs text-muted-foreground">
            {sv
              ? 'Portföljer kopplas bara in när alla aktuella kontosaldon och portföljer är uppdaterade på det valda datumet.'
              : 'Portfolios are linked only when all current account balances and portfolio values were updated on the selected date.'}
          </p>
        )}
        {snapshotAlreadyExists && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {sv
              ? 'Det finns redan en sparad uppdatering för detta datum. Om du sparar igen ersätts den med de nya värdena.'
              : 'An update already exists for this date. Saving again replaces it with these values.'}
          </p>
        )}
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
              <RechartsTooltip formatter={(v: number) => [`${formatNum(v)} kr`, sv ? 'Nettovärde' : 'Net Worth']} />
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
              const savedPortfolios = snap.portfolio_data || [];
              const portfolios = savedPortfolios.filter(portfolio => isSameUpdateDate(displayDate, portfolio.snapshot_date));
              const unmatchedPortfolioCount = savedPortfolios.length - portfolios.length;
              const nw = calculateSnapshotNetWorth(displayEntries, portfolios);

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

                      {unmatchedPortfolioCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {sv
                            ? `${unmatchedPortfolioCount} portfölj${unmatchedPortfolioCount === 1 ? '' : 'er'} visas inte eftersom uppdateringsdatumet inte matchar ekonomibilden.`
                            : `${unmatchedPortfolioCount} portfolio${unmatchedPortfolioCount === 1 ? '' : 's'} not shown because the update date does not match this economy snapshot.`}
                        </p>
                      )}

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
                                    <Input type="text" inputMode="decimal" value={e.amount || ''} onChange={ev => updateEntry(snap.id, i, 'amount', ev.target.value.replace(',', '.'))} className="h-7 text-right font-mono w-28" />
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
