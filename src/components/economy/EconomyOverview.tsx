import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Landmark, PiggyBank, CreditCard, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { EconomySnapshotHistory } from './EconomySnapshotHistory';
import { calculateEconomyTotals, calculatePortfolioValue, getLatestBalances, isSameUpdateDate } from './economyMath';

interface BalanceDraftRow {
  draftId: string;
  sourceEntryId?: string;
  category: string;
  label: string;
  amount: string;
  notes: string;
}

const CATEGORIES = [
  { value: 'bank_account', labelSv: 'Bankkonto', labelEn: 'Bank Account', icon: Building2, color: 'hsl(var(--primary))' },
  { value: 'savings', labelSv: 'Sparande', labelEn: 'Savings', icon: PiggyBank, color: 'hsl(var(--success))' },
  { value: 'debt', labelSv: 'Skuld', labelEn: 'Debt', icon: CreditCard, color: 'hsl(var(--destructive))' },
  { value: 'investment', labelSv: 'Investering', labelEn: 'Investment', icon: Landmark, color: 'hsl(var(--warning))' },
];

const PIE_COLORS = ['hsl(210, 70%, 50%)', 'hsl(150, 60%, 45%)', 'hsl(0, 70%, 55%)', 'hsl(40, 80%, 50%)', 'hsl(270, 50%, 55%)', 'hsl(180, 50%, 45%)'];

export function EconomyOverview() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState<string | false>(false);
  const [showBalanceUpdate, setShowBalanceUpdate] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState<BalanceDraftRow[]>([]);
  const [activeView, setActiveView] = useState('overview');
  const [newEntry, setNewEntry] = useState({ label: '', category: 'bank_account', amount: '', notes: '', entry_date: format(new Date(), 'yyyy-MM-dd') });
  const draftIdSequence = useRef(0);
  const nextDraftId = () => `balance-draft-${draftIdSequence.current++}`;
  const today = format(new Date(), 'yyyy-MM-dd');

  const openAdd = (category = 'bank_account') => {
    setNewEntry({ label: '', category, amount: '', notes: '', entry_date: format(new Date(), 'yyyy-MM-dd') });
    setShowAdd(category);
  };

  const sv = language === 'sv';
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (val: string) => setOpenSections(prev => {
    const next = new Set(prev);
    next.has(val) ? next.delete(val) : next.add(val);
    return next;
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['economy_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('economy_entries')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: portfolioValues = [], isLoading: portfoliosLoading } = useQuery({
    queryKey: ['economy_portfolio_values', user?.id],
    queryFn: async () => {
      const { data: portfolios, error: portfoliosError } = await supabase
        .from('portfolios')
        .select('id, name')
        .eq('user_id', user!.id);
      if (portfoliosError) throw portfoliosError;
      if (!portfolios?.length) return [];

      const { data: snapshots, error: snapshotsError } = await supabase
        .from('portfolio_snapshots')
        .select('id, portfolio_id, snapshot_date, created_at')
        .in('portfolio_id', portfolios.map(portfolio => portfolio.id))
        .lte('snapshot_date', format(new Date(), 'yyyy-MM-dd'))
        .order('snapshot_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (snapshotsError) throw snapshotsError;

      const latestByPortfolio = new Map<string, { id: string; snapshot_date: string }>();
      for (const snapshot of snapshots || []) {
        if (!latestByPortfolio.has(snapshot.portfolio_id)) {
          latestByPortfolio.set(snapshot.portfolio_id, snapshot);
        }
      }

      const latestSnapshots = Array.from(latestByPortfolio.values());
      if (!latestSnapshots.length) {
        return portfolios.map(portfolio => ({ ...portfolio, snapshotDate: null, holdings: [] as Array<{ value_sek: number | null }> }));
      }

      const { data: holdings, error: holdingsError } = await supabase
        .from('portfolio_holdings')
        .select('snapshot_id, value_sek')
        .in('snapshot_id', latestSnapshots.map(snapshot => snapshot.id));
      if (holdingsError) throw holdingsError;

      return portfolios.map(portfolio => {
        const snapshot = latestByPortfolio.get(portfolio.id);
        return {
          ...portfolio,
          snapshotDate: snapshot?.snapshot_date ?? null,
          holdings: (holdings || [])
            .filter(holding => holding.snapshot_id === snapshot?.id)
            .map(holding => ({ value_sek: holding.value_sek })),
        };
      });
    },
    enabled: !!user,
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('economy_entries').insert({
        user_id: user!.id,
        label: newEntry.label,
        category: newEntry.category,
        amount: parseFloat(newEntry.amount),
        notes: newEntry.notes || null,
        entry_date: newEntry.entry_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['economy_entries'] });
      setShowAdd(false);
      setActiveView('entries');
      setNewEntry({ label: '', category: 'bank_account', amount: '', notes: '', entry_date: format(new Date(), 'yyyy-MM-dd') });
    },
    onError: () => toast.error(sv ? 'Kunde inte spara' : 'Could not save'),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('economy_entries').delete().eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['economy_entries'] }),
  });

  const updateBalances = useMutation({
    mutationFn: async ({ date, rows }: { date: string; rows: BalanceDraftRow[] }) => {
      for (const row of rows) {
        const numericAmount = Number(row.amount.trim().replace(',', '.'));
        const amount = row.category === 'debt' ? -Math.abs(numericAmount) : numericAmount;
        const values = {
          user_id: user!.id,
          label: row.label.trim(),
          category: row.category,
          amount,
          notes: row.notes.trim() || null,
          entry_date: date,
        };

        if (row.sourceEntryId) {
          const { error } = await supabase
            .from('economy_entries')
            .update(values)
            .eq('id', row.sourceEntryId)
            .eq('user_id', user!.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('economy_entries').insert(values);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['economy_entries'] });
      setShowBalanceUpdate(false);
      setActiveView('entries');
      toast.success(sv ? 'Saldon uppdaterade' : 'Balances updated');
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['economy_entries'] });
      toast.error(sv ? 'Kunde inte uppdatera saldon' : 'Could not update balances');
    },
  });

  const startBalanceUpdate = () => {
    const latestBalances = getLatestBalances(entries, today);
    setBalanceDraft(latestBalances.length > 0
      ? latestBalances.map(entry => ({
        draftId: nextDraftId(),
        sourceEntryId: entry.id,
        category: entry.category,
        label: entry.label,
        amount: String(entry.category === 'debt' ? Math.abs(Number(entry.amount)) : Number(entry.amount)),
        notes: entry.notes || '',
      }))
      : [{ draftId: nextDraftId(), category: 'bank_account', label: '', amount: '', notes: '' }]);
    setShowBalanceUpdate(true);
  };

  const balanceDraftIsValid = balanceDraft.length > 0 && balanceDraft.every(row =>
    row.label.trim().length > 0 && row.amount.trim().length > 0 && Number.isFinite(Number(row.amount.trim().replace(',', '.'))),
  ) && new Set(balanceDraft.map(row => `${row.category}\u0000${row.label.trim().toLocaleLowerCase('sv-SE')}`)).size === balanceDraft.length;

  const saveBalanceUpdate = () => {
    if (!balanceDraftIsValid) {
      toast.error(sv ? 'Fyll i alla konton och belopp. Kontonamnen måste vara unika.' : 'Enter every account and amount. Account names must be unique.');
      return;
    }
    updateBalances.mutate({ date: today, rows: balanceDraft });
  };

  // Use the latest saved amount for every account, so an account stays visible even if another was updated later.
  const latestDate = entries.reduce<string | null>(
    (latest, entry) => entry.entry_date <= today && (!latest || entry.entry_date > latest) ? entry.entry_date : latest,
    null,
  );
  const latestEntries = getLatestBalances(entries, today);
  const oldestBalanceDate = latestEntries.reduce<string | null>(
    (oldest, entry) => !oldest || entry.entry_date < oldest ? entry.entry_date : oldest,
    null,
  );
  const economyUpdateDate = latestEntries.length > 0 && latestEntries.every(entry => entry.entry_date === latestEntries[0].entry_date)
    ? latestEntries[0].entry_date
    : null;

  const portfolioValue = calculatePortfolioValue(portfolioValues);
  const matchedPortfolioValues = portfolioValues.filter(portfolio => isSameUpdateDate(economyUpdateDate, portfolio.snapshotDate));
  const matchedPortfolioValue = calculatePortfolioValue(matchedPortfolioValues);
  const { totalAssets, totalDebt, netWorth } = calculateEconomyTotals(latestEntries, matchedPortfolioValue);
  const latestPortfolioDate = portfolioValues.reduce<string | null>(
    (latest, portfolio) => portfolio.snapshotDate && (!latest || portfolio.snapshotDate > latest) ? portfolio.snapshotDate : latest,
    null,
  );

  const pieData = latestEntries
    .filter(e => e.category !== 'debt' && Number(e.amount) > 0)
    .map(e => ({ name: e.label, value: Number(e.amount) }))
    .concat(matchedPortfolioValues.map(portfolio => ({
      name: portfolio.name,
      value: portfolio.holdings.reduce((sum, holding) => sum + Number(holding.value_sek ?? 0), 0),
    })).filter(portfolio => portfolio.value > 0));

  const categoryTotals = CATEGORIES.map(cat => {
    const total = latestEntries.filter(e => e.category === cat.value).reduce(
      (s, e) => s + (cat.value === 'debt' ? Math.abs(Number(e.amount)) : Number(e.amount)),
      0,
    );
    return { name: sv ? cat.labelSv : cat.labelEn, value: total, color: cat.color };
  }).filter(c => c.value > 0);
  if (matchedPortfolioValue > 0) {
    categoryTotals.push({ name: sv ? 'Portföljer (samma datum)' : 'Portfolios (same date)', value: matchedPortfolioValue, color: 'hsl(270, 50%, 55%)' });
  }

  const formatNum = (val: number) => new Intl.NumberFormat(sv ? 'sv-SE' : 'en-US', { maximumFractionDigits: 0 }).format(val);
  const getCatLabel = (val: string) => {
    const cat = CATEGORIES.find(c => c.value === val);
    return cat ? (sv ? cat.labelSv : cat.labelEn) : val;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{sv ? 'Min ekonomi' : 'My Economy'}</h2>
        <Button onClick={() => { setActiveView('entries'); startBalanceUpdate(); }} disabled={isLoading}>
          <Plus className="h-4 w-4 mr-2" />
          {sv ? 'Ny uppdatering' : 'New update'}
        </Button>
      </div>

      <Tabs value={activeView} onValueChange={setActiveView} className="space-y-5">
        <TabsList className="grid w-full grid-cols-3 md:w-[480px]">
          <TabsTrigger value="overview">{sv ? 'Översikt' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="entries">{sv ? 'Poster' : 'Entries'}</TabsTrigger>
          <TabsTrigger value="history">{sv ? 'Historik' : 'History'}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <div className="text-sm text-muted-foreground">
            {latestDate
              ? `${sv ? 'Senaste saldo per konto' : 'Latest balance per account'}: ${oldestBalanceDate && oldestBalanceDate !== latestDate ? `${oldestBalanceDate}–${latestDate}` : latestDate}`
              : (sv ? 'Lägg till dina tillgångar och skulder för att komma igång.' : 'Add your assets and debts to get started.')}
          </div>

          {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{sv ? 'Nettovärde' : 'Net Worth'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${netWorth >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatNum(netWorth)} kr</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {matchedPortfolioValues.length > 0
                ? (sv ? `inkl. ${matchedPortfolioValues.length} portföljer uppdaterade samma dag` : `including ${matchedPortfolioValues.length} portfolios updated the same day`)
                : (economyUpdateDate
                  ? (sv ? 'portföljer räknas bara med vid samma uppdateringsdatum' : 'portfolios count only when update dates match')
                  : (sv ? 'saldona har olika datum; inga portföljer räknas in' : 'balances have different dates; no portfolios are included'))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {matchedPortfolioValues.length > 0
                ? (sv ? 'Tillgångar inkl. portföljer samma dag' : 'Assets incl. same-day portfolios')
                : (sv ? 'Tillgångar på konton' : 'Assets in accounts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatNum(totalAssets)} kr</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{sv ? 'Portföljvärde' : 'Portfolio Value'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{portfoliosLoading ? '…' : `${formatNum(portfolioValue)} kr`}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {portfoliosLoading
                ? (sv ? 'Laddar portföljer…' : 'Loading portfolios…')
                : latestPortfolioDate
                  ? `${sv ? 'Senast sparat' : 'Latest saved'} ${latestPortfolioDate} · ${matchedPortfolioValues.length}/${portfolioValues.filter(portfolio => portfolio.snapshotDate).length} ${sv ? (economyUpdateDate ? `matchar saldodagen ${economyUpdateDate}` : 'kontosaldona har olika datum') : (economyUpdateDate ? `match the balance date ${economyUpdateDate}` : 'account balances have different dates')}`
                  : (sv ? 'Inga sparade portföljvärden' : 'No saved portfolio values')}
            </p>
            {!portfoliosLoading && portfolioValue > 0 && <p className="mt-1 text-xs text-muted-foreground">{sv ? 'Sparade värden, inte livekurser' : 'Saved values, not live prices'}</p>}
            {!portfoliosLoading && portfolioValue > 0 && <p className="mt-1 text-xs text-muted-foreground">{sv ? 'Endast portföljer med samma datum räknas in i nettovärdet' : 'Only portfolios with the same date count toward net worth'}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{sv ? 'Totala skulder' : 'Total Debt'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatNum(totalDebt)} kr</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {(latestEntries.length > 0 || matchedPortfolioValue > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {pieData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{sv ? 'Fördelning tillgångar' : 'Asset Distribution'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(val: number) => `${formatNum(val)} kr`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {categoryTotals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{sv ? 'Per kategori' : 'By Category'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryTotals}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip formatter={(val: number) => `${formatNum(val)} kr`} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="value" fill="hsl(var(--primary))">
                        {categoryTotals.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

        </TabsContent>

        <TabsContent value="entries" className="mt-0">
      <div className="mb-4 rounded-lg border bg-muted/30 p-4">
        <p className="font-medium">{sv ? 'Steg 1 · Registrera dina saldon' : 'Step 1 · Enter your balances'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {sv
            ? 'Klicka på ”Ny uppdatering” för att få dina senaste värden ifyllda. Ändra bara beloppen som har ändrats. Ange hela saldot hos varje bank eller mäklare; portföljerna visas separat och läggs inte till igen.'
            : 'Click “New update” to prefill your latest balances. Change only the amounts that have changed. Enter the full balance at each bank or broker; portfolios are shown separately and are not added again.'}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {sv ? 'Alla poster' : 'All Entries'}
            {latestDate && <span className="text-sm font-normal text-muted-foreground ml-2">({sv ? 'senaste:' : 'latest:'} {latestDate})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-muted-foreground">{sv ? 'Laddar...' : 'Loading...'}</p>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{sv ? 'Inga poster ännu. Lägg till dina konton, sparande och skulder.' : 'No entries yet. Add your accounts, savings and debts.'}</p>
          ) : (
            CATEGORIES.map(cat => {
              const catEntries = entries.filter(e => e.category === cat.value);
              const subtotal = latestEntries
                .filter(e => e.category === cat.value)
                .reduce((s, e) => s + (cat.value === 'debt' ? Math.abs(Number(e.amount)) : Number(e.amount)), 0);
              const Icon = cat.icon;
              const isOpen = openSections.has(cat.value);
              return (
                <Collapsible key={cat.value} open={isOpen} onOpenChange={() => toggleSection(cat.value)}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted/50 text-sm">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <Icon className="h-4 w-4 shrink-0" style={{ color: cat.color }} />
                      <span className="font-medium flex-1 text-left">{sv ? cat.labelSv : cat.labelEn}</span>
                      <span className={`font-mono text-xs ${cat.value === 'debt' ? 'text-destructive' : 'text-muted-foreground'}`} title={sv ? 'Senaste saldot per konto' : 'Latest balance per account'}>
                        {cat.value === 'debt' ? '−' : ''}{formatNum(subtotal)} kr
                      </span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 ml-1 shrink-0"
                        onClick={e => { e.stopPropagation(); openAdd(cat.value); }}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {catEntries.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-8 py-2">{sv ? 'Inga poster' : 'No entries'}</p>
                    ) : (
                      <div className="ml-6 mb-1 rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="py-1.5">{sv ? 'Datum' : 'Date'}</TableHead>
                              <TableHead className="py-1.5">{sv ? 'Namn' : 'Name'}</TableHead>
                              <TableHead className="text-right py-1.5">{sv ? 'Belopp' : 'Amount'}</TableHead>
                              <TableHead className="py-1.5">{sv ? 'Not' : 'Note'}</TableHead>
                              <TableHead className="w-8" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {catEntries.map(entry => (
                              <TableRow key={entry.id}>
                                <TableCell className="py-1.5 font-mono text-xs text-muted-foreground">{entry.entry_date}</TableCell>
                                <TableCell className="py-1.5 font-medium">{entry.label}</TableCell>
                                <TableCell className={`py-1.5 text-right font-mono text-sm ${entry.category === 'debt' ? 'text-destructive' : ''}`}>
                                  {entry.category === 'debt' ? '−' : ''}{formatNum(Math.abs(Number(entry.amount)))} kr
                                </TableCell>
                                <TableCell className="py-1.5 text-xs text-muted-foreground max-w-[160px] truncate">{entry.notes || '—'}</TableCell>
                                <TableCell className="py-1.5">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteEntry.mutate(entry.id)}>
                                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <EconomySnapshotHistory currentEntries={entries} onOpenEntries={() => setActiveView('entries')} />
        </TabsContent>
      </Tabs>

      {/* Update all current balances together */}
      <Dialog open={showBalanceUpdate} onOpenChange={open => !open && setShowBalanceUpdate(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{sv ? 'Uppdatera saldon' : 'Update balances'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
              {sv
                ? `Senaste värdet per konto är ifyllt. Ändra bara det som har ändrats och spara alla på en gång. Datum: ${today}.`
                : `The latest value for each account is prefilled. Change only what has changed and save everything at once. Date: ${today}.`}
            </div>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {balanceDraft.map(row => (
                <div key={row.draftId} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${row.draftId}-label`} className="text-xs">{sv ? 'Bank eller konto' : 'Bank or account'}</Label>
                    <Input
                      id={`${row.draftId}-label`}
                      placeholder={sv ? 'T.ex. Nordea lönekonto' : 'E.g. Nordea current account'}
                      value={row.label}
                      onChange={event => setBalanceDraft(rows => rows.map(item => item.draftId === row.draftId ? { ...item, label: event.target.value } : item))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${row.draftId}-category`} className="text-xs">{sv ? 'Typ' : 'Type'}</Label>
                    <Select value={row.category} onValueChange={value => setBalanceDraft(rows => rows.map(item => item.draftId === row.draftId ? { ...item, category: value } : item))}>
                      <SelectTrigger id={`${row.draftId}-category`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(category => <SelectItem key={category.value} value={category.value}>{sv ? category.labelSv : category.labelEn}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${row.draftId}-amount`} className="text-xs">{sv ? 'Belopp (kr)' : 'Amount (SEK)'}</Label>
                    <Input
                      id={`${row.draftId}-amount`}
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={row.amount}
                      onChange={event => setBalanceDraft(rows => rows.map(item => item.draftId === row.draftId ? { ...item, amount: event.target.value.replace(',', '.') } : item))}
                    />
                  </div>
                  {!row.sourceEntryId ? (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 justify-self-end text-muted-foreground" aria-label={sv ? 'Ta bort ny rad' : 'Remove new row'} onClick={() => setBalanceDraft(rows => rows.filter(item => item.draftId !== row.draftId))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : <span className="hidden w-9 sm:block" />}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setBalanceDraft(rows => [...rows, { draftId: nextDraftId(), category: 'bank_account', label: '', amount: '', notes: '' }])}>
              <Plus className="h-4 w-4" />{sv ? 'Lägg till bank eller konto' : 'Add bank or account'}
            </Button>
            <p className="text-xs text-muted-foreground">
              {sv
                ? 'Ange skulder som positiva belopp. Appen visar dem med minustecken. Portföljvärden visas separat och räknas inte en gång till i nettovärdet.'
                : 'Enter debts as positive amounts; the app displays them with a minus sign. Portfolio values are shown separately and are not added a second time to net worth.'}
            </p>
            {!balanceDraftIsValid && <p className="text-xs text-destructive">{sv ? 'Fyll i konto och belopp för varje rad. Kontonamnen måste vara unika.' : 'Enter an account and amount on every row. Account names must be unique.'}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBalanceUpdate(false)}>{sv ? 'Avbryt' : 'Cancel'}</Button>
            <Button onClick={saveBalanceUpdate} disabled={!balanceDraftIsValid || updateBalances.isPending}>
              {updateBalances.isPending ? (sv ? 'Sparar…' : 'Saving…') : (sv ? 'Spara saldon' : 'Save balances')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add entry dialog */}
      <Dialog open={!!showAdd} onOpenChange={v => !v && setShowAdd(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sv ? 'Lägg till ekonomipost' : 'Add Economy Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{sv ? 'Datum' : 'Date'}</Label>
              <Input type="date" value={newEntry.entry_date} onChange={e => setNewEntry(p => ({ ...p, entry_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{sv ? 'Kategori' : 'Category'}</Label>
              <Select value={newEntry.category} onValueChange={v => setNewEntry(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{sv ? c.labelSv : c.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{sv ? 'Namn' : 'Name'}</Label>
              <Input placeholder={sv ? 'T.ex. Nordea lönekonto' : 'E.g. Salary account'} value={newEntry.label} onChange={e => setNewEntry(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{sv ? 'Belopp (kr)' : 'Amount (SEK)'}</Label>
              <Input type="text" inputMode="decimal" placeholder="0" value={newEntry.amount} onChange={e => setNewEntry(p => ({ ...p, amount: e.target.value.replace(',', '.') }))} />
            </div>
            <div className="space-y-2">
              <Label>{sv ? 'Anteckning' : 'Note'}</Label>
              <Input placeholder={sv ? 'Valfri anteckning...' : 'Optional note...'} value={newEntry.notes} onChange={e => setNewEntry(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>{sv ? 'Avbryt' : 'Cancel'}</Button>
            <Button onClick={() => newEntry.label.trim() && newEntry.amount && addEntry.mutate()} disabled={!newEntry.label.trim() || !newEntry.amount}>
              {sv ? 'Spara' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
