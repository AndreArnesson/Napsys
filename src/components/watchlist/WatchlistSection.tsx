import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit2, Star, TrendingUp, Bot, Loader2 } from 'lucide-react';
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
                    <TableHead>Ticker</TableHead>
                    <TableHead>Bolag</TableHead>
                    <TableHead>Övertygelse</TableHead>
                    <TableHead>Köpa mer?</TableHead>
                    <TableHead>AI-påverkan</TableHead>
                    <TableHead>Anteckningar</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchlist.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono font-semibold">{item.ticker}</TableCell>
                      <TableCell className="text-muted-foreground">{item.company_name || '—'}</TableCell>
                      <TableCell>
                        {item.conviction ? (
                          <Badge variant="outline" className={convictionColors[item.conviction] || ''}>
                            {item.conviction === 'high' ? 'Hög' : item.conviction === 'medium' ? 'Medel' : 'Låg'}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {item.buy_more ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{item.ai_impact || '—'}</TableCell>
                      <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground">{item.notes || '—'}</TableCell>
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
