import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Plus, Trash2, Landmark, PiggyBank, CreditCard, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { EconomySnapshotHistory } from './EconomySnapshotHistory';

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
  const [newEntry, setNewEntry] = useState({ label: '', category: 'bank_account', amount: '', notes: '', entry_date: new Date().toISOString().split('T')[0] });

  const openAdd = (category = 'bank_account') => {
    setNewEntry({ label: '', category, amount: '', notes: '', entry_date: new Date().toISOString().split('T')[0] });
    setShowAdd(category);
  };

  const sv = language === 'sv';
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(CATEGORIES.map(c => c.value)));
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
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data;
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
      setNewEntry({ label: '', category: 'bank_account', amount: '', notes: '', entry_date: new Date().toISOString().split('T')[0] });
    },
    onError: () => toast.error(sv ? 'Kunde inte spara' : 'Could not save'),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('economy_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['economy_entries'] }),
  });

  // Get latest date's entries for overview
  const latestDate = entries.length > 0 ? entries[0].entry_date : null;
  const latestEntries = entries.filter(e => e.entry_date === latestDate);

  const totalAssets = latestEntries.filter(e => e.category !== 'debt').reduce((s, e) => s + Number(e.amount), 0);
  const totalDebt = latestEntries.filter(e => e.category === 'debt').reduce((s, e) => s + Number(e.amount), 0);
  const netWorth = totalAssets - totalDebt;

  const pieData = latestEntries
    .filter(e => e.category !== 'debt' && Number(e.amount) > 0)
    .map(e => ({ name: e.label, value: Number(e.amount) }));

  const categoryTotals = CATEGORIES.map(cat => {
    const total = latestEntries.filter(e => e.category === cat.value).reduce((s, e) => s + Number(e.amount), 0);
    return { name: sv ? cat.labelSv : cat.labelEn, value: total, color: cat.color };
  }).filter(c => c.value > 0);

  const formatNum = (val: number) => new Intl.NumberFormat(sv ? 'sv-SE' : 'en-US', { maximumFractionDigits: 0 }).format(val);
  const getCatLabel = (val: string) => {
    const cat = CATEGORIES.find(c => c.value === val);
    return cat ? (sv ? cat.labelSv : cat.labelEn) : val;
  };

  // Historical net worth by date
  const dateGroups = entries.reduce<Record<string, typeof entries>>((acc, e) => {
    if (!acc[e.entry_date]) acc[e.entry_date] = [];
    acc[e.entry_date].push(e);
    return acc;
  }, {});

  const historyData = Object.entries(dateGroups)
    .map(([date, items]) => {
      const assets = items.filter(e => e.category !== 'debt').reduce((s, e) => s + Number(e.amount), 0);
      const debts = items.filter(e => e.category === 'debt').reduce((s, e) => s + Number(e.amount), 0);
      return { date, [sv ? 'Tillgångar' : 'Assets']: assets, [sv ? 'Skulder' : 'Debts']: debts, [sv ? 'Nettovärde' : 'Net Worth']: assets - debts };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{sv ? 'Ekonomisk översikt' : 'Economy Overview'}</h2>
        <Button onClick={() => openAdd()}>
          <Plus className="h-4 w-4 mr-2" />
          {sv ? 'Lägg till post' : 'Add entry'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{sv ? 'Totala tillgångar' : 'Total Assets'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatNum(totalAssets)} kr</p>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{sv ? 'Nettovärde' : 'Net Worth'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${netWorth >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatNum(netWorth)} kr</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {latestEntries.length > 0 && (
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

      {/* Historical chart */}
      {historyData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{sv ? 'Utveckling över tid' : 'Trend Over Time'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Legend />
                  <Bar dataKey={sv ? 'Tillgångar' : 'Assets'} fill="hsl(var(--primary))" />
                  <Bar dataKey={sv ? 'Skulder' : 'Debts'} fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grouped entries by category */}
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
              const subtotal = catEntries.reduce((s, e) => s + Number(e.amount), 0);
              const Icon = cat.icon;
              const isOpen = openSections.has(cat.value);
              return (
                <Collapsible key={cat.value} open={isOpen} onOpenChange={() => toggleSection(cat.value)}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted/50 text-sm">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <Icon className="h-4 w-4 shrink-0" style={{ color: cat.color }} />
                      <span className="font-medium flex-1 text-left">{sv ? cat.labelSv : cat.labelEn}</span>
                      <span className={`font-mono text-xs ${cat.value === 'debt' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {cat.value === 'debt' && subtotal > 0 ? '−' : ''}{formatNum(subtotal)} kr
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
                                  {entry.category === 'debt' ? '−' : ''}{formatNum(Number(entry.amount))} kr
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

      {/* Snapshot history */}
      <EconomySnapshotHistory currentEntries={entries} />

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
              <Input type="number" placeholder="0" value={newEntry.amount} onChange={e => setNewEntry(p => ({ ...p, amount: e.target.value }))} />
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
