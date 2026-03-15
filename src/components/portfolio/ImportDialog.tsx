import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Holding {
  company_name: string;
  ticker: string;
  weight_percent: number | null;
  value_sek: number | null;
  conviction: string;
  rationale: string;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (holdings: Holding[]) => void;
}

export function ImportDialog({ open, onOpenChange, onImport }: Props) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [preview, setPreview] = useState<Holding[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseFile = async (file: File) => {
    setLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const fileType = ['xlsx', 'xls'].includes(ext) ? 'xlsx' : ext === 'pdf' ? 'pdf' : 'csv';

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('parse-portfolio-import', {
        body: { fileBase64: base64, fileType },
      });
      if (error) throw error;

      const holdings = (data.holdings || []).map((h: any) => ({
        company_name: h.company_name || '',
        ticker: h.ticker || '',
        weight_percent: h.weight_percent ?? null,
        value_sek: h.value_sek ?? null,
        conviction: '',
        rationale: '',
        notes: '',
      }));
      setPreview(holdings);
    } catch (err: any) {
      toast.error(err.message || t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const parseFreeText = async () => {
    if (!freeText.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-portfolio-import', {
        body: { freeText: freeText.trim() },
      });
      if (error) throw error;

      const holdings = (data.holdings || []).map((h: any) => ({
        company_name: h.company_name || '',
        ticker: h.ticker || '',
        weight_percent: h.weight_percent ?? null,
        value_sek: h.value_sek ?? null,
        conviction: '',
        rationale: '',
        notes: '',
      }));
      setPreview(holdings);
    } catch (err: any) {
      toast.error(err.message || t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = () => {
    onImport(preview);
    setPreview([]);
    setFreeText('');
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setPreview([]);
      setFreeText('');
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.portfolio.importStatement}</DialogTitle>
        </DialogHeader>

        {preview.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.portfolio.importPreview}</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.portfolio.companyName}</TableHead>
                    <TableHead>{t.portfolio.ticker}</TableHead>
                    <TableHead>{t.portfolio.weightPercent}</TableHead>
                    <TableHead>{t.portfolio.valueSek}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell>{h.company_name}</TableCell>
                      <TableCell>{h.ticker || '-'}</TableCell>
                      <TableCell>{h.weight_percent != null ? `${h.weight_percent}%` : '-'}</TableCell>
                      <TableCell>{h.value_sek != null ? `${h.value_sek.toLocaleString('sv-SE')} kr` : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview([])}>{t.common.back}</Button>
              <Button onClick={confirmImport}>{t.portfolio.confirmImport}</Button>
            </DialogFooter>
          </div>
        ) : (
          <Tabs defaultValue="file">
            <TabsList className="w-full">
              <TabsTrigger value="file" className="flex-1">{t.portfolio.uploadFile}</TabsTrigger>
              <TabsTrigger value="text" className="flex-1">{t.portfolio.freeText}</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="space-y-4">
              <p className="text-sm text-muted-foreground">{t.portfolio.uploadDescription}</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,.pdf,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])}
              />
              <Button variant="outline" className="w-full h-24" onClick={() => fileRef.current?.click()} disabled={loading}>
                {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6" />
                    <span>{t.portfolio.clickToUpload}</span>
                  </div>
                )}
              </Button>
            </TabsContent>
            <TabsContent value="text" className="space-y-4">
              <p className="text-sm text-muted-foreground">{t.portfolio.freeTextDescription}</p>
              <Textarea
                rows={6}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder={t.portfolio.freeTextPlaceholder}
              />
              <Button onClick={parseFreeText} disabled={loading || !freeText.trim()} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t.portfolio.parseText}
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
