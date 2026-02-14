import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/i18n/LanguageContext';

interface KeyData {
  ticker?: string;
  currentPrice?: number;
  sharesOutstanding?: number;
  reportingCurrency: string;
  tradingCurrency: string;
}

interface KeyDataEditorProps {
  data: KeyData;
  onUpdate: (data: Partial<KeyData>) => void;
  readOnly?: boolean;
}

const CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK', 'CHF'];

export function KeyDataEditor({ data, onUpdate, readOnly = false }: KeyDataEditorProps) {
  const { t } = useLanguage();
  const [localData, setLocalData] = useState<KeyData>(data);

  useEffect(() => {
    setLocalData(data);
  }, [data]);

  const handleChange = (field: keyof KeyData, value: string | number) => {
    const updated = { ...localData, [field]: value };
    setLocalData(updated);
  };

  const handleBlur = (field: keyof KeyData) => {
    if (localData[field] !== data[field]) {
      onUpdate({ [field]: localData[field] });
    }
  };

  const formatMarketCap = () => {
    if (!localData.currentPrice || !localData.sharesOutstanding) return '—';
    const marketCap = localData.currentPrice * localData.sharesOutstanding;
    if (marketCap >= 1e9) {
      return `${(marketCap / 1e9).toFixed(1)}B ${localData.tradingCurrency}`;
    }
    if (marketCap >= 1e6) {
      return `${(marketCap / 1e6).toFixed(1)}M ${localData.tradingCurrency}`;
    }
    return `${marketCap.toLocaleString()} ${localData.tradingCurrency}`;
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
            <Label>{t.company.ticker}</Label>
            <Input
              placeholder="e.g. FRACTL"
              value={localData.ticker || ''}
              onChange={(e) => handleChange('ticker', e.target.value)}
              onBlur={() => handleBlur('ticker')}
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label>{t.company.currentPrice}</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={localData.currentPrice || ''}
              onChange={(e) => handleChange('currentPrice', parseFloat(e.target.value) || 0)}
              onBlur={() => handleBlur('currentPrice')}
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label>{t.company.sharesOutstanding}</Label>
            <Input
              type="number"
              placeholder="e.g. 10000000"
              value={localData.sharesOutstanding || ''}
              onChange={(e) => handleChange('sharesOutstanding', parseInt(e.target.value) || 0)}
              onBlur={() => handleBlur('sharesOutstanding')}
              disabled={readOnly}
            />
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
          
          <div className="space-y-2">
            <Label>Market Cap</Label>
            <p className="h-10 flex items-center font-mono text-lg">
              {formatMarketCap()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
