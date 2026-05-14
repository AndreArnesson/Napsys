import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, History, Trash2, Plus, ArrowUpDown, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { OwnershipEntry } from './InsiderOwnership';

interface Snapshot {
  id: string;
  recorded_date: string;
  entries: OwnershipEntry[];
  note: string | null;
}

interface EditState {
  date: string;
  note: string;
  entries: OwnershipEntry[];
}

function totalPct(entries: OwnershipEntry[]) {
  return entries.reduce((s, e) => s + (e.percentage || 0), 0) * 100;
}

export function InsiderOwnershipHistory({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [editMap, setEditMap] = useState<Record<string, EditState>>({});
  const [sortAsc, setSortAsc] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const { data: snapshots = [] } = useQuery<Snapshot[]>({
    queryKey: ['insider_ownership_history', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insider_ownership_history')
        .select('id, recorded_date, entries, note')
        .eq('company_id', companyId)
        .order('recorded_date', { ascending: true });
      if (error) throw error;
      return data as Snapshot[];
    },
    enabled: !!companyId,
  });

  if (snapshots.length === 0) return null;

  const sorted = sortAsc ? [...snapshots] : [...snapshots].reverse();

  const chartData = snapshots.map(s => ({
    date: format(parseISO(s.recorded_date), 'MMM yyyy'),
    pct: Math.round(totalPct(s.entries) * 10) / 10,
  }));

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
            [id]: { date: snap.recorded_date, note: snap.note || '', entries: snap.entries.map(e => ({ ...e })) },
          }));
        }
      }
      return next;
    });
  };

  const setEdit = (id: string, patch: Partial<EditState>) => {
    setEditMap(em => ({ ...em, [id]: { ...em[id], ...patch } }));
  };

  const updateEntry = (id: string, idx: number, field: keyof OwnershipEntry, raw: string) => {
    setEditMap(em => {
      const state = em[id];
      if (!state) return em;
      const entries = state.entries.map((e, i) => {
        if (i !== idx) return e;
        if (field === 'shares') return { ...e, shares: parseInt(raw) || 0 };
        if (field === 'percentage') return { ...e, percentage: (parseFloat(raw) || 0) / 100 };
        return { ...e, [field]: raw };
      });
      return { ...em, [id]: { ...state, entries } };
    });
  };

  const addEntry = (id: string) => {
    setEditMap(em => {
      const state = em[id];
      if (!state) return em;
      return { ...em, [id]: { ...state, entries: [...state.entries, { name: '', role: '', shares: 0, percentage: 0 }] } };
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
        .from('insider_ownership_history')
        .update({ recorded_date: state.date, note: state.note || null, entries: state.entries })
        .eq('id', id);
      if (error) throw error;
      setEditMap(em => { const { [id]: _, ...rest } = em; return rest; });
      queryClient.invalidateQueries({ queryKey: ['insider_ownership_history', companyId] });
      toast.success('Snapshot updated');
    } catch {
      toast.error('Failed to update snapshot');
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const deleteSnapshot = async (id: string) => {
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      const { error } = await supabase.from('insider_ownership_history').delete().eq('id', id);
      if (error) throw error;
      setOpenIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setEditMap(em => { const { [id]: _, ...rest } = em; return rest; });
      queryClient.invalidateQueries({ queryKey: ['insider_ownership_history', companyId] });
      toast.success('Snapshot deleted');
    } catch {
      toast.error('Failed to delete snapshot');
    } finally {
      setDeleting(d => ({ ...d, [id]: false }));
    }
  };

  return (
    <div className="space-y-4 pt-2 border-t mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="h-4 w-4" />
          Ownership history
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setSortAsc(a => !a)}>
          <ArrowUpDown className="h-3 w-3" />
          {sortAsc ? 'Oldest first' : 'Newest first'}
        </Button>
      </div>

      {snapshots.length >= 2 && (
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Total insider %']} />
              <Line type="monotone" dataKey="pct" stroke="hsl(var(--primary))" strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="space-y-1">
        {sorted.map(snap => {
          const isOpen = openIds.has(snap.id);
          const edit = editMap[snap.id];
          const displayDate = edit?.date ?? snap.recorded_date;
          const displayNote = edit?.note ?? (snap.note || '');
          const displayEntries = edit?.entries ?? snap.entries;
          const pct = totalPct(displayEntries);

          return (
            <Collapsible key={snap.id} open={isOpen} onOpenChange={() => toggle(snap)}>
              <div className="flex items-center gap-1">
                <CollapsibleTrigger asChild>
                  <button className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 text-sm text-left">
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <span className="font-medium">{format(parseISO(displayDate), 'd MMM yyyy')}</span>
                    <span className="text-muted-foreground">{pct.toFixed(1)}% total</span>
                    {displayNote && <span className="text-muted-foreground truncate">— {displayNote}</span>}
                  </button>
                </CollapsibleTrigger>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={e => { e.stopPropagation(); deleteSnapshot(snap.id); }} disabled={deleting[snap.id]}>
                  {deleting[snap.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <CollapsibleContent>
                <div className="ml-5 mt-1 mb-3 space-y-2">
                  {/* Date + note editors */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      value={edit?.date ?? snap.recorded_date}
                      onChange={e => setEdit(snap.id, { date: e.target.value })}
                      className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Input
                      placeholder="Note (optional)"
                      value={edit?.note ?? (snap.note || '')}
                      onChange={e => setEdit(snap.id, { note: e.target.value })}
                      className="h-8 flex-1 min-w-[140px] max-w-[240px]"
                    />
                  </div>

                  {/* Entries table */}
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="text-right">Shares</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayEntries.map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="py-1">
                              <Input value={e.name} onChange={ev => updateEntry(snap.id, i, 'name', ev.target.value)} placeholder="Name" className="h-7" />
                            </TableCell>
                            <TableCell className="py-1">
                              <Input value={e.role} onChange={ev => updateEntry(snap.id, i, 'role', ev.target.value)} placeholder="Role" className="h-7" />
                            </TableCell>
                            <TableCell className="py-1">
                              <Input type="number" value={e.shares || ''} onChange={ev => updateEntry(snap.id, i, 'shares', ev.target.value)} className="h-7 text-right font-mono w-28" />
                            </TableCell>
                            <TableCell className="py-1">
                              <Input type="number" step="0.01" value={e.percentage ? (e.percentage * 100).toFixed(2) : ''} onChange={ev => updateEntry(snap.id, i, 'percentage', ev.target.value)} className="h-7 text-right font-mono w-20" />
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

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addEntry(snap.id)}>
                      <Plus className="h-3 w-3" /> Add row
                    </Button>
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => saveSnapshot(snap.id)} disabled={saving[snap.id]}>
                      {saving[snap.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
