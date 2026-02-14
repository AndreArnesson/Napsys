import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Star, Loader2, X, GripVertical, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import debounce from 'lodash/debounce';

interface WatchlistItem {
  id: string;
  ticker: string;
  company_name: string | null;
  company_id: string | null;
  conviction: string | null;
  notes: string | null;
  buy_more: boolean;
  ai_impact: string | null;
  custom_columns: Record<string, string>;
}

const FIXED_COLUMNS = [
  { key: 'ticker', label: 'Ticker' },
  { key: 'company_name', label: 'Bolag' },
  { key: 'conviction', label: 'Övertygelse' },
  { key: 'notes', label: 'Anteckningar' },
];

export function WatchlistSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newColName, setNewColName] = useState('');
  const [addColOpen, setAddColOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  const { data: watchlist, isLoading } = useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        custom_columns: (item.custom_columns as Record<string, string>) || {},
      })) as WatchlistItem[];
    },
    enabled: !!user,
  });

  // Derive custom column names from all rows, preserving order
  const customColumnNames = useMemo(() => {
    if (!watchlist) return [];
    const names = new Set<string>();
    watchlist.forEach(item => {
      Object.keys(item.custom_columns || {}).forEach(k => names.add(k));
    });
    const allNames = Array.from(names);
    // If we have a stored order, use it; otherwise use discovery order
    if (columnOrder.length > 0) {
      const ordered = columnOrder.filter(n => allNames.includes(n));
      const remaining = allNames.filter(n => !columnOrder.includes(n));
      return [...ordered, ...remaining];
    }
    return allNames;
  }, [watchlist, columnOrder]);

  const updateMutation = useMutation({
    mutationFn: async ({ itemId, updates }: { itemId: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from('watchlist').update(updates as any).eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: () => toast.error('Kunde inte spara'),
  });

  const addRowMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('watchlist').insert({
        ticker: '',
        user_id: user!.id,
        custom_columns: {},
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: () => toast.error('Kunde inte lägga till rad'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('watchlist').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const debouncedUpdate = useCallback(
    debounce((itemId: string, updates: Record<string, any>) => {
      updateMutation.mutate({ itemId, updates });
    }, 800),
    []
  );

  const handleCellChange = (item: WatchlistItem, field: string, value: string) => {
    if (['ticker', 'company_name', 'conviction', 'notes', 'ai_impact'].includes(field)) {
      debouncedUpdate(item.id, { [field]: value || null });
    } else {
      const newCustom = { ...item.custom_columns, [field]: value };
      debouncedUpdate(item.id, { custom_columns: newCustom });
    }
  };

  const handleAddColumn = () => {
    if (!newColName.trim()) return;
    if (watchlist) {
      watchlist.forEach(item => {
        if (!(newColName in (item.custom_columns || {}))) {
          const newCustom = { ...item.custom_columns, [newColName]: '' };
          updateMutation.mutate({ itemId: item.id, updates: { custom_columns: newCustom } });
        }
      });
    }
    setColumnOrder(prev => [...prev, newColName]);
    setNewColName('');
    setAddColOpen(false);
    toast.success(`Kolumn "${newColName}" tillagd`);
  };

  const handleDeleteColumn = (colName: string) => {
    if (!watchlist) return;
    watchlist.forEach(item => {
      const newCustom = { ...item.custom_columns };
      delete newCustom[colName];
      updateMutation.mutate({ itemId: item.id, updates: { custom_columns: newCustom } });
    });
    setColumnOrder(prev => prev.filter(n => n !== colName));
    toast.success(`Kolumn "${colName}" borttagen`);
  };

  // Move row up/down
  const moveRow = async (index: number, direction: 'up' | 'down') => {
    if (!watchlist) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= watchlist.length) return;
    
    // Swap created_at timestamps to reorder
    const itemA = watchlist[index];
    const itemB = watchlist[newIndex];
    await supabase.from('watchlist').update({ created_at: itemB.id } as any).eq('id', 'noop'); // dummy
    
    // We swap by updating created_at of both
    const tempDate = new Date().toISOString();
    const dateA = (itemA as any).created_at;
    const dateB = (itemB as any).created_at;
    
    await Promise.all([
      supabase.from('watchlist').update({ created_at: dateB } as any).eq('id', itemA.id),
      supabase.from('watchlist').update({ created_at: dateA } as any).eq('id', itemB.id),
    ]);
    queryClient.invalidateQueries({ queryKey: ['watchlist'] });
  };

  // Move custom column left/right
  const moveColumn = (colIndex: number, direction: 'left' | 'right') => {
    const cols = [...customColumnNames];
    const newIndex = direction === 'left' ? colIndex - 1 : colIndex + 1;
    if (newIndex < 0 || newIndex >= cols.length) return;
    [cols[colIndex], cols[newIndex]] = [cols[newIndex], cols[colIndex]];
    setColumnOrder(cols);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Bevakningslista</h2>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    {FIXED_COLUMNS.map(col => (
                      <TableHead key={col.key} className="min-w-[100px]">{col.label}</TableHead>
                    ))}
                    {customColumnNames.map((colName, ci) => (
                      <TableHead key={colName} className="min-w-[100px]">
                        <div className="flex items-center gap-1">
                          <div className="flex flex-col">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 opacity-40 hover:opacity-100"
                              onClick={() => moveColumn(ci, 'left')}
                              disabled={ci === 0}
                            >
                              <ArrowLeft className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="flex-1">{colName}</span>
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 opacity-40 hover:opacity-100"
                              onClick={() => moveColumn(ci, 'right')}
                              disabled={ci === customColumnNames.length - 1}
                            >
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-50 hover:opacity-100"
                            onClick={() => handleDeleteColumn(colName)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-[80px]">
                      <Popover open={addColOpen} onOpenChange={setAddColOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56" align="end">
                          <div className="space-y-2">
                            <Label className="text-xs">Ny kolumn</Label>
                            <Input
                              placeholder="Kolumnnamn..."
                              value={newColName}
                              onChange={(e) => setNewColName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                            />
                            <Button size="sm" onClick={handleAddColumn} disabled={!newColName.trim()} className="w-full">
                              Lägg till
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchlist?.map((item, rowIndex) => (
                    <TableRow key={item.id}>
                      <TableCell className="p-1">
                        <div className="flex flex-col items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-40 hover:opacity-100"
                            onClick={() => moveRow(rowIndex, 'up')}
                            disabled={rowIndex === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-40 hover:opacity-100"
                            onClick={() => moveRow(rowIndex, 'down')}
                            disabled={rowIndex === (watchlist?.length ?? 0) - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      {FIXED_COLUMNS.map(col => (
                        <TableCell key={col.key} className="p-1">
                          <Input
                            className="h-8 border-transparent bg-transparent hover:border-input focus:border-input transition-colors font-mono text-sm"
                            defaultValue={(item as any)[col.key] || ''}
                            placeholder="—"
                            onBlur={(e) => handleCellChange(item, col.key, e.target.value)}
                          />
                        </TableCell>
                      ))}
                      {customColumnNames.map(colName => (
                        <TableCell key={colName} className="p-1">
                          <Input
                            className="h-8 border-transparent bg-transparent hover:border-input focus:border-input transition-colors text-sm"
                            defaultValue={item.custom_columns?.[colName] || ''}
                            placeholder="—"
                            onBlur={(e) => handleCellChange(item, colName, e.target.value)}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="p-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Add row button */}
                  <TableRow>
                    <TableCell colSpan={FIXED_COLUMNS.length + customColumnNames.length + 2} className="p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => addRowMutation.mutate()}
                        disabled={addRowMutation.isPending}
                      >
                        {addRowMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Ny rad
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
