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
import { Plus, Trash2, Star, Loader2, X } from 'lucide-react';
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

  // Derive custom column names from all rows
  const customColumnNames = useMemo(() => {
    if (!watchlist) return [];
    const names = new Set<string>();
    watchlist.forEach(item => {
      Object.keys(item.custom_columns || {}).forEach(k => names.add(k));
    });
    return Array.from(names);
  }, [watchlist]);

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

  // Debounced cell save
  const debouncedUpdate = useCallback(
    debounce((itemId: string, updates: Record<string, any>) => {
      updateMutation.mutate({ itemId, updates });
    }, 800),
    []
  );

  const handleCellChange = (item: WatchlistItem, field: string, value: string) => {
    // For fixed columns, update directly
    if (['ticker', 'company_name', 'conviction', 'notes', 'ai_impact'].includes(field)) {
      debouncedUpdate(item.id, { [field]: value || null });
    } else {
      // Custom column
      const newCustom = { ...item.custom_columns, [field]: value };
      debouncedUpdate(item.id, { custom_columns: newCustom });
    }
  };

  const handleAddColumn = () => {
    if (!newColName.trim()) return;
    // Just add empty value to all existing rows
    if (watchlist) {
      watchlist.forEach(item => {
        if (!(newColName in (item.custom_columns || {}))) {
          const newCustom = { ...item.custom_columns, [newColName]: '' };
          updateMutation.mutate({ itemId: item.id, updates: { custom_columns: newCustom } });
        }
      });
    }
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
    toast.success(`Kolumn "${colName}" borttagen`);
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
                    {FIXED_COLUMNS.map(col => (
                      <TableHead key={col.key} className="min-w-[100px]">{col.label}</TableHead>
                    ))}
                    {customColumnNames.map(colName => (
                      <TableHead key={colName} className="min-w-[100px]">
                        <div className="flex items-center gap-1">
                          <span>{colName}</span>
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
                  {watchlist?.map((item) => (
                    <TableRow key={item.id}>
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
                    <TableCell colSpan={FIXED_COLUMNS.length + customColumnNames.length + 1} className="p-1">
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
