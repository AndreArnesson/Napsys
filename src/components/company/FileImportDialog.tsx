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
  quarter?: number;
  revenue?: number;
  gross_income?: number;
  operating_income?: number;
  ebit?: number;
  ebitda?: number;
  net_income?: number;
  earnings_per_share?: number;
  dividend?: number;
  shares_outstanding?: number;
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
  nature?: string;
}

export interface ParsedCompanyInfo {
  ticker?: string;
  reportingCurrency?: string;
  tradingCurrency?: string;
  sector?: string;
  industry?: string;
  latestPrice?: number;
  sharesOutstanding?: number;
}

interface FileImportDialogProps {
  companyId: string;
  onImportFinancials: (data: ParsedFinancialData[], companyInfo?: ParsedCompanyInfo) => Promise<void>;
  onImportInsiders: (data: ParsedInsiderTrade[]) => Promise<void>;
}

const fieldMappings: Record<string, keyof ParsedFinancialData> = {
  'net sales': 'revenue',
  'nettoomsättning': 'revenue',
  'revenue': 'revenue',
  'omsättning': 'revenue',
  'gross income': 'gross_income',
  'bruttoresultat': 'gross_income',
  'operating income': 'operating_income',
  'rörelseresultat': 'operating_income',
  'ebit': 'ebit',
  'ebitda': 'ebitda',
  'profit to equity holders': 'net_income',
  'resultat till aktieägare': 'net_income',
  'resultat hänföring aktieägare': 'net_income',
  'net income': 'net_income',
  'årets resultat': 'net_income',
  'nettoresultat': 'net_income',
  'earnings per share': 'earnings_per_share',
  'vinst per aktie': 'earnings_per_share',
  'vinst/aktie': 'earnings_per_share',
  'dividend': 'dividend',
  'utdelning': 'dividend',
  'utdelning/aktie': 'dividend',
  'dividend per share': 'dividend',
  'number of shares': 'shares_outstanding',
  'antal aktier': 'shares_outstanding',
  'shares outstanding': 'shares_outstanding',
  'total assets': 'total_assets',
  'totala tillgångar': 'total_assets',
  'summa tillgångar': 'total_assets',
  'total equity': 'total_equity',
  'eget kapital': 'total_equity',
  'summa eget kapital': 'total_equity',
  'cash and equivalents': 'cash_equivalents',
  'likvida medel': 'cash_equivalents',
  'kassa/bank': 'cash_equivalents',
  'total liabilities': 'total_liabilities',
  'totala skulder': 'total_liabilities',
  'current assets': 'current_assets',
  'omsättningstillgångar': 'current_assets',
  'summa omsättningstillgångar': 'current_assets',
  'current liabilities': 'current_liabilities',
  'kortfristiga skulder': 'current_liabilities',
  'non-current liabilities': 'non_current_liabilities',
  'långfristiga skulder': 'non_current_liabilities',
  'gross margin': 'gross_margin',
  'bruttomarginal': 'gross_margin',
  'operating margin': 'operating_margin',
  'rörelsemarginal': 'operating_margin',
  'profit margin': 'net_margin',
  'nettomarginal': 'net_margin',
  'vinstmarginal': 'net_margin',
  'equity ratio': 'equity_ratio',
  'soliditet': 'equity_ratio',
};

const percentageFields = new Set<keyof ParsedFinancialData>([
  'gross_margin', 'operating_margin', 'net_margin', 'equity_ratio',
]);

function lookupField(rawLabel: string): keyof ParsedFinancialData | undefined {
  const normalized = rawLabel.trim().toLowerCase();
  return fieldMappings[normalized];
}

/**
 * Try to extract a year (2000–2040) from a cell value.
 * Handles plain numbers, strings like "2024/12", "2025-12", and Excel date serials.
 */
function extractYear(cell: any): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') {
    if (cell >= 2000 && cell <= 2040) return cell;
    // Excel date serial
    if (cell > 30000 && cell < 60000) {
      const d = new Date((cell - 25569) * 86400 * 1000);
      const y = d.getFullYear();
      if (y >= 2000 && y <= 2040) return y;
    }
  } else if (typeof cell === 'string') {
    // Match "2025/12", "2025-12", "2025", "Dec-2025", etc.
    const m = cell.match(/(\d{4})/);
    if (m) {
      const y = parseInt(m[1]);
      if (y >= 2000 && y <= 2040) return y;
    }
  }
  // If it's a Date object
  if (cell instanceof Date) {
    const y = cell.getFullYear();
    if (y >= 2000 && y <= 2040) return y;
  }
  return null;
}

/**
 * Try to extract quarter from a cell value like "Q1", "2025 Q2", "Kv1", etc.
 */
function extractQuarter(cell: any): number | null {
  if (!cell) return null;
  const s = String(cell);
  const m = s.match(/[QqKk]v?\.?\s*(\d)/i);
  if (m) {
    const q = parseInt(m[1]);
    if (q >= 1 && q <= 4) return q;
  }
  return null;
}

function parseVerticalFormat(data: any[][]): ParsedFinancialData[] {
  const result: Map<number, ParsedFinancialData> = new Map();
  let currentField: keyof ParsedFinancialData | undefined;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const cellA = row[0];
    const cellB = row[1];
    const yearVal = extractYear(cellA);

    if (yearVal !== null) {
      if (currentField && cellB !== null && cellB !== undefined && cellB !== '') {
        const numValue = typeof cellB === 'number' ? cellB : parseFloat(String(cellB).replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(numValue)) {
          if (!result.has(yearVal)) result.set(yearVal, { fiscal_year: yearVal });
          const yearData = result.get(yearVal)!;
          if (percentageFields.has(currentField)) {
            (yearData as any)[currentField] = numValue / 100;
          } else {
            (yearData as any)[currentField] = numValue;
          }
        }
      }
    } else if (typeof cellA === 'string' && cellA.trim()) {
      const mapped = lookupField(cellA);
      if (mapped) currentField = mapped;
      else currentField = undefined;
    }
  }

  return Array.from(result.values())
    .filter(d => Object.keys(d).filter(k => k !== 'fiscal_year').some(k => (d as any)[k] !== undefined))
    .sort((a, b) => a.fiscal_year - b.fiscal_year);
}

function parseSheetData(sheet: XLSX.Sheet, workbook: XLSX.WorkBook): ParsedFinancialData[] {
  const result: Map<string, ParsedFinancialData> = new Map();

  // Fix sheet range
  let maxR = 0, maxC = 0;
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue;
    const cell = XLSX.utils.decode_cell(key);
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c > maxC) maxC = cell.c;
  }
  const trueRef = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  if (trueRef !== sheet['!ref']) {
    console.log('[Import] Correcting sheet range from', sheet['!ref'], 'to', trueRef);
    sheet['!ref'] = trueRef;
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  console.log('[Import] Sheet range:', sheet['!ref'], 'rows:', range.e.r + 1, 'cols:', range.e.c + 1);

  // Debug first rows
  for (let r = 0; r <= Math.min(2, range.e.r); r++) {
    const cells: string[] = [];
    for (let c = 0; c <= Math.min(range.e.c, 30); c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      cells.push(`${addr}=${cell ? `${cell.v}(${cell.t},w=${cell.w})` : 'empty'}`);
    }
    console.log(`[Import] Row ${r}:`, cells.join(', '));
  }

  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (data.length < 3) return [];

  // Vertical format detection
  if (range.e.c + 1 <= 3) {
    console.log('[Import] Detected vertical format');
    return parseVerticalFormat(data);
  }

  // Find header row with years
  let headerRowIndex = -1;
  let yearColumns: { year: number; colIndex: number; quarter?: number }[] = [];

  // First pass: use parsed data
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const yearsFound: { year: number; colIndex: number; quarter?: number }[] = [];
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (cell === null || cell === undefined) continue;
      const yearVal = extractYear(cell);
      if (yearVal !== null) {
        const q = extractQuarter(cell);
        yearsFound.push({ year: yearVal, colIndex: j, quarter: q ?? undefined });
      }
    }
    if (yearsFound.length >= 3) {
      headerRowIndex = i;
      yearColumns = yearsFound;
      break;
    }
  }

  // Second pass: raw cells
  if (headerRowIndex === -1) {
    console.log('[Import] Trying raw cell scan for years...');
    for (let r = 0; r <= Math.min(range.e.r, 10); r++) {
      const yearsFound: { year: number; colIndex: number; quarter?: number }[] = [];
      for (let c = 0; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (!cell) continue;
        let yearVal: number | null = null;
        const formatted = cell.w || String(cell.v);
        const rawVal = cell.v;

        if (typeof rawVal === 'number') {
          if (rawVal >= 2000 && rawVal <= 2040) yearVal = rawVal;
          else if (rawVal > 30000 && rawVal < 60000) {
            const d = new Date((rawVal - 25569) * 86400 * 1000);
            yearVal = d.getFullYear();
          }
        }
        if (yearVal === null && formatted) {
          const m = formatted.match(/(\d{4})/);
          if (m) {
            const y = parseInt(m[1]);
            if (y >= 2000 && y <= 2040) yearVal = y;
          }
        }
        if (yearVal !== null) {
          const q = extractQuarter(formatted);
          yearsFound.push({ year: yearVal, colIndex: c, quarter: q ?? undefined });
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
    return [];
  }

  console.log('[Import] Header row:', headerRowIndex, 'Years found:', yearColumns.map(y => `${y.year}${y.quarter ? 'Q' + y.quarter : ''}`));

  const labelColIndex = 0;

  // Initialize year buckets
  for (const { year, quarter } of yearColumns) {
    const key = quarter ? `${year}-Q${quarter}` : String(year);
    result.set(key, { fiscal_year: year, quarter: quarter });
  }

  // Detect unit column - check if column index 1 has unit-like text
  const unitMultipliers: Map<string, number> = new Map();
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const rawLabel = row[labelColIndex];
    if (!rawLabel || typeof rawLabel !== 'string') continue;
    const mappedKey = lookupField(rawLabel);
    if (!mappedKey) continue;
    
    // Check adjacent columns (between label and first year) for unit hints
    const firstYearCol = yearColumns[0]?.colIndex || 2;
    for (let c = 1; c < firstYearCol; c++) {
      const unitCell = row[c];
      if (unitCell && typeof unitCell === 'string') {
        const u = unitCell.trim().toLowerCase();
        if (mappedKey === 'shares_outstanding') {
          if (u.includes('milj') || u === 'm' || u.includes('million')) {
            unitMultipliers.set(`${i}-${mappedKey}`, 1_000_000);
          } else if (u.includes('tus') || u === 'k') {
            unitMultipliers.set(`${i}-${mappedKey}`, 1_000);
          }
        }
      }
    }
  }

  // Parse data rows
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const rawLabel = row[labelColIndex];
    if (!rawLabel || typeof rawLabel !== 'string') continue;
    const mappedKey = lookupField(rawLabel);
    if (!mappedKey) continue;

    const multiplier = unitMultipliers.get(`${i}-${mappedKey}`) || 1;

    for (const { year, colIndex, quarter } of yearColumns) {
      const cell = row[colIndex];
      if (cell === null || cell === undefined || cell === '') continue;
      const numValue = typeof cell === 'number' ? cell : parseFloat(String(cell).replace(/\s/g, '').replace(',', '.'));
      if (isNaN(numValue)) continue;

      const key = quarter ? `${year}-Q${quarter}` : String(year);
      const yearData = result.get(key)!;
      if (percentageFields.has(mappedKey)) {
        (yearData as any)[mappedKey] = numValue / 100;
      } else {
        (yearData as any)[mappedKey] = numValue * multiplier;
      }
    }
  }

  return Array.from(result.values())
    .filter(d => Object.keys(d).filter(k => k !== 'fiscal_year' && k !== 'quarter').some(k => (d as any)[k] !== undefined && (d as any)[k] !== null))
    .sort((a, b) => a.fiscal_year === b.fiscal_year ? (a.quarter ?? 0) - (b.quarter ?? 0) : a.fiscal_year - b.fiscal_year);
}

export function parseBoersdataInfoSheet(workbook: XLSX.WorkBook): ParsedCompanyInfo {
  const info: ParsedCompanyInfo = {};
  const infoSheet = workbook.Sheets['Info'];
  if (!infoSheet) return info;
  const data: any[][] = XLSX.utils.sheet_to_json(infoSheet, { header: 1, defval: null, raw: true });
  for (const row of data) {
    if (!row || !row[0]) continue;
    const label = String(row[0]).trim().toLowerCase();
    const val = row[1] != null ? String(row[1]).trim() : undefined;
    if (label.includes('ticker') && val) info.ticker = val;
    if ((label.includes('report currency') || label === 'rapportvaluta') && val) info.reportingCurrency = val;
    if ((label.includes('stock price currency') || label.includes('trading currency') || label === 'aktiekursvaluta') && val) info.tradingCurrency = val;
    if ((label.includes('sector') || label === 'sektor') && val) info.sector = val;
    if ((label.includes('industry') || label === 'bransch') && val) info.industry = val;
    if ((label.includes('latest stock price') || label.includes('senaste aktiekurs')) && row[1] != null) {
      const p = typeof row[1] === 'number' ? row[1] : parseFloat(String(row[1]).replace(',', '.'));
      if (!isNaN(p)) info.latestPrice = p;
    }
    if ((label.includes('number of shares') || label.includes('antal aktier') || label.includes('shares outstanding')) && row[1] != null) {
      // Column B might be the value OR the unit (like "Milj")
      const colB = row[1];
      const colBStr = String(colB).trim().toLowerCase();
      const isColBUnit = colBStr.includes('milj') || colBStr === 'm' || colBStr.includes('million') || colBStr.includes('tus') || colBStr === 'k' || colBStr === 'st';
      
      let sharesValue: number | undefined;
      let unitMultiplier = 1;
      
      if (isColBUnit) {
        // Column B is the unit, look for value in column C or later
        if (colBStr.includes('milj') || colBStr === 'm' || colBStr.includes('million')) unitMultiplier = 1_000_000;
        else if (colBStr.includes('tus') || colBStr === 'k') unitMultiplier = 1_000;
        // Try column C onwards for actual value
        for (let ci = 2; ci < row.length; ci++) {
          if (row[ci] != null) {
            const v = typeof row[ci] === 'number' ? row[ci] : parseFloat(String(row[ci]).replace(/\s/g, '').replace(',', '.'));
            if (!isNaN(v)) { sharesValue = v; break; }
          }
        }
      } else {
        // Column B is the value itself
        sharesValue = typeof colB === 'number' ? colB : parseFloat(String(colB).replace(/\s/g, '').replace(',', '.'));
        // Check column C for unit
        const unitHint = row[2] ? String(row[2]).trim().toLowerCase() : '';
        if (unitHint.includes('milj') || unitHint === 'm' || unitHint.includes('million')) unitMultiplier = 1_000_000;
        else if (unitHint.includes('tus') || unitHint === 'k') unitMultiplier = 1_000;
        else if (sharesValue !== undefined && !isNaN(sharesValue) && sharesValue < 1000) unitMultiplier = 1_000_000;
      }
      
      if (sharesValue !== undefined && !isNaN(sharesValue)) {
        info.sharesOutstanding = Math.round(sharesValue * unitMultiplier);
      }
    }
  }
  console.log('[Import] Parsed Info sheet:', info);
  return info;
}

export function parseBoersdataExcel(workbook: XLSX.WorkBook): { yearly: ParsedFinancialData[]; quarterly: ParsedFinancialData[] } {
  console.log('[Import] Sheet names:', workbook.SheetNames);

  // Find yearly sheet
  let yearSheetName: string | undefined;
  for (const name of workbook.SheetNames) {
    const lower = name.toLowerCase();
    if (lower === 'year' || lower === 'år') { yearSheetName = name; break; }
  }
  if (!yearSheetName) {
    yearSheetName = workbook.SheetNames.find(n => {
      const l = n.toLowerCase();
      return l.includes('year') || l.includes('år');
    });
  }
  if (!yearSheetName && workbook.SheetNames.length > 1) yearSheetName = workbook.SheetNames[1];

  let yearly: ParsedFinancialData[] = [];
  if (yearSheetName) {
    console.log('[Import] Using yearly sheet:', yearSheetName);
    yearly = parseSheetData(workbook.Sheets[yearSheetName], workbook);
    console.log('[Import] Parsed', yearly.length, 'years of data');
    if (yearly.length > 0) console.log('[Import] Sample (first year):', JSON.stringify(yearly[0]));
  }

  // Find quarterly sheet
  let quarterSheetName: string | undefined;
  for (const name of workbook.SheetNames) {
    const lower = name.toLowerCase();
    if (lower === 'quarter' || lower === 'kvartal' || lower === 'kvartals') { quarterSheetName = name; break; }
  }
  if (!quarterSheetName) {
    quarterSheetName = workbook.SheetNames.find(n => {
      const l = n.toLowerCase();
      return l.includes('quarter') || l.includes('kvartal');
    });
  }

  let quarterly: ParsedFinancialData[] = [];
  if (quarterSheetName) {
    console.log('[Import] Using quarterly sheet:', quarterSheetName);
    quarterly = parseSheetData(workbook.Sheets[quarterSheetName], workbook);
    console.log('[Import] Parsed', quarterly.length, 'quarters of data');
  }

  return { yearly, quarterly };
}

export function FileImportDialog({ companyId, onImportFinancials, onImportInsiders }: FileImportDialogProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFinancialFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const { yearly, quarterly } = parseBoersdataExcel(workbook);
      const companyInfo = parseBoersdataInfoSheet(workbook);

      const allData = [...yearly, ...quarterly];
      if (allData.length === 0) {
        setImportResult({ success: false, message: 'Could not parse financial data. Check browser console for debug info.' });
        return;
      }

      await onImportFinancials(allData, companyInfo);
      const parts: string[] = [];
      if (yearly.length > 0) parts.push(`${yearly.length} years (${yearly[0].fiscal_year}–${yearly[yearly.length - 1].fiscal_year})`);
      if (quarterly.length > 0) parts.push(`${quarterly.length} quarters`);
      setImportResult({ success: true, message: `Imported ${parts.join(' + ')} of financial data` });
    } catch (error) {
      console.error('[Import] Parse error:', error);
      setImportResult({ success: false, message: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }, [onImportFinancials]);

  const parseInsiderCSV = useCallback((text: string): ParsedInsiderTrade[] => {
    const trades: ParsedInsiderTrade[] = [];
    let cleanText = text;
    if (text.includes('\0')) cleanText = text.replace(/\0/g, '');
    const lines = cleanText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

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

      // Extract "Karaktär" - typically column 12
      const nature = cols[12]?.trim() || undefined;

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
        nature,
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
      let text = new TextDecoder('utf-16le').decode(arrayBuffer);
      if (!text.includes('Emittent') && !text.includes('Publiceringsdatum')) text = new TextDecoder('utf-8').decode(arrayBuffer);
      if (!text.includes('Emittent') && !text.includes('Publiceringsdatum')) text = new TextDecoder('iso-8859-1').decode(arrayBuffer);
      const trades = parseInsiderCSV(text);
      if (trades.length === 0) { setImportResult({ success: false, message: 'No insider trades found in file.' }); return; }
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
        <Button variant="outline" size="sm" className="gap-2"><Upload className="h-4 w-4" />Import Data</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Data</DialogTitle>
          <DialogDescription>Import financial data from Börsdata Excel or insider trades from FI</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="financials" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="financials" className="gap-2"><FileSpreadsheet className="h-4 w-4" />Financials</TabsTrigger>
            <TabsTrigger value="insiders" className="gap-2"><Users className="h-4 w-4" />Insider Trades</TabsTrigger>
          </TabsList>
          <TabsContent value="financials" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Import from Börsdata Excel</Label>
              <p className="text-sm text-muted-foreground">Upload an XLSX file exported from Börsdata. Revenue, EBIT, margins and more will be extracted automatically.</p>
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                <input type="file" accept=".xlsx,.xls" onChange={handleFinancialFile} className="hidden" id="financial-file" disabled={importing} />
                <label htmlFor="financial-file" className="cursor-pointer">
                  {importing ? (
                    <div className="flex flex-col items-center gap-2"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Parsing Excel file...</span></div>
                  ) : (
                    <div className="flex flex-col items-center gap-2"><FileSpreadsheet className="h-8 w-8 text-muted-foreground" /><span className="text-sm text-muted-foreground">Click to upload Börsdata XLSX</span><span className="text-xs text-muted-foreground">Supports yearly & quarterly data</span></div>
                  )}
                </label>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="insiders" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Import from FI (Finansinspektionen)</Label>
              <p className="text-sm text-muted-foreground">Upload a CSV file from insynsok.fi.se with insider trading data.</p>
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                <input type="file" accept=".csv" onChange={handleInsiderFile} className="hidden" id="insider-file" disabled={importing} />
                <label htmlFor="insider-file" className="cursor-pointer">
                  {importing ? (
                    <div className="flex flex-col items-center gap-2"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Parsing CSV file...</span></div>
                  ) : (
                    <div className="flex flex-col items-center gap-2"><Users className="h-8 w-8 text-muted-foreground" /><span className="text-sm text-muted-foreground">Click to upload FI CSV</span><span className="text-xs text-muted-foreground">Export from insynsok.fi.se</span></div>
                  )}
                </label>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        {importResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${importResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
            {importResult.success ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            <span className="text-sm">{importResult.message}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
