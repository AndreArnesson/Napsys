import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Upload, Save, Check, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ImportDialog } from '@/components/portfolio/ImportDialog';

interface Holding {
  company_name: string;
  ticker: string;
  value_sek: number | null;
  shares_count: number | null;
  weight_percent: number | null;
  price: number | null;
  conviction: string;
  rationale: string;
  notes: string;
  future_plan: string;
}

const emptyHolding = (): Holding => ({
  company_name: '', ticker: '', value_sek: null, shares_count: null,
  weight_percent: null, price: null, conviction: '', rationale: '', notes: '', future_plan: '',
});

export default function BulkPortfolioUpdate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const sv = language === 'sv';

  const [updateDate, setUpdateDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [holdingsMap, setHoldingsMap] = useState<Record<string, Holding[]>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [showImport, setShowImport] = useState<string | null>(null);

  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portfolios')
        .select('id, name')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!user) return <Navigate to="/auth" />;

  const getHoldings = (pid: string) => holdingsMap[pid] || [];

  const setPortfolioHoldings = (pid: string, holdings: Holding[]) => {
    setHoldingsMap(prev => ({ ...prev, [pid]: holdings }));
    setSaved(prev => ({ ...prev, [pid]: false }));
  };

  const updateHolding = (pid: string, idx: number, field: keyof Holding, value: any) => {
    const next = [...getHoldings(pid)];
    (next[idx] as any)[field] = value;
    setPortfolioHoldings(pid, next);
  };

  const removeHolding = (pid: string, idx: number) => {
    setPortfolioHoldings(pid, getHoldings(pid).filter((_, i) => i !== idx));
  };

  const savePortfolio = async (pid: string, holdingsToSave: Holding[]) => {
    setSaving(s => ({ ...s, [pid]: true }));
    try {
      // Find existing snapshot for this portfolio+date, or create one
      const { data: existing } = await supabase
        .from('portfolio_snapshots')
        .select('id')
        .eq('portfolio_id', pid)
        .eq('snapshot_date', updateDate)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let snapshotId: string;
      if (existing) {
        snapshotId = existing.id;
      } else {
        const { data, error } = await supabase
          .from('portfolio_snapshots')
          .insert({ portfolio_id: pid, snapshot_date: updateDate })
          .select('id')
          .single();
        if (error) throw error;
        snapshotId = data.id;
      }

      await supabase.from('portfolio_holdings').delete().eq('snapshot_id', snapshotId);
      if (holdingsToSave.length > 0) {
        const { error } = await supabase.from('portfolio_holdings').insert(
          holdingsToSave.map(h => ({
            snapshot_id: snapshotId,
            company_name: h.company_name || null,
            ticker: h.ticker || null,
            value_sek: h.value_sek,
            shares_count: h.shares_count,
            weight_percent: h.weight_percent,
            price: h.price,
            conviction: h.conviction || null,
            rationale: h.rationale || null,
            notes: h.notes || null,
            future_plan: h.future_plan || null,
          } as any))
        );
        if (error) throw error;
      }

      setSaved(s => ({ ...s, [pid]: true }));
      queryClient.invalidateQueries({ queryKey: ['portfolio-snapshots', pid] });
    } catch {
      toast.error(sv ? 'Kunde inte spara' : 'Failed to save');
      throw new Error('save failed');
    } finally {
      setSaving(s => ({ ...s, [pid]: false }));
    }
  };

  const saveAll = async () => {
    if (!portfolios) return;
    const snapshot = { ...holdingsMap };
    let successCount = 0;
    for (const p of portfolios) {
      try {
        await savePortfolio(p.id, snapshot[p.id] || []);
        successCount++;
      } catch {
        // individual error already toasted
      }
    }
    if (successCount === portfolios.length) {
      toast.success(sv ? `Alla ${successCount} portföljer sparade` : `All ${successCount} portfolios saved`);
    }
  };

  const anyUnsaved = portfolios?.some(p => !saved[p.id] && (holdingsMap[p.id]?.length ?? 0) > 0);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/portfolio')} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {sv ? 'Tillbaka' : 'Back'}
          </Button>
          <h1 className="text-2xl font-bold">{sv ? 'Uppdatera portföljer' : 'Update portfolios'}</h1>
        </div>

        {/* Shared date */}
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30 flex-wrap">
          <label className="text-sm font-medium shrink-0">{sv ? 'Datum:' : 'Date:'}</label>
          <input
            type="date"
            value={updateDate}
            onChange={e => { setUpdateDate(e.target.value); setSaved({}); }}
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            {sv
              ? 'Alla portföljer sparas med detta datum. Om en snapshot redan finns för datumet skrivs den över.'
              : 'All portfolios will be saved with this date. Existing snapshots for the date will be overwritten.'}
          </p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">{sv ? 'Laddar...' : 'Loading...'}</p>
        ) : !portfolios?.length ? (
          <p className="text-muted-foreground">{sv ? 'Inga portföljer hittades.' : 'No portfolios found.'}</p>
        ) : (
          <>
            <Tabs defaultValue={portfolios[0]?.id}>
              <TabsList className="flex-wrap h-auto gap-1 mb-1">
                {portfolios.map(p => (
                  <TabsTrigger key={p.id} value={p.id} className="gap-1.5">
                    {p.name}
                    {saved[p.id] && <Check className="h-3 w-3 text-green-500" />}
                    {(holdingsMap[p.id]?.length ?? 0) > 0 && !saved[p.id] && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {portfolios.map(p => {
                const holdings = getHoldings(p.id);
                return (
                  <TabsContent key={p.id} value={p.id} className="space-y-3 mt-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm text-muted-foreground">
                        {holdings.length > 0
                          ? `${holdings.length} ${sv ? 'innehav' : 'holdings'}`
                          : sv ? 'Inga innehav ännu' : 'No holdings yet'}
                      </span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowImport(p.id)} className="gap-1.5">
                          <Upload className="h-3.5 w-3.5" />
                          {sv ? 'Importera' : 'Import'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPortfolioHoldings(p.id, [...holdings, emptyHolding()])} className="gap-1.5">
                          <Plus className="h-3.5 w-3.5" />
                          {sv ? 'Lägg till' : 'Add'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => savePortfolio(p.id, holdings)}
                          disabled={saving[p.id]}
                          className="gap-1.5"
                        >
                          {saving[p.id]
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : saved[p.id]
                              ? <Check className="h-3.5 w-3.5" />
                              : <Save className="h-3.5 w-3.5" />}
                          {sv ? 'Spara' : 'Save'}
                        </Button>
                      </div>
                    </div>

                    {holdings.length === 0 ? (
                      <div className="text-center py-10 rounded-lg border border-dashed text-muted-foreground">
                        <p className="text-sm">
                          {sv
                            ? 'Importera ett kontoutdrag eller lägg till innehav manuellt.'
                            : 'Import a statement or add holdings manually.'}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{sv ? 'Bolag' : 'Company'}</TableHead>
                              <TableHead>Ticker</TableHead>
                              <TableHead className="text-right">{sv ? 'Antal' : 'Shares'}</TableHead>
                              <TableHead className="text-right">{sv ? 'Värde (kr)' : 'Value (SEK)'}</TableHead>
                              <TableHead className="text-right">{sv ? 'Kurs' : 'Price'}</TableHead>
                              <TableHead className="w-8" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {holdings.map((h, i) => (
                              <TableRow key={i}>
                                <TableCell className="py-1">
                                  <Input
                                    value={h.company_name}
                                    onChange={e => updateHolding(p.id, i, 'company_name', e.target.value)}
                                    className="h-7 min-w-[130px]"
                                  />
                                </TableCell>
                                <TableCell className="py-1">
                                  <Input
                                    value={h.ticker}
                                    onChange={e => updateHolding(p.id, i, 'ticker', e.target.value)}
                                    className="h-7 w-20 font-mono"
                                  />
                                </TableCell>
                                <TableCell className="py-1">
                                  <NumericInput
                                    value={h.shares_count}
                                    onChange={v => updateHolding(p.id, i, 'shares_count', v ?? null)}
                                    className="h-7 text-right font-mono w-24"
                                  />
                                </TableCell>
                                <TableCell className="py-1">
                                  <NumericInput
                                    value={h.value_sek}
                                    onChange={v => updateHolding(p.id, i, 'value_sek', v ?? null)}
                                    className="h-7 text-right font-mono w-28"
                                  />
                                </TableCell>
                                <TableCell className="py-1">
                                  <NumericInput
                                    value={h.price}
                                    onChange={v => updateHolding(p.id, i, 'price', v ?? null)}
                                    className="h-7 text-right font-mono w-24"
                                  />
                                </TableCell>
                                <TableCell className="py-1">
                                  <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => removeHolding(p.id, i)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>

            {/* Save all */}
            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={saveAll}
                disabled={Object.values(saving).some(Boolean) || !anyUnsaved}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {sv ? 'Spara alla portföljer' : 'Save all portfolios'}
              </Button>
            </div>
          </>
        )}

        <ImportDialog
          open={!!showImport}
          onOpenChange={open => { if (!open) setShowImport(null); }}
          onImport={imported => {
            if (showImport) {
              setPortfolioHoldings(showImport, [...getHoldings(showImport), ...imported]);
              setShowImport(null);
            }
          }}
        />
      </div>
    </MainLayout>
  );
}
