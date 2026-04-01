import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import type { InvestmentHolding } from './InvestmentHoldings';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (holdings: InvestmentHolding[]) => void;
}

export function InvestmentHoldingsImport({ open, onOpenChange, onImport }: Props) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<InvestmentHolding[]>([]);

  const parse = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-investment-holdings', {
        body: { text: text.trim() },
      });
      if (error) throw error;

      const holdings: InvestmentHolding[] = (data.holdings || []).map((h: any) => ({
        id: crypto.randomUUID(),
        name: h.name || '',
        ticker: h.ticker || undefined,
        weight_percent: h.weight_percent ?? undefined,
        category: h.category || 'company',
        conviction: 'medium',
        is_listed: true,
      }));
      setPreview(holdings);
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte tolka texten');
    } finally {
      setLoading(false);
    }
  };

  const confirm = () => {
    onImport(preview);
    setPreview([]);
    setText('');
    onOpenChange(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) { setPreview([]); setText(''); }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5" />
            Importera innehav med AI
          </DialogTitle>
        </DialogHeader>

        {preview.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {preview.length} innehav hittades. Granska och bekräfta importen.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Namn</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Andel %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{h.name}</TableCell>
                      <TableCell className="font-mono text-xs">{h.ticker || '—'}</TableCell>
                      <TableCell className="text-xs">{h.category}</TableCell>
                      <TableCell className="text-right font-mono">
                        {h.weight_percent != null ? `${h.weight_percent}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview([])}>Tillbaka</Button>
              <Button onClick={confirm}>Importera {preview.length} innehav</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Klistra in portföljinnehav från en årsredovisning, hemsida eller annat dokument. 
              AI:n tolkar texten och extraherar bolagsnamn, ticker och viktning.
            </p>
            <Textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Klistra in text här, t.ex:&#10;Volvo 15%&#10;Atlas Copco 12%&#10;Sandvik 8%&#10;Kassa 5%"
            />
            <Button onClick={parse} disabled={loading || !text.trim()} className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Tolka med AI
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
