import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit2, Star, TrendingUp, Bot, Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

interface WatchlistItem {
  id: string;
  ticker: string;
  company_name: string | null;
  company_id: string | null;
  conviction: string | null;
  notes: string | null;
  buy_more: boolean;
  ai_impact: string | null;
}

type WatchlistColumnKey = 'ticker' | 'company_name' | 'conviction' | 'buy_more' | 'ai_impact' | 'notes';

const ALL_WATCHLIST_COLUMNS: { key: WatchlistColumnKey; label: string }[] = [
  { key: 'ticker', label: 'Ticker' },
  { key: 'company_name', label: 'Bolag' },
  { key: 'conviction', label: 'Övertygelse' },
  { key: 'buy_more', label: 'Köpa mer?' },
  { key: 'ai_impact', label: 'AI-påverkan' },
  { key: 'notes', label: 'Anteckningar' },
];

const DEFAULT_WATCHLIST_COLUMNS: WatchlistColumnKey[] = ['ticker', 'company_name', 'conviction', 'buy_more', 'ai_impact', 'notes'];

const convictionColors: Record<string, string> = {
  high: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  low: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
};

export function WatchlistSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null);
  const [form, setForm] = useState({ ticker: '', company_name: '', conviction: '', notes: '', buy_more: false, ai_impact: '' });
  const [visibleColumns, setVisibleColumns] = useState<WatchlistColumnKey[]>(DEFAULT_WATCHLIST_COLUMNS);

  const toggleColumn = (key: WatchlistColumnKey) => {
    setVisibleColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const isVisible = (key: WatchlistColumnKey) => visibleColumns.includes(key);

  const { data: watchlist, isLoading } = useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as WatchlistItem[];
    },
    enabled: !!user,
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (editingItem) {
        const { error } = await supabase.from('watchlist').update({
          ticker: form.ticker,
          company_name: form.company_name || null,
          conviction: form.conviction || null,
          notes: form.notes || null,
          buy_more: form.buy_more,
          ai_impact: form.ai_impact || null,
        } as any).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('watchlist').insert({
          ticker: form.ticker,
          company_name: form.company_name || null,
          conviction: form.conviction || null,
          notes: form.notes || null,
          buy_more: form.buy_more,
          ai_impact: form.ai_impact || null,
          user_id: user!.id,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      setDialogOpen(false);
      setEditingItem(null);
      setForm({ ticker: '', company_name: '', conviction: '', notes: '', buy_more: false, ai_impact: '' });
      toast.success(editingItem ? 'Updated' : 'Added to watchlist');
    },
    onError: () => toast.error('Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('watchlist').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Removed from watchlist');
    },
  });

  const openEdit = (item: WatchlistItem) => {
    setEditingItem(item);
    setForm({
      ticker: item.ticker,
      company_name: item.company_name || '',
      conviction: item.conviction || '',
      notes: item.notes || '',
      buy_more: item.buy_more,
      ai_impact: item.ai_impact || '',
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingItem(null);
    setForm({ ticker: '', company_name: '', conviction: '', notes: '', buy_more: false, ai_impact: '' });
    setDialogOpen(true);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Bevakningslista</h2>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1"><Settings2 className="h-3.5 w-3.5" />Kolumner</Button>
            </PopoverTrigger>
            <PopoverContent className="w-48" align="end">
              <div className="space-y-1">
                {ALL_WATCHLIST_COLUMNS.map(col => (
                  <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer">
                    <Checkbox checked={isVisible(col.key)} onCheckedChange={() => toggleColumn(col.key)} />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingItem(null); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Lägg till
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingItem ? 'Redigera' : 'Lägg till aktie'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Ticker *</Label>
                    <Input placeholder="AAPL" value={form.ticker} onChange={(e) => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bolagsnamn</Label>
                    <Input placeholder="Apple Inc." value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Övertygelse</Label>
                  <Select value={form.conviction} onValueChange={(v) => setForm(f => ({ ...f, conviction: v }))}>
                    <SelectTrigger><SelectValue placeholder="Välj nivå" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Hög</SelectItem>
                      <SelectItem value="medium">Medel</SelectItem>
                      <SelectItem value="low">Låg</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="buy-more" checked={form.buy_more} onChange={(e) => setForm(f => ({ ...f, buy_more: e.target.checked }))} className="rounded border-input" />
                  <Label htmlFor="buy-more" className="text-sm">Vill köpa mer kommande veckor</Label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Bot className="h-3 w-3" /> AI-påverkan</Label>
                  <Input placeholder="Hur påverkas bolaget av AI?" value={form.ai_impact} onChange={(e) => setForm(f => ({ ...f, ai_impact: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Anteckningar</Label>
                  <Textarea placeholder="Egna tankar..." value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="min-h-[80px]" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
                <Button onClick={() => upsertMutation.mutate()} disabled={!form.ticker || upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingItem ? 'Spara' : 'Lägg till'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !watchlist?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Star className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground text-sm">Ingen aktie i bevakningslistan ännu</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={openNew}>
              <Plus className="h-4 w-4" /> Lägg till
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isVisible('ticker') && <TableHead>Ticker</TableHead>}
                    {isVisible('company_name') && <TableHead>Bolag</TableHead>}
                    {isVisible('conviction') && <TableHead>Övertygelse</TableHead>}
                    {isVisible('buy_more') && <TableHead>Köpa mer?</TableHead>}
                    {isVisible('ai_impact') && <TableHead>AI-påverkan</TableHead>}
                    {isVisible('notes') && <TableHead>Anteckningar</TableHead>}
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchlist.map((item) => (
                    <TableRow key={item.id}>
                      {isVisible('ticker') && <TableCell className="font-mono font-semibold">{item.ticker}</TableCell>}
                      {isVisible('company_name') && <TableCell className="text-muted-foreground">{item.company_name || '—'}</TableCell>}
                      {isVisible('conviction') && (
                        <TableCell>
                          {item.conviction ? (
                            <Badge variant="outline" className={convictionColors[item.conviction] || ''}>
                              {item.conviction === 'high' ? 'Hög' : item.conviction === 'medium' ? 'Medel' : 'Låg'}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                      )}
                      {isVisible('buy_more') && (
                        <TableCell>
                          {item.buy_more ? <TrendingUp className="h-4 w-4 text-green-500" /> : '—'}
                        </TableCell>
                      )}
                      {isVisible('ai_impact') && <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{item.ai_impact || '—'}</TableCell>}
                      {isVisible('notes') && <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground">{item.notes || '—'}</TableCell>}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
