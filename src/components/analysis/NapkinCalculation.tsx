import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MOSBadge } from '@/components/company/MOSBadge';
import { Plus, Minus } from 'lucide-react';

export interface NapkinAssumption {
  year: number;
  revenue?: number;       // MSEK
  netMargin?: number;     // percent (e.g. 12 = 12%)
  peTarget?: number;      // exit P/E multiple
}

interface NapkinCalculationProps {
  currentPrice: number;
  sharesOutstanding: number; // shares
  currency?: string;
  latestRevenue?: number;    // MSEK, used to suggest defaults
  latestNetMargin?: number;  // 0..1
  assumptions: NapkinAssumption[];
  onAssumptionsChange: (a: NapkinAssumption[]) => void;
}

export function NapkinCalculation({
  currentPrice,
  sharesOutstanding,
  currency = 'SEK',
  latestRevenue,
  latestNetMargin,
  assumptions,
  onAssumptionsChange,
}: NapkinCalculationProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const currentYear = new Date().getFullYear();

  // Auto-seed one row if empty
  const rows = assumptions.length === 0
    ? [{
        year: currentYear + 3,
        revenue: latestRevenue,
        netMargin: latestNetMargin ? latestNetMargin * 100 : 10,
        peTarget: 15,
      }]
    : assumptions;

  const updateRow = (idx: number, field: keyof NapkinAssumption, value: number | undefined) => {
    const next = [...rows];
    next[idx] = { ...next[idx], [field]: value };
    onAssumptionsChange(next);
  };

  const addRow = () => {
    const lastYear = Math.max(...rows.map(r => r.year), currentYear);
    onAssumptionsChange([
      ...rows,
      {
        year: lastYear + 1,
        revenue: rows[rows.length - 1]?.revenue,
        netMargin: rows[rows.length - 1]?.netMargin ?? 10,
        peTarget: rows[rows.length - 1]?.peTarget ?? 15,
      },
    ]);
  };

  const removeRow = (idx: number) => {
    onAssumptionsChange(rows.filter((_, i) => i !== idx));
  };

  const calculations = useMemo(() => {
    return rows.map(r => {
      const revenue = r.revenue ?? 0;                   // MSEK
      const margin = (r.netMargin ?? 0) / 100;
      const pe = r.peTarget ?? 0;
      const netIncome = revenue * margin;               // MSEK
      const marketCap = netIncome * pe;                 // MSEK
      const fairPrice = sharesOutstanding > 0 ? (marketCap * 1_000_000) / sharesOutstanding : 0;
      const mos = currentPrice > 0 && fairPrice > 0
        ? ((fairPrice - currentPrice) / fairPrice) * 100
        : null;
      const eps = sharesOutstanding > 0 ? (netIncome * 1_000_000) / sharesOutstanding : 0;
      return { netIncome, marketCap, fairPrice, mos, eps };
    });
  }, [rows, sharesOutstanding, currentPrice]);

  const fmtMSEK = (v: number) => {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)} Mdr`;
    return `${v.toFixed(0)} M`;
  };

  const fmtPrice = (v: number) =>
    v > 0 ? `${v.toFixed(2)} ${currency}` : '—';

  return (
    <Card className="border-2 border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              🧻 Servettkalkyl
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Snabb värdering: Omsättning × Vinstmarginal × P/E
            </p>
          </div>
          <Badge variant="outline" className="text-xs">Enkelt läge</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row, idx) => {
          const calc = calculations[idx];
          return (
            <div
              key={idx}
              className="rounded-lg border bg-muted/30 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={row.year}
                  onChange={(e) => updateRow(idx, 'year', parseInt(e.target.value) || currentYear)}
                  className="w-24 h-8 font-mono font-semibold text-base"
                />
                {rows.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeRow(idx)} className="h-7 px-2">
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Omsättning (MSEK)</Label>
                  <NumericInput
                    value={row.revenue}
                    onChange={(v) => updateRow(idx, 'revenue', v)}
                    placeholder="t.ex. 1000"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Vinstmarginal (%)</Label>
                  <NumericInput
                    value={row.netMargin}
                    onChange={(v) => updateRow(idx, 'netMargin', v)}
                    placeholder="t.ex. 12"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">P/E (mål)</Label>
                  <NumericInput
                    value={row.peTarget}
                    onChange={(v) => updateRow(idx, 'peTarget', v)}
                    placeholder="t.ex. 15"
                    className="font-mono"
                  />
                </div>
              </div>

              {/* Results */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Vinst</p>
                  <p className="font-mono font-medium text-sm">{fmtMSEK(calc.netIncome)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Börsvärde</p>
                  <p className="font-mono font-medium text-sm">{fmtMSEK(calc.marketCap)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Riktkurs</p>
                  <p className="font-mono font-medium text-sm">{fmtPrice(calc.fairPrice)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">MoS</p>
                  {calc.mos !== null ? (
                    <MOSBadge value={calc.mos} size="sm" showLabel={false} />
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
              </div>

              {showAdvanced && (
                <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>EPS</span>
                    <span className="font-mono">{calc.eps > 0 ? `${calc.eps.toFixed(2)} ${currency}` : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Aktuell kurs</span>
                    <span className="font-mono">{fmtPrice(currentPrice)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Lägg till år
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(s => !s)}
            className="text-xs"
          >
            {showAdvanced ? 'Dölj detaljer' : 'Visa mer detaljer'}
          </Button>
        </div>

        {(currentPrice <= 0 || sharesOutstanding <= 0) && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Fyll i kurs och antal aktier i sidopanelen för att räkna ut MoS.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
