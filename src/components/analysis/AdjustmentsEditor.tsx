import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Adjustment {
  id: string;
  description: string;
  amount: number;
  metric: 'ebit' | 'ebitda' | 'netIncome';
  year: number;
  quarter?: number;
}

interface AdjustmentsEditorProps {
  adjustments: Adjustment[];
  onAdjustmentsChange: (adjustments: Adjustment[]) => void;
  currency?: string;
}

const METRIC_LABELS: Record<string, string> = {
  ebit: 'EBIT',
  ebitda: 'EBITDA',
  netIncome: 'Nettoresultat',
};

export function AdjustmentsEditor({ adjustments, onAdjustmentsChange, currency = 'SEK' }: AdjustmentsEditorProps) {
  const [isOpen, setIsOpen] = useState(adjustments.length > 0);

  const addAdjustment = () => {
    const currentYear = new Date().getFullYear();
    const newAdj: Adjustment = {
      id: crypto.randomUUID(),
      description: '',
      amount: 0,
      metric: 'ebit',
      year: currentYear,
    };
    onAdjustmentsChange([...adjustments, newAdj]);
    setIsOpen(true);
  };

  const updateAdjustment = (id: string, field: keyof Adjustment, value: any) => {
    onAdjustmentsChange(
      adjustments.map(a => a.id === id ? { ...a, [field]: value } : a)
    );
  };

  const removeAdjustment = (id: string) => {
    onAdjustmentsChange(adjustments.filter(a => a.id !== id));
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <CardTitle className="text-lg flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Engångsjusteringar
              {adjustments.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {adjustments.length}
                </span>
              )}
            </CardTitle>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {adjustments.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Beskrivning</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Belopp (M{currency})</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Typ</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">År</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Kvartal</th>
                      <th className="py-2 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map(adj => (
                      <tr key={adj.id} className="border-b">
                        <td className="py-2 px-2">
                          <Input
                            placeholder="T.ex. Omstruktureringskostnad"
                            value={adj.description}
                            onChange={e => updateAdjustment(adj.id, 'description', e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={adj.amount === 0 ? '' : adj.amount}
                            onChange={e => {
                              const raw = e.target.value.replace(',', '.');
                              // Allow typing minus sign and partial numbers like "-" or "-."
                              if (raw === '' || raw === '-' || raw === '-.') {
                                updateAdjustment(adj.id, 'amount', raw === '' ? 0 : raw as any);
                                return;
                              }
                              const v = parseFloat(raw);
                              updateAdjustment(adj.id, 'amount', isNaN(v) ? 0 : v);
                            }}
                            className="h-8 text-sm font-mono w-24"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Select value={adj.metric} onValueChange={v => updateAdjustment(adj.id, 'metric', v)}>
                            <SelectTrigger className="h-8 text-sm w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ebit">EBIT</SelectItem>
                              <SelectItem value="ebitda">EBITDA</SelectItem>
                              <SelectItem value="netIncome">Nettoresultat</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={adj.year}
                            onChange={e => updateAdjustment(adj.id, 'year', parseInt(e.target.value) || new Date().getFullYear())}
                            className="h-8 text-sm font-mono w-20"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Select
                            value={adj.quarter ? String(adj.quarter) : 'none'}
                            onValueChange={v => updateAdjustment(adj.id, 'quarter', v === 'none' ? undefined : parseInt(v))}
                          >
                            <SelectTrigger className="h-8 text-sm w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Helår</SelectItem>
                              <SelectItem value="1">Q1</SelectItem>
                              <SelectItem value="2">Q2</SelectItem>
                              <SelectItem value="3">Q3</SelectItem>
                              <SelectItem value="4">Q4</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeAdjustment(adj.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-1" onClick={addAdjustment}>
              <Plus className="h-3.5 w-3.5" />
              Lägg till justering
            </Button>
            {adjustments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Positivt belopp = kostnad som justeras bort (läggs tillbaka). T.ex. +12 M{currency} på EBIT betyder att en engångskostnad på 12 M{currency} tas bort.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
