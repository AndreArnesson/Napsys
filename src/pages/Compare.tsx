import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash/debounce';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, X, ChevronDown, Sparkles, Loader2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Row config ────────────────────────────────────────────────────────────────

interface RowDef { id: string; label: string }
interface SectionDef { id: string; label: string; rows: RowDef[] }

const ROW_SECTIONS: SectionDef[] = [
  {
    id: 'general', label: 'Allmänt',
    rows: [
      { id: 'name', label: 'Namn' },
      { id: 'ticker', label: 'Ticker' },
      { id: 'expense_ratio', label: 'Avgift (TER)' },
      { id: 'aum', label: 'AUM (M)' },
      { id: 'currency', label: 'Valuta' },
      { id: 'distribution_type', label: 'Typ' },
      { id: 'benchmark', label: 'Benchmark' },
      { id: 'inception_date', label: 'Startdatum' },
    ],
  },
  {
    id: 'returns', label: 'Avkastning',
    rows: [
      { id: 'return_ytd', label: 'YTD' },
      { id: 'return_1y', label: '1 år' },
      { id: 'return_3y', label: '3 år (p.a.)' },
      { id: 'return_5y', label: '5 år (p.a.)' },
      { id: 'return_10y', label: '10 år (p.a.)' },
    ],
  },
  {
    id: 'risk', label: 'Risk',
    rows: [
      { id: 'volatility', label: 'Volatilitet' },
      { id: 'sharpe_ratio', label: 'Sharpe-kvot' },
      { id: 'beta', label: 'Beta' },
      { id: 'max_drawdown', label: 'Max nedgång' },
    ],
  },
  {
    id: 'geo', label: 'Geografisk allokering',
    rows: [{ id: 'geographic_allocation', label: 'Allokering' }],
  },
  {
    id: 'sector', label: 'Sektorallokering',
    rows: [{ id: 'sector_allocation', label: 'Allokering' }],
  },
  {
    id: 'holdings', label: 'Innehav',
    rows: [
      { id: 'holdings_count', label: 'Antal innehav' },
      { id: 'top_holdings', label: 'Topinnehav' },
    ],
  },
];

const DEFAULT_VISIBLE: string[] = [
  'name', 'ticker', 'expense_ratio', 'distribution_type',
  'return_ytd', 'return_1y', 'return_3y', 'return_5y', 'return_10y',
  'volatility', 'sharpe_ratio', 'max_drawdown',
];

const LS_KEY = 'compare_visible_rows';
const LS_COLLAPSED = 'compare_collapsed_sections';

function loadVisible(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set(DEFAULT_VISIBLE);
}

function saveVisible(s: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify([...s]));
}

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_COLLAPSED);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set<string>();
}

function saveCollapsed(s: Set<string>) {
  localStorage.setItem(LS_COLLAPSED, JSON.stringify([...s]));
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CustomRowDef { id: string; label: string }
interface Comparison { id: string; name: string; custom_row_defs?: CustomRowDef[] | null }
interface TopHolding { name: string; weight: number }

interface FundItem {
  id: string;
  comparison_id: string;
  sort_order: number;
  name: string;
  ticker?: string | null;
  expense_ratio?: number | null;
  aum?: number | null;
  inception_date?: string | null;
  benchmark?: string | null;
  distribution_type?: 'accumulating' | 'distributing' | null;
  currency?: string | null;
  return_ytd?: number | null;
  return_1y?: number | null;
  return_3y?: number | null;
  return_5y?: number | null;
  return_10y?: number | null;
  volatility?: number | null;
  sharpe_ratio?: number | null;
  beta?: number | null;
  max_drawdown?: number | null;
  geographic_allocation?: Record<string, number> | null;
  sector_allocation?: Record<string, number> | null;
  top_holdings?: TopHolding[] | null;
  holdings_count?: number | null;
  custom_fields?: Record<string, string> | null;
}

// ─── Inline cell components ────────────────────────────────────────────────────

function NumCell({ value, onChange, suffix }: { value: number | null | undefined; onChange: (v: number | null) => void; suffix?: string }) {
  return (
    <div className="relative">
      <input
        type="number" step="0.01" value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        className="w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none text-sm py-1 px-0 text-right tabular-nums transition-colors"
        style={suffix ? { paddingRight: '1.2rem' } : {}}
      />
      {suffix && <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{suffix}</span>}
    </div>
  );
}

function TextCell({ value, onChange, placeholder }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <input
      type="text" value={value ?? ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value || null)}
      className="w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none text-sm py-1 px-0 transition-colors"
    />
  );
}

function DateCell({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  return (
    <input
      type="date" value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      className="w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none text-sm py-1 px-0 transition-colors"
    />
  );
}

function ReturnCell({ value, onChange }: { value: number | null | undefined; onChange: (v: number | null) => void }) {
  const col = value == null ? '' : value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500';
  return (
    <div className="relative">
      <input
        type="number" step="0.01" value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        className={cn('w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none text-sm py-1 px-0 text-right tabular-nums transition-colors', col)}
        style={{ paddingRight: '1.2rem' }}
      />
      <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
    </div>
  );
}

function AllocationCell({ value, onChange }: { value: Record<string, number> | null | undefined; onChange: (v: Record<string, number>) => void }) {
  const entries = Object.entries(value ?? {});
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const summary = entries.length === 0
    ? <span className="text-muted-foreground/50 text-xs">–</span>
    : <span className="text-xs text-muted-foreground">{entries.length} poster</span>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="w-full text-left flex items-center gap-1 hover:opacity-70 transition-opacity py-1">
          {summary}
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 space-y-1.5" align="start">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-1">
            <input value={k} onChange={e => { const c = { ...(value ?? {}) }; delete c[k]; onChange({ ...c, [e.target.value]: v }); }} className="flex-1 text-xs border rounded px-1.5 py-1 min-w-0" />
            <input type="number" value={v} onChange={e => onChange({ ...(value ?? {}), [k]: parseFloat(e.target.value) || 0 })} className="w-14 text-xs border rounded px-1.5 py-1 text-right" />
            <span className="text-xs text-muted-foreground">%</span>
            <button onClick={() => { const c = { ...(value ?? {}) }; delete c[k]; onChange(c); }} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </div>
        ))}
        <div className="flex items-center gap-1 pt-1 border-t">
          <input placeholder="Namn" value={newKey} onChange={e => setNewKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newKey.trim() && newVal) { onChange({ ...(value ?? {}), [newKey.trim()]: parseFloat(newVal) || 0 }); setNewKey(''); setNewVal(''); } }} className="flex-1 text-xs border rounded px-1.5 py-1 min-w-0" />
          <input type="number" placeholder="%" value={newVal} onChange={e => setNewVal(e.target.value)} className="w-14 text-xs border rounded px-1.5 py-1 text-right" />
          <button onClick={() => { if (newKey.trim() && newVal) { onChange({ ...(value ?? {}), [newKey.trim()]: parseFloat(newVal) || 0 }); setNewKey(''); setNewVal(''); } }} className="text-primary hover:opacity-70"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Section header row ────────────────────────────────────────────────────────

function SectionRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr className="bg-muted/30">
      <td colSpan={colSpan} className="sticky left-0 bg-muted/30 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

// ─── Row panel (sidebar) ───────────────────────────────────────────────────────

interface RowPanelProps {
  visibleRows: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleSection: (sectionId: string, visible: boolean) => void;
  customRowDefs: CustomRowDef[];
  onAddCustomRow: (label: string) => void;
  onDeleteCustomRow: (id: string) => void;
}

function RowPanel({ visibleRows, onToggleRow, onToggleSection, customRowDefs, onAddCustomRow, onDeleteCustomRow }: RowPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [newLabel, setNewLabel] = useState('');

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveCollapsed(next);
      return next;
    });
  };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    onAddCustomRow(label);
    setNewLabel('');
  };

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="px-4 py-3 border-b">
        <p className="text-sm font-semibold">Rader</p>
        <p className="text-xs text-muted-foreground mt-0.5">Välj vad du vill jämföra</p>
      </div>

      <div className="p-3 space-y-1 max-h-[60vh] overflow-y-auto">
        {ROW_SECTIONS.map(section => {
          const allVisible = section.rows.every(r => visibleRows.has(r.id));
          const someVisible = section.rows.some(r => visibleRows.has(r.id));
          const isCollapsed = collapsed.has(section.id);

          return (
            <div key={section.id}>
              <div className="flex items-center gap-1.5 py-1">
                <Checkbox
                  id={`sec-${section.id}`}
                  checked={allVisible ? true : someVisible ? 'indeterminate' : false}
                  onCheckedChange={checked => onToggleSection(section.id, !!checked)}
                  className="h-3.5 w-3.5"
                />
                <button
                  onClick={() => toggleCollapse(section.id)}
                  className="flex-1 flex items-center justify-between text-left"
                >
                  <label htmlFor={`sec-${section.id}`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer">
                    {section.label}
                  </label>
                  <ChevronRight className={cn('h-3 w-3 text-muted-foreground transition-transform', !isCollapsed && 'rotate-90')} />
                </button>
              </div>

              {!isCollapsed && (
                <div className="pl-5 space-y-0.5 mb-1">
                  {section.rows.map(row => (
                    <div key={row.id} className="flex items-center gap-1.5 py-0.5">
                      <Checkbox
                        id={`row-${row.id}`}
                        checked={visibleRows.has(row.id)}
                        onCheckedChange={() => onToggleRow(row.id)}
                        className="h-3 w-3"
                      />
                      <label htmlFor={`row-${row.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                        {row.label}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {customRowDefs.length > 0 && (
          <div className="pt-1 border-t mt-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-1">Egna rader</p>
            {customRowDefs.map(r => (
              <div key={r.id} className="flex items-center gap-1 py-0.5">
                <span className="flex-1 text-xs truncate">{r.label}</span>
                <button onClick={() => onDeleteCustomRow(r.id)} className="text-muted-foreground/50 hover:text-destructive shrink-0">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Lägg till fritext-rad</p>
        <div className="flex gap-1">
          <Input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Namn på rad..."
            className="h-7 text-xs"
          />
          <Button onClick={handleAdd} size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── AI fill dialog ────────────────────────────────────────────────────────────

interface AIFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funds: FundItem[];
  initialFundId?: string | null;
  onApply: (fundId: string, patch: Partial<FundItem>) => void;
  onRevealRows: (rowIds: string[]) => void;
}

function AIFillDialog({ open, onOpenChange, funds, initialFundId, onApply, onRevealRows }: AIFillDialogProps) {
  const [selectedFundId, setSelectedFundId] = useState<string>(funds[0]?.id ?? '');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<Partial<FundItem> | null>(null);

  useEffect(() => {
    if (funds.length && !selectedFundId) setSelectedFundId(funds[0].id);
  }, [funds]);

  useEffect(() => {
    if (initialFundId) setSelectedFundId(initialFundId);
  }, [initialFundId, open]);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setExtracted(null);
    try {
      const { data, error } = await supabase.functions.invoke('parse-fund-data', { body: { text } });
      if (error) throw error;
      const patch: Partial<FundItem> = {};
      for (const [k, v] of Object.entries(data ?? {})) {
        if (v !== null && v !== undefined) (patch as any)[k] = v;
      }
      setExtracted(patch);
    } catch {
      toast.error('AI-analys misslyckades');
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!extracted || !selectedFundId) return;
    onApply(selectedFundId, extracted);
    // Auto-show any rows that were filled in so they're immediately visible
    const allRowIds = ROW_SECTIONS.flatMap(s => s.rows.map(r => r.id));
    const filledRowIds = Object.keys(extracted).filter(k => allRowIds.includes(k));
    if (filledRowIds.length > 0) onRevealRows(filledRowIds);
    toast.success('Fält ifyllda');
    onOpenChange(false);
    setText('');
    setExtracted(null);
  };

  const fieldCount = extracted ? Object.keys(extracted).length : 0;

  const fieldLabel: Record<string, string> = {
    name: 'Namn', ticker: 'Ticker', expense_ratio: 'Avgift (TER)', aum: 'AUM (M)',
    currency: 'Valuta', distribution_type: 'Typ', benchmark: 'Benchmark',
    inception_date: 'Startdatum', return_ytd: 'YTD', return_1y: '1 år',
    return_3y: '3 år', return_5y: '5 år', return_10y: '10 år',
    volatility: 'Volatilitet', sharpe_ratio: 'Sharpe', beta: 'Beta',
    max_drawdown: 'Max nedgång', holdings_count: 'Antal innehav',
    top_holdings: 'Topinnehav', geographic_allocation: 'Geografisk allokering',
    sector_allocation: 'Sektorallokering',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI-assistans
          </DialogTitle>
          <DialogDescription>
            Klistra in text om en fond — faktablad, Morningstar-sida, innehållslista — så fyller AI i fälten automatiskt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {funds.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fond att fylla i</label>
              <Select value={selectedFundId} onValueChange={setSelectedFundId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {funds.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name || 'Namnlös fond'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Klistra in text</label>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Klistra in text från ett faktablad, Morningstar, fondkurssida, innehållslista..."
              className="min-h-32 text-sm resize-none"
            />
          </div>

          {extracted && (
            <div className="rounded-md bg-muted/50 border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {fieldCount} fält hittades
              </p>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {Object.entries(extracted).map(([k, v]) => {
                  const displayVal = Array.isArray(v)
                    ? `${(v as TopHolding[]).length} innehav`
                    : typeof v === 'object' && v !== null
                    ? `${Object.keys(v).length} poster`
                    : String(v);
                  return (
                    <div key={k} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-muted-foreground shrink-0">{fieldLabel[k] ?? k}</span>
                      <span className="truncate font-mono text-right">{displayVal}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          {extracted ? (
            <Button onClick={apply} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Applicera {fieldCount} fält
            </Button>
          ) : (
            <Button onClick={analyze} disabled={loading || !text.trim()} className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {loading ? 'Analyserar...' : 'Analysera med AI'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Editable table ────────────────────────────────────────────────────────────

interface EditableTableProps {
  funds: FundItem[];
  onChange: (id: string, patch: Partial<FundItem>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onAIClick: (fundId: string) => void;
  visibleRows: Set<string>;
  customRowDefs: CustomRowDef[];
}

function EditableTable({ funds, onChange, onDelete, onAdd, onAIClick, visibleRows, customRowDefs }: EditableTableProps) {
  const show = (id: string) => visibleRows.has(id);
  const maxH = show('top_holdings') ? Math.max(...funds.map(f => f.top_holdings?.length ?? 0), 0) : 0;

  const upd = (id: string, key: keyof FundItem, val: any) => onChange(id, { [key]: val });

  const updCustom = (fundId: string, rowId: string, val: string) => {
    const fund = funds.find(f => f.id === fundId);
    if (!fund) return;
    onChange(fundId, { custom_fields: { ...(fund.custom_fields ?? {}), [rowId]: val } });
  };

  const updHolding = (id: string, i: number, field: keyof TopHolding, val: string | number) => {
    const fund = funds.find(f => f.id === id);
    if (!fund) return;
    const arr = [...(fund.top_holdings ?? [])];
    arr[i] = { ...arr[i], [field]: val };
    onChange(id, { top_holdings: arr });
  };

  const addHoldingRow = () => {
    for (const f of funds) onChange(f.id, { top_holdings: [...(f.top_holdings ?? []), { name: '', weight: 0 }] });
  };

  const removeHoldingRow = (i: number) => {
    for (const f of funds) { const arr = [...(f.top_holdings ?? [])]; arr.splice(i, 1); onChange(f.id, { top_holdings: arr }); }
  };

  if (funds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-muted-foreground">Inga fonder ännu.</p>
        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Lägg till fond
        </Button>
      </div>
    );
  }

  const LabelCell = ({ label }: { label: string }) => (
    <td className="sticky left-0 z-10 bg-background px-4 py-1.5 text-sm text-muted-foreground whitespace-nowrap w-36 min-w-36">{label}</td>
  );

  const cols = funds.length + 2;
  const showGeneralSection = ROW_SECTIONS[0].rows.some(r => show(r.id));
  const showReturnsSection = ROW_SECTIONS[1].rows.some(r => show(r.id));
  const showRiskSection = ROW_SECTIONS[2].rows.some(r => show(r.id));
  const showHoldingsSection = show('holdings_count') || show('top_holdings');

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/20">
            <th className="sticky left-0 z-10 bg-muted/20 w-36 min-w-36" />
            {funds.map(f => (
              <th key={f.id} className="px-3 py-2 min-w-44 text-left">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold truncate">{f.name || <span className="text-muted-foreground font-normal italic">Ny fond</span>}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" title="Fyll i med AI" onClick={() => onAIClick(f.id)}>
                      <Sparkles className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Ta bort {f.name || 'fonden'}?</AlertDialogTitle>
                          <AlertDialogDescription>All data tas bort permanent.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Avbryt</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(f.id)}>Ta bort</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </th>
            ))}
            <th className="px-3 py-2">
              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs whitespace-nowrap" onClick={onAdd}>
                <Plus className="h-3 w-3" /> Lägg till
              </Button>
            </th>
          </tr>
        </thead>
        <tbody>
          {showGeneralSection && <SectionRow label="Allmänt" colSpan={cols} />}
          {show('name') && <tr className="border-t hover:bg-muted/5 transition-colors"><LabelCell label="Namn" />{funds.map(f => <td key={f.id} className="px-3 py-0.5"><TextCell value={f.name} onChange={v => upd(f.id, 'name', v ?? '')} placeholder="Fondnamn" /></td>)}<td /></tr>}
          {show('ticker') && <tr className="border-t hover:bg-muted/5 transition-colors"><LabelCell label="Ticker" />{funds.map(f => <td key={f.id} className="px-3 py-0.5"><TextCell value={f.ticker} onChange={v => upd(f.id, 'ticker', v)} placeholder="EUNL" /></td>)}<td /></tr>}
          {show('expense_ratio') && <tr className="border-t hover:bg-muted/5 transition-colors"><LabelCell label="Avgift (TER)" />{funds.map(f => <td key={f.id} className="px-3 py-0.5"><NumCell value={f.expense_ratio} onChange={v => upd(f.id, 'expense_ratio', v)} suffix="%" /></td>)}<td /></tr>}
          {show('aum') && <tr className="border-t hover:bg-muted/5 transition-colors"><LabelCell label="AUM (M)" />{funds.map(f => <td key={f.id} className="px-3 py-0.5"><NumCell value={f.aum} onChange={v => upd(f.id, 'aum', v)} /></td>)}<td /></tr>}
          {show('currency') && <tr className="border-t hover:bg-muted/5 transition-colors"><LabelCell label="Valuta" />{funds.map(f => <td key={f.id} className="px-3 py-0.5"><TextCell value={f.currency} onChange={v => upd(f.id, 'currency', v)} placeholder="SEK" /></td>)}<td /></tr>}
          {show('distribution_type') && (
            <tr className="border-t hover:bg-muted/5 transition-colors">
              <LabelCell label="Typ" />
              {funds.map(f => (
                <td key={f.id} className="px-3 py-0.5">
                  <Select value={f.distribution_type ?? ''} onValueChange={v => upd(f.id, 'distribution_type', v || null)}>
                    <SelectTrigger className="h-7 text-xs border-0 border-b border-transparent hover:border-border focus:border-primary rounded-none px-0 shadow-none">
                      <SelectValue placeholder="–" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accumulating">Ackumulerande</SelectItem>
                      <SelectItem value="distributing">Utdelande</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              ))}
              <td />
            </tr>
          )}
          {show('benchmark') && <tr className="border-t hover:bg-muted/5 transition-colors"><LabelCell label="Benchmark" />{funds.map(f => <td key={f.id} className="px-3 py-0.5"><TextCell value={f.benchmark} onChange={v => upd(f.id, 'benchmark', v)} placeholder="MSCI World" /></td>)}<td /></tr>}
          {show('inception_date') && <tr className="border-t hover:bg-muted/5 transition-colors"><LabelCell label="Startdatum" />{funds.map(f => <td key={f.id} className="px-3 py-0.5"><DateCell value={f.inception_date} onChange={v => upd(f.id, 'inception_date', v)} /></td>)}<td /></tr>}

          {showReturnsSection && <SectionRow label="Avkastning" colSpan={cols} />}
          {([
            ['return_ytd', 'YTD'], ['return_1y', '1 år'], ['return_3y', '3 år (p.a.)'],
            ['return_5y', '5 år (p.a.)'], ['return_10y', '10 år (p.a.)'],
          ] as [keyof FundItem, string][]).filter(([key]) => show(key as string)).map(([key, label]) => (
            <tr key={key as string} className="border-t hover:bg-muted/5 transition-colors">
              <LabelCell label={label} />
              {funds.map(f => <td key={f.id} className="px-3 py-0.5"><ReturnCell value={f[key] as number | null} onChange={v => upd(f.id, key, v)} /></td>)}
              <td />
            </tr>
          ))}

          {showRiskSection && <SectionRow label="Risk" colSpan={cols} />}
          {([
            ['volatility', 'Volatilitet', '%'], ['sharpe_ratio', 'Sharpe-kvot', undefined],
            ['beta', 'Beta', undefined], ['max_drawdown', 'Max nedgång', '%'],
          ] as [keyof FundItem, string, string | undefined][]).filter(([key]) => show(key as string)).map(([key, label, suffix]) => (
            <tr key={key as string} className="border-t hover:bg-muted/5 transition-colors">
              <LabelCell label={label} />
              {funds.map(f => <td key={f.id} className="px-3 py-0.5"><NumCell value={f[key] as number | null} onChange={v => upd(f.id, key, v)} suffix={suffix} /></td>)}
              <td />
            </tr>
          ))}

          {show('geographic_allocation') && (
            <>
              <SectionRow label="Geografisk allokering" colSpan={cols} />
              <tr className="border-t hover:bg-muted/5 transition-colors">
                <LabelCell label="Allokering" />
                {funds.map(f => <td key={f.id} className="px-3 py-1"><AllocationCell value={f.geographic_allocation as Record<string, number>} onChange={v => upd(f.id, 'geographic_allocation', v)} /></td>)}
                <td />
              </tr>
            </>
          )}

          {show('sector_allocation') && (
            <>
              <SectionRow label="Sektorallokering" colSpan={cols} />
              <tr className="border-t hover:bg-muted/5 transition-colors">
                <LabelCell label="Allokering" />
                {funds.map(f => <td key={f.id} className="px-3 py-1"><AllocationCell value={f.sector_allocation as Record<string, number>} onChange={v => upd(f.id, 'sector_allocation', v)} /></td>)}
                <td />
              </tr>
            </>
          )}

          {showHoldingsSection && <SectionRow label="Innehav" colSpan={cols} />}
          {show('holdings_count') && (
            <tr className="border-t hover:bg-muted/5 transition-colors">
              <LabelCell label="Antal innehav" />
              {funds.map(f => <td key={f.id} className="px-3 py-0.5"><NumCell value={f.holdings_count} onChange={v => upd(f.id, 'holdings_count', v != null ? Math.round(v) : null)} /></td>)}
              <td />
            </tr>
          )}

          {show('top_holdings') && Array.from({ length: maxH }).map((_, i) => (
            <tr key={`h-${i}`} className="border-t hover:bg-muted/5 transition-colors">
              <td className="sticky left-0 z-10 bg-background px-4 py-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span>#{i + 1}</span>
                  <button onClick={() => removeHoldingRow(i)} className="text-muted-foreground/50 hover:text-destructive ml-1"><X className="h-3 w-3" /></button>
                </div>
              </td>
              {funds.map(f => {
                const h = f.top_holdings?.[i];
                return (
                  <td key={f.id} className="px-3 py-0.5">
                    <div className="flex items-center gap-1.5">
                      <input type="text" value={h?.name ?? ''} placeholder="Namn" onChange={e => updHolding(f.id, i, 'name', e.target.value)} className="flex-1 min-w-0 bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none text-sm py-1 px-0 transition-colors" />
                      <input type="number" value={h?.weight ?? ''} onChange={e => updHolding(f.id, i, 'weight', parseFloat(e.target.value) || 0)} className="w-12 bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary outline-none text-xs py-1 px-0 text-right tabular-nums transition-colors" />
                      <span className="text-xs text-muted-foreground shrink-0">%</span>
                    </div>
                  </td>
                );
              })}
              <td />
            </tr>
          ))}

          {show('top_holdings') && (
            <tr className="border-t">
              <td colSpan={cols} className="px-4 py-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={addHoldingRow}>
                  <Plus className="h-3 w-3" /> Lägg till innehavsrad
                </Button>
              </td>
            </tr>
          )}

          {customRowDefs.length > 0 && <SectionRow label="Egna rader" colSpan={cols} />}
          {customRowDefs.map(def => (
            <tr key={def.id} className="border-t hover:bg-muted/5 transition-colors">
              <LabelCell label={def.label} />
              {funds.map(f => (
                <td key={f.id} className="px-3 py-0.5">
                  <TextCell value={f.custom_fields?.[def.id] ?? null} onChange={v => updCustom(f.id, def.id, v ?? '')} />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Compare() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [localFunds, setLocalFunds] = useState<FundItem[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [visibleRows, setVisibleRows] = useState<Set<string>>(loadVisible);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPreselectedFund, setAiPreselectedFund] = useState<string | null>(null);

  const { data: comparisons = [] } = useQuery({
    queryKey: ['comparisons', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fund_comparisons' as any)
        .select('id, name, custom_row_defs')
        .eq('user_id', user!.id)
        .order('created_at');
      if (error) throw error;
      return data as Comparison[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (comparisons.length && !activeId) setActiveId(comparisons[0].id);
  }, [comparisons]);

  const { data: dbFunds = [] } = useQuery({
    queryKey: ['comparison-funds', activeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comparison_fund_items' as any)
        .select('*')
        .eq('comparison_id', activeId!)
        .order('sort_order');
      if (error) throw error;
      return (data as any[]).map(d => ({
        ...d,
        geographic_allocation: d.geographic_allocation ?? {},
        sector_allocation: d.sector_allocation ?? {},
        top_holdings: d.top_holdings ?? [],
        custom_fields: d.custom_fields ?? {},
      })) as FundItem[];
    },
    enabled: !!activeId,
  });

  useEffect(() => { setLocalFunds(dbFunds); }, [dbFunds]);

  const saveFund = useCallback(
    debounce(async (fund: FundItem) => {
      const { id, comparison_id, sort_order, ...rest } = fund;
      const { error } = await supabase.from('comparison_fund_items' as any).update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) toast.error(`Kunde inte spara: ${error.message}`);
    }, 800),
    []
  );

  const handleChange = (id: string, patch: Partial<FundItem>) => {
    setLocalFunds(prev => {
      const updated = prev.map(f => f.id === id ? { ...f, ...patch } : f);
      const fund = updated.find(f => f.id === id);
      if (fund) saveFund(fund);
      return updated;
    });
  };

  const handleAdd = async () => {
    if (!activeId) return;
    const { data, error } = await supabase.from('comparison_fund_items' as any).insert({
      comparison_id: activeId, user_id: user!.id, name: '',
      sort_order: localFunds.length,
      geographic_allocation: {}, sector_allocation: {}, top_holdings: [], custom_fields: {},
    }).select().single();
    if (error) { toast.error('Kunde inte lägga till fond'); return; }
    setLocalFunds(prev => [...prev, { ...(data as any), geographic_allocation: {}, sector_allocation: {}, top_holdings: [], custom_fields: {} }]);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('comparison_fund_items' as any).delete().eq('id', id);
    if (error) { toast.error('Kunde inte ta bort fond'); return; }
    setLocalFunds(prev => prev.filter(f => f.id !== id));
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const { data, error } = await supabase.from('fund_comparisons' as any).insert({ user_id: user!.id, name: newGroupName.trim() }).select().single();
    if (error) { toast.error('Kunde inte skapa grupp'); return; }
    qc.invalidateQueries({ queryKey: ['comparisons'] });
    setActiveId((data as any).id);
    setShowNewGroup(false);
    setNewGroupName('');
  };

  const renameGroup = async () => {
    if (!renameValue.trim() || !renamingId) return;
    await supabase.from('fund_comparisons' as any).update({ name: renameValue.trim() }).eq('id', renamingId);
    qc.invalidateQueries({ queryKey: ['comparisons'] });
    setRenamingId(null);
  };

  const deleteGroup = async (id: string) => {
    await supabase.from('fund_comparisons' as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['comparisons'] });
    if (activeId === id) setActiveId(comparisons.find(c => c.id !== id)?.id ?? null);
  };

  const toggleRow = (id: string) => {
    setVisibleRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveVisible(next);
      return next;
    });
  };

  const toggleSection = (sectionId: string, visible: boolean) => {
    const section = ROW_SECTIONS.find(s => s.id === sectionId);
    if (!section) return;
    setVisibleRows(prev => {
      const next = new Set(prev);
      if (visible) section.rows.forEach(r => next.add(r.id));
      else section.rows.forEach(r => next.delete(r.id));
      saveVisible(next);
      return next;
    });
  };

  const activeComparison = comparisons.find(c => c.id === activeId);
  const customRowDefs: CustomRowDef[] = (activeComparison?.custom_row_defs ?? []) as CustomRowDef[];

  const addCustomRow = async (label: string) => {
    if (!activeId) return;
    const newDef: CustomRowDef = { id: crypto.randomUUID(), label };
    const updated = [...customRowDefs, newDef];
    const { error } = await supabase.from('fund_comparisons' as any).update({ custom_row_defs: updated }).eq('id', activeId);
    if (error) { toast.error('Kunde inte lägga till rad'); return; }
    qc.invalidateQueries({ queryKey: ['comparisons'] });
  };

  const deleteCustomRow = async (rowId: string) => {
    if (!activeId) return;
    const updated = customRowDefs.filter(r => r.id !== rowId);
    const { error } = await supabase.from('fund_comparisons' as any).update({ custom_row_defs: updated }).eq('id', activeId);
    if (error) { toast.error('Kunde inte ta bort rad'); return; }
    qc.invalidateQueries({ queryKey: ['comparisons'] });
  };

  const openAI = (fundId?: string) => {
    if (fundId) setAiPreselectedFund(fundId);
    setAiOpen(true);
  };

  const revealRows = (rowIds: string[]) => {
    setVisibleRows(prev => {
      const next = new Set(prev);
      rowIds.forEach(id => next.add(id));
      saveVisible(next);
      return next;
    });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Jämför fonder & ETF:er</h1>
          <p className="text-muted-foreground text-sm">Skapa grupper och redigera alla fonder direkt i tabellen</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {comparisons.map(c => (
            <div key={c.id} className="relative group flex items-center">
              {renamingId === c.id ? (
                <form onSubmit={e => { e.preventDefault(); renameGroup(); }} className="flex items-center gap-1">
                  <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus className="h-8 w-36 text-sm" />
                  <Button type="submit" size="sm" variant="ghost" className="h-8 px-2">OK</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => setRenamingId(null)}>✕</Button>
                </form>
              ) : (
                <button
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                    activeId === c.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                  )}
                >
                  {c.name}
                </button>
              )}
              {renamingId !== c.id && (
                <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                  <button onClick={() => { setRenamingId(c.id); setRenameValue(c.name); }} className="rounded-full bg-background border h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm">
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="rounded-full bg-background border h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-destructive shadow-sm"><X className="h-2.5 w-2.5" /></button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort "{c.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>Gruppen och alla fonder i den tas bort permanent.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteGroup(c.id)}>Ta bort</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}

          {showNewGroup ? (
            <form onSubmit={e => { e.preventDefault(); createGroup(); }} className="flex items-center gap-1">
              <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} autoFocus placeholder="Gruppnamn..." className="h-8 w-40 text-sm" />
              <Button type="submit" size="sm" variant="ghost" className="h-8 px-2">OK</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowNewGroup(false); setNewGroupName(''); }}>✕</Button>
            </form>
          ) : (
            <Button variant="outline" size="sm" className="rounded-full gap-1 h-8" onClick={() => setShowNewGroup(true)}>
              <Plus className="h-3.5 w-3.5" /> Ny grupp
            </Button>
          )}
        </div>

        {activeComparison ? (
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => openAI()}>
                  <Sparkles className="h-3.5 w-3.5" />
                  AI-assistans
                </Button>
              </div>
              <EditableTable
                funds={localFunds}
                onChange={handleChange}
                onDelete={handleDelete}
                onAdd={handleAdd}
                onAIClick={fundId => openAI(fundId)}
                visibleRows={visibleRows}
                customRowDefs={customRowDefs}
              />
            </div>

            <div className="w-52 shrink-0 sticky top-6 self-start hidden lg:block">
              <RowPanel
                visibleRows={visibleRows}
                onToggleRow={toggleRow}
                onToggleSection={toggleSection}
                customRowDefs={customRowDefs}
                onAddCustomRow={addCustomRow}
                onDeleteCustomRow={deleteCustomRow}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">Skapa en jämförelsegrupp ovan för att komma igång.</p>
            <p className="text-sm text-muted-foreground mt-1">T.ex. "Globalfonder", "Räntefonder", "Teknik-ETF:er"</p>
          </div>
        )}
      </div>

      <AIFillDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        funds={localFunds}
        initialFundId={aiPreselectedFund}
        onApply={handleChange}
        onRevealRows={revealRows}
      />
    </MainLayout>
  );
}
