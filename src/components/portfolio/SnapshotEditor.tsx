import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, CalendarIcon, Upload, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ImportDialog } from './ImportDialog';

interface Props {
  portfolioId: string;
  portfolioName: string;
}

interface Holding {
  id?: string;
  company_name: string;
  ticker: string;
  weight_percent: number | null;
  value_sek: number | null;
  price: number | null;
  shares_count: number | null;
  conviction: string;
  rationale: string;
  notes: string;
  future_plan: string;
}

type SortField = 'company_name' | 'ticker' | 'weight_percent' | 'value_sek' | 'price' | 'shares_count' | 'conviction' | 'future_plan';
type SortDir = 'asc' | 'desc';

export function SnapshotEditor({ portfolioId, portfolioName }: Props) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [showNewSnapshot, setShowNewSnapshot] = useState(false);
  const [snapshotDate, setSnapshotDate] = useState<Date>(new Date());
  const [snapshotComment, setSnapshotComment] = useState('');
  const [editingSnapshot, setEditingSnapshot] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortField(null); setSortDir('desc'); }
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'desc'
      ? <ArrowDown className="h-3 w-3 ml-1" />
      : <ArrowUp className="h-3 w-3 ml-1" />;
  };

  const sortedHoldings = (() => {
    if (!sortField) return holdings.map((h, i) => ({ h, i }));
    const convictionOrder = { high: 3, medium: 2, low: 1, '': 0 };
    const planOrder = { buy_more: 4, hold: 3, scale_down: 2, sell_all: 1, '': 0 };
    return holdings
      .map((h, i) => ({ h, i }))
      .sort((a, b) => {
        if (sortField === 'conviction') {
          const av = convictionOrder[a.h.conviction as keyof typeof convictionOrder] ?? 0;
          const bv = convictionOrder[b.h.conviction as keyof typeof convictionOrder] ?? 0;
          return sortDir === 'desc' ? bv - av : av - bv;
        } else if (sortField === 'future_plan') {
          const av = planOrder[a.h.future_plan as keyof typeof planOrder] ?? 0;
          const bv = planOrder[b.h.future_plan as keyof typeof planOrder] ?? 0;
          return sortDir === 'desc' ? bv - av : av - bv;
        } else if (sortField === 'company_name' || sortField === 'ticker') {
          const cmp = (a.h[sortField] || '').localeCompare(b.h[sortField] || '', 'sv');
          return sortDir === 'asc' ? cmp : -cmp;
        } else {
          const av = a.h[sortField] ?? -Infinity;
          const bv = b.h[sortField] ?? -Infinity;
          return sortDir === 'desc' ? bv - av : av - bv;
        }
      });
  })();

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['portfolio-snapshots', portfolioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('snapshot_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: snapshotHoldings } = useQuery({
    queryKey: ['portfolio-holdings', editingSnapshot],
    queryFn: async () => {
      if (!editingSnapshot) return [];
      const { data, error } = await supabase
        .from('portfolio_holdings')
        .select('*')
        .eq('snapshot_id', editingSnapshot)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: !!editingSnapshot,
  });

  const createSnapshot = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .insert({
          portfolio_id: portfolioId,
          snapshot_date: format(snapshotDate, 'yyyy-MM-dd'),
          comment: snapshotComment || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-snapshots', portfolioId] });
      setShowNewSnapshot(false);
      setSnapshotComment('');
      setEditingSnapshot(data.id);
      setHoldings([]);
    },
    onError: () => toast.error(t.common.error),
  });

  const deleteSnapshot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('portfolio_snapshots').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-snapshots', portfolioId] });
      if (editingSnapshot) setEditingSnapshot(null);
    },
    onError: () => toast.error(t.common.error),
  });

  const saveHoldings = useMutation({
    mutationFn: async () => {
      if (!editingSnapshot) return;
      // Delete existing then insert new
      await supabase.from('portfolio_holdings').delete().eq('snapshot_id', editingSnapshot);
      if (holdings.length > 0) {
        const { error } = await supabase.from('portfolio_holdings').insert(
          holdings.map((h) => ({
            snapshot_id: editingSnapshot,
            company_name: h.company_name || null,
            ticker: h.ticker || null,
            weight_percent: h.weight_percent,
            value_sek: h.value_sek,
            price: h.price,
            shares_count: h.shares_count,
            conviction: h.conviction || null,
            rationale: h.rationale || null,
            notes: h.notes || null,
            future_plan: h.future_plan || null,
          } as any))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings', editingSnapshot] });
      toast.success(t.common.success);
    },
    onError: () => toast.error(t.common.error),
  });

  const addHolding = () => {
    setHoldings([...holdings, { company_name: '', ticker: '', weight_percent: null, value_sek: null, price: null, shares_count: null, conviction: '', rationale: '', notes: '', future_plan: '' }]);
  };

  const updateHolding = (index: number, field: keyof Holding, value: any) => {
    const updated = [...holdings];
    (updated[index] as any)[field] = value;
    setHoldings(updated);
  };

  const removeHolding = (index: number) => {
    setHoldings(holdings.filter((_, i) => i !== index));
  };

  const handleImportComplete = (imported: Holding[]) => {
    setHoldings([...holdings, ...imported]);
    setShowImport(false);
  };

  // When opening a snapshot for editing, load its holdings
  const openSnapshot = (snapshotId: string) => {
    setEditingSnapshot(snapshotId);
  };

  // Sync holdings from query
  if (snapshotHoldings && editingSnapshot && holdings.length === 0 && snapshotHoldings.length > 0) {
    setHoldings(snapshotHoldings.map((h) => ({
      id: h.id,
      company_name: h.company_name || '',
      ticker: h.ticker || '',
      weight_percent: h.weight_percent,
      value_sek: h.value_sek,
      price: (h as any).price ?? null,
      shares_count: (h as any).shares_count ?? null,
      conviction: h.conviction || '',
      rationale: h.rationale || '',
      notes: h.notes || '',
      future_plan: (h as any).future_plan || '',
    })));
  }

  if (editingSnapshot) {
    const snapshot = snapshots?.find((s) => s.id === editingSnapshot);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => { setEditingSnapshot(null); setHoldings([]); }}>
              ← {t.common.back}
            </Button>
            <span className="ml-2 text-lg font-semibold">
              {snapshot?.snapshot_date ? format(new Date(snapshot.snapshot_date), 'd MMMM yyyy', { locale: sv }) : ''}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" />
              {t.portfolio.importStatement}
            </Button>
            <Button onClick={() => saveHoldings.mutate()}>
              {t.common.save}
            </Button>
          </div>
        </div>

        {snapshot?.comment && (
          <p className="text-muted-foreground text-sm">{snapshot.comment}</p>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('company_name')}>
                  <span className="inline-flex items-center">{t.portfolio.companyName}<SortIcon field="company_name" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('ticker')}>
                  <span className="inline-flex items-center">{t.portfolio.ticker}<SortIcon field="ticker" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('weight_percent')}>
                  <span className="inline-flex items-center">{t.portfolio.weightPercent}<SortIcon field="weight_percent" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('value_sek')}>
                  <span className="inline-flex items-center">{t.portfolio.valueSek}<SortIcon field="value_sek" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('conviction')}>
                  <span className="inline-flex items-center">{t.portfolio.conviction}<SortIcon field="conviction" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('price')}>
                  <span className="inline-flex items-center">{t.portfolio.price}<SortIcon field="price" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('shares_count')}>
                  <span className="inline-flex items-center">{t.portfolio.sharesCount}<SortIcon field="shares_count" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('future_plan')}>
                  <span className="inline-flex items-center">{t.portfolio.futurePlan}<SortIcon field="future_plan" /></span>
                </TableHead>
                <TableHead>{t.portfolio.rationale}</TableHead>
                <TableHead>{t.portfolio.notes}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHoldings.map(({ h, i }) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input value={h.company_name} onChange={(e) => updateHolding(i, 'company_name', e.target.value)} className="min-w-[120px]" />
                  </TableCell>
                  <TableCell>
                    <Input value={h.ticker} onChange={(e) => updateHolding(i, 'ticker', e.target.value)} className="min-w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={h.weight_percent ?? ''} onChange={(e) => updateHolding(i, 'weight_percent', e.target.value ? parseFloat(e.target.value) : null)} className="min-w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={h.value_sek ?? ''} onChange={(e) => updateHolding(i, 'value_sek', e.target.value ? parseFloat(e.target.value) : null)} className="min-w-[100px]" />
                  </TableCell>
                  <TableCell>
                    <Select value={h.conviction} onValueChange={(v) => updateHolding(i, 'conviction', v)}>
                      <SelectTrigger className="min-w-[100px]">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">{t.portfolio.convictionHigh}</SelectItem>
                        <SelectItem value="medium">{t.portfolio.convictionMedium}</SelectItem>
                        <SelectItem value="low">{t.portfolio.convictionLow}</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={h.price ?? ''} onChange={(e) => updateHolding(i, 'price', e.target.value ? parseFloat(e.target.value) : null)} className="min-w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={h.shares_count ?? ''} onChange={(e) => updateHolding(i, 'shares_count', e.target.value ? parseFloat(e.target.value) : null)} className="min-w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Select value={h.future_plan} onValueChange={(v) => updateHolding(i, 'future_plan', v)}>
                      <SelectTrigger className="min-w-[120px]">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buy_more">{t.portfolio.futurePlanBuyMore}</SelectItem>
                        <SelectItem value="hold">{t.portfolio.futurePlanHold}</SelectItem>
                        <SelectItem value="scale_down">{t.portfolio.futurePlanScaleDown}</SelectItem>
                        <SelectItem value="sell_all">{t.portfolio.futurePlanSellAll}</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input value={h.rationale} onChange={(e) => updateHolding(i, 'rationale', e.target.value)} className="min-w-[150px]" />
                  </TableCell>
                  <TableCell>
                    <Input value={h.notes} onChange={(e) => updateHolding(i, 'notes', e.target.value)} className="min-w-[120px]" />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeHolding(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Button variant="outline" onClick={addHolding}>
          <Plus className="h-4 w-4 mr-2" />
          {t.portfolio.addHolding}
        </Button>

        <ImportDialog open={showImport} onOpenChange={setShowImport} onImport={handleImportComplete} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowNewSnapshot(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.portfolio.newSnapshot}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t.common.loading}</p>
      ) : !snapshots?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">{t.portfolio.noSnapshots}</p>
            <p className="text-muted-foreground mb-4">{t.portfolio.noSnapshotsDescription}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {snapshots.map((s) => (
            <Card key={s.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => openSnapshot(s.id)}>
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div>
                  <CardTitle className="text-base">
                    {format(new Date(s.snapshot_date), 'd MMMM yyyy', { locale: sv })}
                  </CardTitle>
                  {s.comment && <p className="text-sm text-muted-foreground mt-1">{s.comment}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t.common.confirm + '?')) deleteSnapshot.mutate(s.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNewSnapshot} onOpenChange={setShowNewSnapshot}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.portfolio.newSnapshot}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t.portfolio.date}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(snapshotDate, 'd MMMM yyyy', { locale: sv })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={snapshotDate} onSelect={(d) => d && setSnapshotDate(d)} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">{t.portfolio.comment}</label>
              <Textarea
                value={snapshotComment}
                onChange={(e) => setSnapshotComment(e.target.value)}
                placeholder={t.portfolio.commentPlaceholder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSnapshot(false)}>{t.common.cancel}</Button>
            <Button onClick={() => createSnapshot.mutate()}>{t.common.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
