import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart, Plus, Trash2, Sparkles, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OwnershipEntry {
  name: string;
  role: string;
  shares: number;
  percentage: number;
}

interface InsiderOwnershipProps {
  data: OwnershipEntry[];
  onUpdate: (data: OwnershipEntry[]) => void;
  currentPrice?: number | null;
  tradingCurrency?: string;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--accent))'];

type SortKey = 'name' | 'role' | 'shares' | 'percentage' | 'value';
type SortDir = 'asc' | 'desc';

export function InsiderOwnership({ data, onUpdate, currentPrice, tradingCurrency = 'SEK' }: InsiderOwnershipProps) {
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Local copy of data for snappy typing — sync when parent data changes externally
  const [localData, setLocalData] = useState<OwnershipEntry[]>(data);
  const isTypingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only adopt parent data if user isn't actively typing (avoids cursor jumps and lag)
    if (!isTypingRef.current) {
      setLocalData(data);
    }
  }, [data]);

  const flushUpdate = useCallback((next: OwnershipEntry[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    isTypingRef.current = true;
    debounceRef.current = setTimeout(() => {
      onUpdate(next);
      isTypingRef.current = false;
    }, 400);
  }, [onUpdate]);

  const addRow = () => {
    const next = [...localData, { name: '', role: '', shares: 0, percentage: 0 }];
    setLocalData(next);
    onUpdate(next);
  };

  const removeRow = (index: number) => {
    const next = localData.filter((_, i) => i !== index);
    setLocalData(next);
    onUpdate(next);
  };

  const updateRow = (index: number, field: keyof OwnershipEntry, value: string | number) => {
    const updated = [...localData];
    updated[index] = { ...updated[index], [field]: value };
    setLocalData(updated);
    flushUpdate(updated);
  };

  const handleSmartPaste = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('parse-insider-ownership', {
        body: { text: pasteText },
      });
      if (error) throw error;
      if (result?.owners && Array.isArray(result.owners)) {
        const next = [...localData, ...result.owners];
        setLocalData(next);
        onUpdate(next);
        setPasteText('');
        setShowPaste(false);
        toast.success(`Parsed ${result.owners.length} ownership entries`);
      } else {
        toast.error('Could not parse ownership data');
      }
    } catch (e) {
      console.error('Smart paste error:', e);
      toast.error('Failed to parse text');
    } finally {
      setParsing(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'role' ? 'asc' : 'desc');
    }
  };

  // Build display order: indices into localData, sorted as requested
  const displayOrder = useMemo(() => {
    const indices = localData.map((_, i) => i);
    if (!sortKey) return indices;
    const dir = sortDir === 'asc' ? 1 : -1;
    return indices.sort((a, b) => {
      const ea = localData[a];
      const eb = localData[b];
      let va: any;
      let vb: any;
      if (sortKey === 'value') {
        va = (ea.shares || 0) * (currentPrice || 0);
        vb = (eb.shares || 0) * (currentPrice || 0);
      } else {
        va = ea[sortKey];
        vb = eb[sortKey];
      }
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * dir;
      }
      return ((va ?? 0) - (vb ?? 0)) * dir;
    });
  }, [localData, sortKey, sortDir, currentPrice]);

  const pieData = useMemo(
    () =>
      localData
        .filter(d => d.percentage > 0)
        .map(d => ({
          name: d.name || 'Unknown',
          value: Math.round(d.percentage * 10000) / 100,
        })),
    [localData],
  );

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const sortBtn = (k: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${align === 'right' ? 'flex-row-reverse w-full justify-start' : ''}`}
    >
      {label}
      <SortIcon k={k} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <PieChart className="h-5 w-5" />
          Insider Ownership
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPaste(!showPaste)} className="gap-1">
            <Sparkles className="h-3 w-3" />
            Smart Paste
          </Button>
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {showPaste && (
        <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
          <Textarea
            placeholder="Paste raw insider ownership text here... e.g. 'CEO John Smith owns 5.2% (520,000 shares)'"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="min-h-[80px]"
          />
          <Button size="sm" onClick={handleSmartPaste} disabled={parsing || !pasteText.trim()} className="gap-1">
            {parsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Parse with AI
          </Button>
        </div>
      )}

      {localData.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{sortBtn('name', 'Name')}</TableHead>
                  <TableHead>{sortBtn('role', 'Role')}</TableHead>
                  <TableHead className="text-right">{sortBtn('shares', 'Shares', 'right')}</TableHead>
                  <TableHead className="text-right">{sortBtn('percentage', '%', 'right')}</TableHead>
                  <TableHead className="text-right">{sortBtn('value', `Value (${tradingCurrency})`, 'right')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayOrder.map((i) => {
                  const entry = localData[i];
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Input value={entry.name} onChange={(e) => updateRow(i, 'name', e.target.value)} placeholder="Name" className="h-8" />
                      </TableCell>
                      <TableCell>
                        <Input value={entry.role} onChange={(e) => updateRow(i, 'role', e.target.value)} placeholder="Role" className="h-8" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={entry.shares || ''} onChange={(e) => updateRow(i, 'shares', parseInt(e.target.value) || 0)} className="h-8 text-right font-mono" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={entry.percentage ? (entry.percentage * 100).toFixed(2) : ''} onChange={(e) => updateRow(i, 'percentage', (parseFloat(e.target.value) || 0) / 100)} className="h-8 text-right font-mono w-20" />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {entry.shares && currentPrice
                          ? (entry.shares * currentPrice).toLocaleString('sv-SE', { maximumFractionDigits: 0 })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRow(i)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {pieData.length > 0 && (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {localData.length === 0 && !showPaste && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No ownership data. Click "Add" or use "Smart Paste" to add entries.
        </p>
      )}
    </div>
  );
}
