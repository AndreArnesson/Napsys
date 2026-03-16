import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

interface KeyData {
  ticker?: string;
  reportingCurrency: string;
  tradingCurrency: string;
  currentPrice?: number | null;
  exchange?: string;
  companyType?: string;
}

interface StockPriceResult {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  name: string;
}

interface KeyDataEditorProps {
  data: KeyData;
  onUpdate: (data: Partial<KeyData>) => void;
  readOnly?: boolean;
  companyId?: string;
}

const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK', 'CHF'];
const EXCHANGES = [
  { value: 'stockholm', label: 'Stockholm (.ST)' },
  { value: 'helsinki', label: 'Helsinki (.HE)' },
  { value: 'copenhagen', label: 'Köpenhamn (.CO)' },
  { value: 'oslo', label: 'Oslo (.OL)' },
  { value: 'us', label: 'USA (NYSE/NASDAQ)' },
  { value: 'london', label: 'London (.L)' },
  { value: 'frankfurt', label: 'Frankfurt (.F)' },
];

export function KeyDataEditor({ data, onUpdate, readOnly = false, companyId }: KeyDataEditorProps) {
  const { t } = useLanguage();
  const [localData, setLocalData] = useState<KeyData>(data);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [stockResult, setStockResult] = useState<StockPriceResult | null>(null);

  useEffect(() => {
    setLocalData(data);
  }, [data]);

  const handleChange = (field: keyof KeyData, value: string) => {
    const updated = { ...localData, [field]: value };
    setLocalData(updated);
  };

  const handleBlur = (field: keyof KeyData) => {
    if (localData[field] !== data[field]) {
      onUpdate({ [field]: localData[field] });
    }
  };

  const fetchStockPrice = async () => {
    if (!localData.ticker) {
      toast.error('Ange en ticker först');
      return;
    }
    setFetchingPrice(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('fetch-stock-price', {
        body: { ticker: localData.ticker, exchange: localData.exchange || 'stockholm' },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      
      setStockResult(result);
      // Auto-update current_price
      onUpdate({ currentPrice: result.price } as any);
      if (companyId) {
        await supabase.from('companies').update({ current_price: result.price } as any).eq('id', companyId);
      }
      toast.success(`Kurs hämtad: ${result.price} ${result.currency}`);
    } catch (e: any) {
      console.error('Fetch stock price error:', e);
      toast.error(e?.message || 'Kunde inte hämta aktiekurs');
    } finally {
      setFetchingPrice(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Data</CardTitle>
        <CardDescription>Company trading information</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Typ</Label>
            <Select
              value={localData.companyType || 'stock'}
              onValueChange={(value) => {
                handleChange('companyType', value);
                onUpdate({ companyType: value } as any);
              }}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stock">Aktie</SelectItem>
                <SelectItem value="investment_company">Investmentbolag</SelectItem>
                <SelectItem value="fund">Fond</SelectItem>
                <SelectItem value="etf">ETF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t.company.ticker}</Label>
            <Input
              placeholder="e.g. VOLV-B"
              value={localData.ticker || ''}
              onChange={(e) => handleChange('ticker', e.target.value.toUpperCase())}
              onBlur={() => handleBlur('ticker')}
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Börs</Label>
            <Select
              value={localData.exchange || 'stockholm'}
              onValueChange={(value) => {
                handleChange('exchange', value);
                onUpdate({ exchange: value } as any);
              }}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGES.map(ex => (
                  <SelectItem key={ex.value} value={ex.value}>{ex.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t.company.currentPrice}</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="0.00"
                value={data.currentPrice ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : null;
                  onUpdate({ currentPrice: val } as any);
                }}
                disabled={readOnly}
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={fetchStockPrice}
                disabled={fetchingPrice || readOnly || !localData.ticker}
                title="Hämta aktuell kurs"
              >
                {fetchingPrice ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            {stockResult && (
              <div className="flex items-center gap-1.5 text-xs">
                {stockResult.change >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                <span className={stockResult.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
                  {stockResult.change >= 0 ? '+' : ''}{stockResult.change.toFixed(2)} ({stockResult.changePercent.toFixed(2)}%)
                </span>
                <span className="text-muted-foreground">{stockResult.currency}</span>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>{t.company.reportingCurrency}</Label>
            <Select
              value={localData.reportingCurrency}
              onValueChange={(value) => {
                handleChange('reportingCurrency', value);
                onUpdate({ reportingCurrency: value });
              }}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(curr => (
                  <SelectItem key={curr} value={curr}>{curr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>{t.company.tradingCurrency}</Label>
            <Select
              value={localData.tradingCurrency}
              onValueChange={(value) => {
                handleChange('tradingCurrency', value);
                onUpdate({ tradingCurrency: value });
              }}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(curr => (
                  <SelectItem key={curr} value={curr}>{curr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
