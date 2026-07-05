import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';

interface TopHolding {
  name: string;
  weight: number;
}

interface FundMetadata {
  id?: string;
  company_id: string;
  user_id: string;
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
}

interface Props {
  companyId: string;
}

function AllocationEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const add = () => {
    const k = newKey.trim();
    const v = parseFloat(newVal);
    if (!k || isNaN(v)) return;
    onChange({ ...value, [k]: v });
    setNewKey('');
    setNewVal('');
  };

  const remove = (k: string) => {
    const copy = { ...value };
    delete copy[k];
    onChange(copy);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="space-y-1">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <Input
              value={k}
              onChange={(e) => {
                const copy = { ...value };
                delete copy[k];
                copy[e.target.value] = v;
                onChange(copy);
              }}
              className="h-7 text-sm flex-1"
            />
            <Input
              type="number"
              value={v}
              onChange={(e) => onChange({ ...value, [k]: parseFloat(e.target.value) || 0 })}
              className="h-7 text-sm w-20"
            />
            <span className="text-muted-foreground text-sm">%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(k)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Namn"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="h-7 text-sm flex-1"
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Input
          type="number"
          placeholder="%"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          className="h-7 text-sm w-20"
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  step,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step={step ?? 0.01}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          className="h-8 text-sm pr-8"
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function FundMetadataEditor({ companyId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['fund_metadata', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fund_metadata' as any)
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return data as FundMetadata | null;
    },
  });

  const [form, setForm] = useState<FundMetadata>({
    company_id: companyId,
    user_id: user!.id,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        ...existing,
        geographic_allocation: (existing.geographic_allocation as Record<string, number>) ?? {},
        sector_allocation: (existing.sector_allocation as Record<string, number>) ?? {},
        top_holdings: (existing.top_holdings as TopHolding[]) ?? [],
      });
    }
  }, [existing]);

  const set = <K extends keyof FundMetadata>(key: K, value: FundMetadata[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        company_id: companyId,
        user_id: user!.id,
        geographic_allocation: form.geographic_allocation ?? {},
        sector_allocation: form.sector_allocation ?? {},
        top_holdings: form.top_holdings ?? [],
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) {
        const { error } = await supabase
          .from('fund_metadata' as any)
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fund_metadata' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund_metadata', companyId] });
      toast.success('Fonddata sparad');
    },
    onError: () => toast.error('Kunde inte spara fonddata'),
  });

  const addHolding = () =>
    setForm((f) => ({
      ...f,
      top_holdings: [...(f.top_holdings ?? []), { name: '', weight: 0 }],
    }));

  const updateHolding = (i: number, field: keyof TopHolding, value: string | number) =>
    setForm((f) => {
      const holdings = [...(f.top_holdings ?? [])];
      holdings[i] = { ...holdings[i], [field]: value };
      return { ...f, top_holdings: holdings };
    });

  const removeHolding = (i: number) =>
    setForm((f) => ({
      ...f,
      top_holdings: (f.top_holdings ?? []).filter((_, idx) => idx !== i),
    }));

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">Laddar...</div>;

  return (
    <div className="space-y-6">
      {/* General */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Allmänt</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <NumField label="Avgift / TER" value={form.expense_ratio} onChange={(v) => set('expense_ratio', v)} suffix="%" />
          <NumField label="AUM (miljoner)" value={form.aum} onChange={(v) => set('aum', v)} step={1} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Valuta</Label>
            <Input
              value={form.currency ?? ''}
              onChange={(e) => set('currency', e.target.value.toUpperCase() || null)}
              className="h-8 text-sm"
              placeholder="SEK"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Startdatum</Label>
            <Input
              type="date"
              value={form.inception_date ?? ''}
              onChange={(e) => set('inception_date', e.target.value || null)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Benchmarkindex</Label>
            <Input
              value={form.benchmark ?? ''}
              onChange={(e) => set('benchmark', e.target.value || null)}
              className="h-8 text-sm"
              placeholder="MSCI World"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Typ</Label>
            <Select
              value={form.distribution_type ?? ''}
              onValueChange={(v) => set('distribution_type', (v || null) as any)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Välj typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accumulating">Ackumulerande</SelectItem>
                <SelectItem value="distributing">Utdelande</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Avkastning</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <NumField label="YTD" value={form.return_ytd} onChange={(v) => set('return_ytd', v)} suffix="%" />
          <NumField label="1 år" value={form.return_1y} onChange={(v) => set('return_1y', v)} suffix="%" />
          <NumField label="3 år (p.a.)" value={form.return_3y} onChange={(v) => set('return_3y', v)} suffix="%" />
          <NumField label="5 år (p.a.)" value={form.return_5y} onChange={(v) => set('return_5y', v)} suffix="%" />
          <NumField label="10 år (p.a.)" value={form.return_10y} onChange={(v) => set('return_10y', v)} suffix="%" />
        </CardContent>
      </Card>

      {/* Risk */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Risk</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <NumField label="Volatilitet" value={form.volatility} onChange={(v) => set('volatility', v)} suffix="%" />
          <NumField label="Sharpe-kvot" value={form.sharpe_ratio} onChange={(v) => set('sharpe_ratio', v)} />
          <NumField label="Beta" value={form.beta} onChange={(v) => set('beta', v)} />
          <NumField label="Max nedgång" value={form.max_drawdown} onChange={(v) => set('max_drawdown', v)} suffix="%" />
        </CardContent>
      </Card>

      {/* Allocations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Geografisk allokering</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationEditor
              label=""
              value={(form.geographic_allocation as Record<string, number>) ?? {}}
              onChange={(v) => set('geographic_allocation', v as any)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sektorallokering</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationEditor
              label=""
              value={(form.sector_allocation as Record<string, number>) ?? {}}
              onChange={(v) => set('sector_allocation', v as any)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Holdings */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Innehav</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 w-40">
            <Label className="text-xs text-muted-foreground">Antal innehav</Label>
            <Input
              type="number"
              value={form.holdings_count ?? ''}
              onChange={(e) => set('holdings_count', e.target.value === '' ? null : parseInt(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-sm font-medium">Topp-innehav</Label>
            {(form.top_holdings ?? []).map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={h.name}
                  onChange={(e) => updateHolding(i, 'name', e.target.value)}
                  placeholder="Namn"
                  className="h-7 text-sm flex-1"
                />
                <Input
                  type="number"
                  value={h.weight}
                  onChange={(e) => updateHolding(i, 'weight', parseFloat(e.target.value) || 0)}
                  className="h-7 text-sm w-20"
                />
                <span className="text-muted-foreground text-sm">%</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeHolding(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={addHolding}>
              <Plus className="h-3 w-3" />
              Lägg till innehav
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={isPending} className="gap-2">
          {isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="h-4 w-4" />}
          Spara fonddata
        </Button>
      </div>
    </div>
  );
}
