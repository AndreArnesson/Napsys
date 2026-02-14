import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileSpreadsheet, Users, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import * as XLSX from 'xlsx';

export interface ParsedFinancialData {
  fiscal_year: number;
  revenue?: number;
  gross_income?: number;
  operating_income?: number;
  ebit?: number;
  ebitda?: number;
  net_income?: number;
  earnings_per_share?: number;
  dividend?: number;
  total_assets?: number;
  total_equity?: number;
  cash_equivalents?: number;
  total_liabilities?: number;
  current_assets?: number;
  current_liabilities?: number;
  non_current_liabilities?: number;
  gross_margin?: number;
  operating_margin?: number;
  net_margin?: number;
  equity_ratio?: number;
  debt_to_equity?: number;
  current_ratio?: number;
}

export interface ParsedInsiderTrade {
  id?: string;
  date: string;
  person: string;
  position: string;
  type: 'Förvärv' | 'Avyttring' | 'acquisition' | 'disposal';
  volume: number;
  price: number;
  currency: string;
  instrument?: string;
  isin?: string;
}

interface FileImportDialogProps {
  companyId: string;
  onImportFinancials: (data: ParsedFinancialData[]) => Promise<void>;
  onImportInsiders: (data: ParsedInsiderTrade[]) => Promise<void>;
}

// Map Swedish/English field names to standardized keys (case-insensitive matching done at lookup time)
const fieldMappings: Record<string, keyof ParsedFinancialData> = {
  // Revenue
  'net sales': 'revenue',
  'nettoomsättning': 'revenue',
  'revenue': 'revenue',
  'omsättning': 'revenue',
  // Gross
  'gross income': 'gross_income',
  'bruttoresultat': 'gross_income',
  // Operating
  'operating income': 'operating_income',
  'rörelseresultat': 'operating_income',
  // EBIT / EBITDA
  'ebit': 'ebit',
  'ebitda': 'ebitda',
  // Net income
  'profit to equity holders': 'net_income',
  'resultat till aktieägare': 'net_income',
  'net income': 'net_income',
  'årets resultat': 'net_income',
  'nettoresultat': 'net_income',
  // EPS
  'earnings per share': 'earnings_per_share',
  'vinst per aktie': 'earnings_per_share',
  // Dividend
  'dividend': 'dividend',
  'utdelning': 'dividend',
  // Balance sheet
  'total assets': 'total_assets',
  'totala tillgångar': 'total_assets',
  'total equity': 'total_equity',
  'eget kapital': 'total_equity',
  'cash and equivalents': 'cash_equivalents',
  'likvida medel': 'cash_equivalents',
  'total liabilities': 'total_liabilities',
  'totala skulder': 'total_liabilities',
  'current assets': 'current_assets',
  'omsättningstillgångar': 'current_assets',
  'current liabilities': 'current_liabilities',
  'kortfristiga skulder': 'current_liabilities',
  'non-current liabilities': 'non_current_liabilities',
  'långfristiga skulder': 'non_current_liabilities',
  // Margins (stored as decimals, e.g. 0.15 for 15%)
  'gross margin': 'gross_margin',
  'bruttomarginal': 'gross_margin',
  'operating margin': 'operating_margin',
  'rörelsemarginal': 'operating_margin',
  'profit margin': 'net_margin',
  'nettomarginal': 'net_margin',
  // Ratios
  'equity ratio': 'equity_ratio',
  'soliditet': 'equity_ratio',
};

// Percentage fields - values from Börsdata are already in % form (e.g. 15.3 means 15.3%)
const percentageFields = new Set<keyof ParsedFinancialData>([
  'gross_margin', 'operating_margin', 'net_margin', 'equity_ratio',
]);

function lookupField(rawLabel: string): keyof ParsedFinancialData | undefined {
  const normalized = rawLabel.trim().toLowerCase();
  return fieldMappings[normalized];
}

export function FileImportDialog({ companyId, onImportFinancials, onImportInsiders }: FileImportDialogProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  const parseBoersdataExcel = useCallback((workbook: XLSX.WorkBook): ParsedFinancialData[] => {
    console.log('[Import] Sheet names:', workbook.SheetNames);
    const result: Map<number, ParsedFinancialData> = new Map();

    // Find the yearly data sheet. Börsdata uses "Year" (English) or "År" (Swedish).
    // It's typically the second sheet (index 1). Also try sheets with those substrings.
    let yearSheetName: string | undefined;
    for (const name of workbook.SheetNames) {
      const lower = name.toLowerCase();
      if (lower === 'year' || lower === 'år') {
        yearSheetName = name;
        break;
      }
    }
    // Fallback: first sheet whose name contains 'year' or 'år'
    if (!yearSheetName) {
      yearSheetName = workbook.SheetNames.find(n => {
        const l = n.toLowerCase();
        return l.includes('year') || l.includes('år');
      });
    }
    // Last resort: second sheet
    if (!yearSheetName && workbook.SheetNames.length > 1) {
      yearSheetName = workbook.SheetNames[1];
    }
    if (!yearSheetName) {
      console.warn('[Import] No suitable sheet found');
      return [];
    }

    console.log('[Import] Using sheet:', yearSheetName);
    const sheet = workbook.Sheets[yearSheetName];
    
    // Get the sheet range to understand the actual dimensions
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    console.log('[Import] Sheet range:', sheet['!ref'], 'rows:', range.e.r + 1, 'cols:', range.e.c + 1);
    
    // Debug: log raw cells in first row to find years
    const firstRowCells: string[] = [];
    for (let c = 0; c <= Math.min(range.e.c, 25); c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = sheet[addr];
      firstRowCells.push(`${addr}=${cell ? `${cell.v}(${cell.t})` : 'empty'}`);
    }
    console.log('[Import] First row cells:', firstRowCells.join(', '));
    
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

    if (data.length < 3) {
      console.warn('[Import] Sheet has too few rows:', data.length);
      return [];
    }

    // Find the header row that contains year numbers.
    // Scan the first 10 rows. Years might be numbers, strings, or even date serials.
    let headerRowIndex = -1;
    let yearColumns: { year: number; colIndex: number }[] = [];

    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const yearsFound: { year: number; colIndex: number }[] = [];
      for (let j = 0; j < row.length; j++) {
        const cell = row[j];
        if (cell === null || cell === undefined) continue;
        let yearVal: number | null = null;
        if (typeof cell === 'number') {
          if (cell >= 2000 && cell <= 2035) {
            yearVal = cell;
          } else if (cell > 30000 && cell < 60000) {
            // Excel date serial - convert to year
            const d = new Date((cell - 25569) * 86400 * 1000);
            const y = d.getFullYear();
            if (y >= 2000 && y <= 2035) yearVal = y;
          }
        } else if (typeof cell === 'string') {
          const m = cell.match(/^(\d{4})/);
          if (m) {
            const y = parseInt(m[1]);
            if (y >= 2000 && y <= 2035) yearVal = y;
          }
        }
        if (yearVal !== null) {
          yearsFound.push({ year: yearVal, colIndex: j });
        }
      }
      if (yearsFound.length >= 3) {
        headerRowIndex = i;
        yearColumns = yearsFound;
        break;
      }
    }

    // If still not found, try reading raw cells directly from the sheet
    if (headerRowIndex === -1) {
      console.log('[Import] Trying raw cell scan for years...');
      for (let r = 0; r <= Math.min(range.e.r, 10); r++) {
        const yearsFound: { year: number; colIndex: number }[] = [];
        for (let c = 0; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[addr];
          if (!cell) continue;
          let yearVal: number | null = null;
          // Check formatted value (w) first, then raw value (v)
          const formatted = cell.w || String(cell.v);
          const rawVal = cell.v;
          
          if (typeof rawVal === 'number') {
            if (rawVal >= 2000 && rawVal <= 2035) {
              yearVal = rawVal;
            } else if (rawVal > 30000 && rawVal < 60000) {
              const d = new Date((rawVal - 25569) * 86400 * 1000);
              yearVal = d.getFullYear();
            }
          }
          if (yearVal === null && formatted) {
            const m = formatted.match(/(\d{4})/);
            if (m) {
              const y = parseInt(m[1]);
              if (y >= 2000 && y <= 2035) yearVal = y;
            }
          }
          if (yearVal !== null) {
            yearsFound.push({ year: yearVal, colIndex: c });
          }
        }
        if (yearsFound.length >= 3) {
          headerRowIndex = r;
          yearColumns = yearsFound;
          console.log('[Import] Found years via raw cell scan in row', r);
          break;
        }
      }
    }

    if (headerRowIndex === -1) {
      console.warn('[Import] Could not find header row with year columns');
      // Log more debug info
      for (let i = 0; i < Math.min(3, data.length); i++) {
        console.log(`[Import] Full Row ${i} (${data[i]?.length} cols):`, JSON.stringify(data[i]));
      }
      return [];
    }

    console.log('[Import] Header row:', headerRowIndex, 'Years found:', yearColumns.map(y => y.year));

    // Determine which column has the field labels. Usually column 0 (A).
    // But sometimes there's an offset. Check which column in the header row has text.
    let labelColIndex = 0;

    // Initialize year buckets
    for (const { year } of yearColumns) {
      result.set(year, { fiscal_year: year });
    }

    // Parse data rows below the header
    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;

      const rawLabel = row[labelColIndex];
      if (!rawLabel || typeof rawLabel !== 'string') continue;

      const mappedKey = lookupField(rawLabel);
      if (!mappedKey) continue;

      for (const { year, colIndex } of yearColumns) {
        const cell = row[colIndex];
        if (cell === null || cell === undefined || cell === '') continue;
        const numValue = typeof cell === 'number' ? cell : parseFloat(String(cell).replace(/\s/g, '').replace(',', '.'));
        if (isNaN(numValue)) continue;

        const yearData = result.get(year)!;
        // Convert percentage fields from e.g. 15.3 → 0.153
        if (percentageFields.has(mappedKey)) {
          (yearData as any)[mappedKey] = numValue / 100;
        } else {
          (yearData as any)[mappedKey] = numValue;
        }
      }
    }

    const sorted = Array.from(result.values())
      .filter(d => {
        // Only keep years that have at least one data field beyond fiscal_year
        const keys = Object.keys(d).filter(k => k !== 'fiscal_year');
        return keys.some(k => (d as any)[k] !== undefined && (d as any)[k] !== null);
      })
      .sort((a, b) => a.fiscal_year - b.fiscal_year);

    console.log('[Import] Parsed', sorted.length, 'years of data');
    if (sorted.length > 0) {
      console.log('[Import] Sample (first year):', JSON.stringify(sorted[0]));
    }

    return sorted;
  }, []);

  const handleFinancialFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      const financialData = parseBoersdataExcel(workbook);

      if (financialData.length === 0) {
        setImportResult({ success: false, message: 'Could not parse financial data. Check browser console for debug info.' });
        return;
      }

      await onImportFinancials(financialData);
      setImportResult({
        success: true,
        message: `Successfully imported ${financialData.length} years of financial data (${financialData[0].fiscal_year}–${financialData[financialData.length - 1].fiscal_year})`,
      });
    } catch (error) {
      console.error('[Import] Parse error:', error);
      setImportResult({ success: false, message: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }, [onImportFinancials, parseBoersdataExcel]);

  const parseInsiderCSV = useCallback((text: string): ParsedInsiderTrade[] => {
    const trades: ParsedInsiderTrade[] = [];
    let cleanText = text;
    if (text.includes('\0')) cleanText = text.replace(/\0/g, '');

    const lines = cleanText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    // FI CSV: semicolon-delimited
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(';');
      if (cols.length < 20) continue;
      if (!cols[3] || !cols[4]) continue;

      const type = cols[11]?.trim();
      const isAcquisition = type === 'Förvärv' || type?.toLowerCase().includes('förvärv');
      const isDisposal = type === 'Avyttring' || type?.toLowerCase().includes('avyttring');
      if (!isAcquisition && !isDisposal) continue;

      const dateStr = cols[15]?.trim() || cols[0]?.trim();
      const dateParts = dateStr.split(' ')[0];
      const volumeStr = cols[16]?.replace(/[^\d,.\-]/g, '').replace(',', '.');
      const priceStr = cols[18]?.replace(/[^\d,.\-]/g, '').replace(',', '.');
      const volume = parseFloat(volumeStr) || 0;
      const price = parseFloat(priceStr) || 0;
      if (volume === 0) continue;

      trades.push({
        id: `${dateParts}-${cols[4]}-${i}`,
        date: dateParts,
        person: cols[4]?.trim() || cols[3]?.trim(),
        position: cols[5]?.trim() || '',
        type: isAcquisition ? 'Förvärv' : 'Avyttring',
        volume,
        price,
        currency: cols[19]?.trim() || 'SEK',
        instrument: cols[13]?.trim(),
        isin: cols[14]?.trim(),
      });
    }
    return trades.sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  const handleInsiderFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Try UTF-16 LE first (common for FI exports)
      let text = new TextDecoder('utf-16le').decode(arrayBuffer);
      if (!text.includes('Emittent') && !text.includes('Publiceringsdatum')) {
        text = new TextDecoder('utf-8').decode(arrayBuffer);
      }
      if (!text.includes('Emittent') && !text.includes('Publiceringsdatum')) {
        text = new TextDecoder('iso-8859-1').decode(arrayBuffer);
      }
      const trades = parseInsiderCSV(text);
      if (trades.length === 0) {
        setImportResult({ success: false, message: 'No insider trades found in file.' });
        return;
      }
      await onImportInsiders(trades);
      setImportResult({ success: true, message: `Imported ${trades.length} insider transactions` });
    } catch (error) {
      console.error('[Import] Parse error:', error);
      setImportResult({ success: false, message: 'Failed to parse insider file.' });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }, [onImportInsiders, parseInsiderCSV]);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setImportResult(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          Import Data
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Data</DialogTitle>
          <DialogDescription>
            Import financial data from Börsdata Excel or insider trades from FI
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="financials" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="financials" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Financials
            </TabsTrigger>
            <TabsTrigger value="insiders" className="gap-2">
              <Users className="h-4 w-4" />
              Insider Trades
            </TabsTrigger>
          </TabsList>

          <TabsContent value="financials" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Import from Börsdata Excel</Label>
              <p className="text-sm text-muted-foreground">
                Upload an XLSX file exported from Börsdata. Revenue, EBIT, margins and more will be extracted automatically.
              </p>
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                <input type="file" accept=".xlsx,.xls" onChange={handleFinancialFile} className="hidden" id="financial-file" disabled={importing} />
                <label htmlFor="financial-file" className="cursor-pointer">
                  {importing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Parsing Excel file...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload Börsdata XLSX</span>
                      <span className="text-xs text-muted-foreground">Supports company export files</span>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="insiders" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Import from FI (Finansinspektionen)</Label>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file from insynsok.fi.se with insider trading data.
              </p>
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                <input type="file" accept=".csv" onChange={handleInsiderFile} className="hidden" id="insider-file" disabled={importing} />
                <label htmlFor="insider-file" className="cursor-pointer">
                  {importing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Parsing CSV file...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload FI CSV</span>
                      <span className="text-xs text-muted-foreground">Export from insynsok.fi.se</span>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {importResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            importResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'
          }`}>
            {importResult.success ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            <span className="text-sm">{importResult.message}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
