import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

export interface EstimateRow {
  id?: string;
  year: number;
  quarter?: number;
  revenue?: number;
  ebit?: number;
  isProjection?: boolean;
}

interface EstimatesEditorProps {
  estimates: EstimateRow[];
  onChange: (estimates: EstimateRow[]) => void;
  historicalData?: EstimateRow[];
  currency?: string;
}

export function EstimatesEditor({ 
  estimates, 
  onChange, 
  historicalData = [],
  currency = 'SEK' 
}: EstimatesEditorProps) {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<'yearly' | 'quarterly'>('yearly');
  
  const currentYear = new Date().getFullYear();
  const projectionYears = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4];

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return '';
    return new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-US').format(value);
  };

  const parseCurrency = (value: string): number | undefined => {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? undefined : parsed;
  };

  const handleChange = (index: number, field: keyof EstimateRow, value: any) => {
    const updated = [...estimates];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addYear = () => {
    const maxYear = Math.max(...estimates.map(e => e.year), currentYear - 1);
    const newEstimate: EstimateRow = {
      year: maxYear + 1,
      isProjection: true,
    };
    onChange([...estimates, newEstimate]);
  };

  const addQuarter = () => {
    const lastEstimate = estimates[estimates.length - 1];
    const year = lastEstimate?.year || currentYear;
    const quarter = lastEstimate?.quarter ? (lastEstimate.quarter % 4) + 1 : 1;
    const newYear = lastEstimate?.quarter === 4 ? year + 1 : year;
    
    const newEstimate: EstimateRow = {
      year: newYear,
      quarter,
      isProjection: true,
    };
    onChange([...estimates, newEstimate]);
  };

  const removeRow = (index: number) => {
    const updated = estimates.filter((_, i) => i !== index);
    onChange(updated);
  };

  const calculateMargin = (revenue?: number, ebit?: number) => {
    if (!revenue || !ebit) return '—';
    return `${((ebit / revenue) * 100).toFixed(1)}%`;
  };

  // Combine historical + estimates for display
  const allData = [...historicalData.map(h => ({ ...h, isProjection: false })), ...estimates];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Estimates & Projections
            </CardTitle>
            <CardDescription>
              Set your revenue and EBIT assumptions
            </CardDescription>
          </div>
          <Select value={mode} onValueChange={(v) => setMode(v as 'yearly' | 'quarterly')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yearly">{t.common.year}</SelectItem>
              <SelectItem value="quarterly">{t.common.quarter}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>{t.financials.revenue} (MSEK)</TableHead>
              <TableHead>{t.financials.ebit} (MSEK)</TableHead>
              <TableHead>Margin</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Historical data (read-only) */}
            {historicalData.slice(-3).map((row, i) => (
              <TableRow key={`hist-${i}`} className="bg-muted/30">
                <TableCell className="font-medium text-muted-foreground">
                  {row.quarter ? `${row.year} Q${row.quarter}` : row.year}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {formatCurrency(row.revenue)}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {formatCurrency(row.ebit)}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {calculateMargin(row.revenue, row.ebit)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            ))}
            
            {/* Editable estimates */}
            {estimates.map((row, index) => (
              <TableRow key={index} className="bg-primary/5">
                <TableCell className="font-medium">
                  {mode === 'quarterly' ? (
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        value={row.year}
                        onChange={(e) => handleChange(index, 'year', parseInt(e.target.value))}
                        className="w-20 h-8"
                      />
                      <Select
                        value={row.quarter?.toString() || '1'}
                        onValueChange={(v) => handleChange(index, 'quarter', parseInt(v))}
                      >
                        <SelectTrigger className="w-16 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Q1</SelectItem>
                          <SelectItem value="2">Q2</SelectItem>
                          <SelectItem value="3">Q3</SelectItem>
                          <SelectItem value="4">Q4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <Input
                      type="number"
                      value={row.year}
                      onChange={(e) => handleChange(index, 'year', parseInt(e.target.value))}
                      className="w-24 h-8"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    placeholder="Revenue"
                    value={row.revenue || ''}
                    onChange={(e) => handleChange(index, 'revenue', parseCurrency(e.target.value))}
                    className="w-28 h-8 font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    placeholder="EBIT"
                    value={row.ebit || ''}
                    onChange={(e) => handleChange(index, 'ebit', parseCurrency(e.target.value))}
                    className="w-28 h-8 font-mono"
                  />
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {calculateMargin(row.revenue, row.ebit)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeRow(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={mode === 'quarterly' ? addQuarter : addYear}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Add {mode === 'quarterly' ? 'Quarter' : 'Year'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
