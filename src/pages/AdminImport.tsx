import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { parseBoersdataExcel, parseBoersdataInfoSheet, type ParsedFinancialData, type ParsedCompanyInfo } from '@/components/company/FileImportDialog';

const USER_MAP: Record<string, string> = {
  'andré': '3924ba1f-e8e5-4285-b2fa-ad43bd7b6627',
  'andre': '3924ba1f-e8e5-4285-b2fa-ad43bd7b6627',
  'pontus': 'ae160905-7460-44cc-8cfb-32c9ea6fb309',
};

const DEFAULT_USER = '3924ba1f-e8e5-4285-b2fa-ad43bd7b6627'; // André

function extractOwner(name: string): { companyName: string; userId: string } {
  // Match _André, _andre, _Pontus, _pontus at end
  const match = name.match(/^(.+?)_(\w+)$/);
  if (match) {
    const rawCompany = match[1].trim();
    const suffix = match[2].toLowerCase();
    const userId = USER_MAP[suffix] || DEFAULT_USER;
    return { companyName: rawCompany, userId };
  }
  return { companyName: name.trim(), userId: DEFAULT_USER };
}

/**
 * Given the raw rows of a single analysis section (between Analysavskiljare markers),
 * create a virtual XLSX workbook and parse it using the existing logic.
 */
function parseSectionAsWorkbook(sectionRows: any[][], allSheetNames: string[]): {
  yearly: ParsedFinancialData[];
  quarterly: ParsedFinancialData[];
  companyInfo: ParsedCompanyInfo;
  sectionName: string;
} {
  // First row should contain the section name/company name
  let sectionName = '';
  for (const row of sectionRows.slice(0, 5)) {
    if (row) {
      for (const cell of row) {
        if (cell && typeof cell === 'string' && cell.trim() && !cell.toLowerCase().includes('analysavskiljare')) {
          sectionName = cell.trim();
          break;
        }
      }
      if (sectionName) break;
    }
  }

  // Find sub-sections within this analysis section
  // Look for sheet-like markers (Year/År, Quarter/Kvartal, Info, R12)
  const subSections: { type: string; startRow: number; endRow: number }[] = [];
  
  for (let i = 0; i < sectionRows.length; i++) {
    const row = sectionRows[i];
    if (!row) continue;
    const firstCell = row[0];
    if (!firstCell || typeof firstCell !== 'string') continue;
    const lower = firstCell.trim().toLowerCase();
    
    // Check if this row is a sub-section header
    if (lower === 'year' || lower === 'år' || lower.includes('yearly') || lower.includes('årlig')) {
      subSections.push({ type: 'year', startRow: i, endRow: sectionRows.length });
    } else if (lower === 'quarter' || lower === 'kvartal' || lower.includes('kvartals')) {
      subSections.push({ type: 'quarter', startRow: i, endRow: sectionRows.length });
    } else if (lower === 'r12') {
      subSections.push({ type: 'r12', startRow: i, endRow: sectionRows.length });
    } else if (lower === 'info') {
      subSections.push({ type: 'info', startRow: i, endRow: sectionRows.length });
    }
  }

  // Fix endRow for each sub-section
  for (let i = 0; i < subSections.length - 1; i++) {
    subSections[i].endRow = subSections[i + 1].startRow;
  }

  // If no sub-sections found, treat the whole section as yearly data
  if (subSections.length === 0) {
    // Try to create a virtual workbook with the section data as a "Year" sheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sectionRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Year');
    const { yearly, quarterly } = parseBoersdataExcel(wb);
    return { yearly, quarterly, companyInfo: {}, sectionName };
  }

  // Build virtual workbook from sub-sections
  const wb = XLSX.utils.book_new();
  
  for (const sub of subSections) {
    const subRows = sectionRows.slice(sub.startRow + 1, sub.endRow);
    if (subRows.length === 0) continue;
    const ws = XLSX.utils.aoa_to_sheet(subRows);
    const sheetName = sub.type === 'year' ? 'Year' : sub.type === 'quarter' ? 'Quarter' : sub.type === 'r12' ? 'R12' : 'Info';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  // If workbook has no sheets, try treating everything as Year
  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet(sectionRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Year');
  }

  const { yearly, quarterly } = parseBoersdataExcel(wb);
  const companyInfo = parseBoersdataInfoSheet(wb);

  return { yearly, quarterly, companyInfo, sectionName };
}

export default function AdminImport() {
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (msg: string) => {
    console.log('[AdminImport]', msg);
    setLog(prev => [...prev, msg]);
  };

  const runImport = async () => {
    setLoading(true);
    setLog([]);

    try {
      addLog('Fetching Excel file...');
      const response = await fetch('/temp-import.xlsx');
      const arrayBuffer = await response.arrayBuffer();
      
      addLog('Parsing Excel file...');
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      addLog(`Sheet names: ${workbook.SheetNames.join(', ')}`);

      // Get all data from first sheet (or find the main sheet)
      const mainSheetName = workbook.SheetNames[0];
      const mainSheet = workbook.Sheets[mainSheetName];
      const allData: any[][] = XLSX.utils.sheet_to_json(mainSheet, { header: 1, defval: null, raw: true });
      addLog(`Total rows in ${mainSheetName}: ${allData.length}`);

      // Find Analysavskiljare markers
      const markerRows: number[] = [];
      for (let i = 0; i < allData.length; i++) {
        const row = allData[i];
        if (row && row.some((cell: any) => typeof cell === 'string' && cell.toLowerCase().includes('analysavskiljare'))) {
          markerRows.push(i);
        }
      }
      addLog(`Found ${markerRows.length} Analysavskiljare markers at rows: ${markerRows.join(', ')}`);

      if (markerRows.length === 0) {
        addLog('ERROR: No Analysavskiljare markers found. Cannot split analyses.');
        setLoading(false);
        return;
      }

      // Split into sections
      const sections: { rows: any[][]; startRow: number }[] = [];
      
      // First section: from start to first marker (if there's content)
      if (markerRows[0] > 2) {
        sections.push({ rows: allData.slice(0, markerRows[0]), startRow: 0 });
      }
      
      // Sections between markers
      for (let i = 0; i < markerRows.length; i++) {
        const start = markerRows[i] + 1; // skip the marker row itself
        const end = i + 1 < markerRows.length ? markerRows[i + 1] : allData.length;
        const sectionRows = allData.slice(start, end);
        if (sectionRows.length > 2) { // Need at least a few rows
          sections.push({ rows: sectionRows, startRow: start });
        }
      }

      addLog(`Split into ${sections.length} sections`);

      // Parse each section
      const analyses: any[] = [];
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        addLog(`\nParsing section ${i + 1} (starting at row ${section.startRow}, ${section.rows.length} rows)...`);
        
        // Debug: show first 3 rows
        for (let r = 0; r < Math.min(3, section.rows.length); r++) {
          const row = section.rows[r];
          if (row) {
            const cells = row.slice(0, 8).map((c: any) => c === null ? 'null' : String(c)).join(' | ');
            addLog(`  Row ${r}: ${cells}`);
          }
        }

        const parsed = parseSectionAsWorkbook(section.rows, workbook.SheetNames);
        const { companyName, userId } = extractOwner(parsed.sectionName);
        
        addLog(`  Company: "${companyName}" (from "${parsed.sectionName}"), User: ${userId === DEFAULT_USER ? 'André' : 'Pontus'}`);
        addLog(`  Yearly data: ${parsed.yearly.length} years, Quarterly: ${parsed.quarterly.length} quarters`);
        
        if (parsed.yearly.length > 0) {
          addLog(`  Years: ${parsed.yearly.map(y => y.fiscal_year).join(', ')}`);
        }

        if (parsed.yearly.length > 0 || parsed.quarterly.length > 0) {
          analyses.push({
            companyName,
            userId,
            yearly: parsed.yearly,
            quarterly: parsed.quarterly,
            companyInfo: parsed.companyInfo,
          });
        } else {
          addLog(`  ⚠️ No data found, skipping`);
        }
      }

      addLog(`\n=== Ready to import ${analyses.length} analyses ===`);
      addLog('Calling import edge function...');

      const { data, error } = await supabase.functions.invoke('import-analyses', {
        body: { analyses },
      });

      if (error) {
        addLog(`ERROR calling function: ${error.message}`);
      } else {
        addLog('=== Import Complete ===');
        if (data.clearLog) {
          for (const l of data.clearLog) addLog(`  [Clear] ${l}`);
        }
        if (data.insertLog) {
          for (const l of data.insertLog) addLog(`  [Insert] ${l}`);
        }
        addLog(`Total analyses imported: ${data.totalAnalyses}`);
      }
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const previewStructure = async () => {
    setLoading(true);
    setLog([]);

    try {
      addLog('Fetching Excel file...');
      const response = await fetch('/temp-import.xlsx');
      const arrayBuffer = await response.arrayBuffer();
      
      addLog('Parsing Excel file...');
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      addLog(`Sheet names: ${workbook.SheetNames.join(', ')}`);

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
        addLog(`\n--- Sheet: ${sheetName} (${data.length} rows) ---`);
        
        // Show first 15 rows
        for (let i = 0; i < Math.min(15, data.length); i++) {
          const row = data[i];
          if (row) {
            const cells = row.slice(0, 10).map((c: any) => c === null ? '' : String(c)).join(' | ');
            addLog(`  [${i}] ${cells}`);
          }
        }

        // Find markers
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          if (row && row.some((cell: any) => typeof cell === 'string' && cell.toLowerCase().includes('analysavskiljare'))) {
            addLog(`\n  MARKER at row ${i}:`);
            // Show context around marker
            for (let j = Math.max(0, i - 1); j < Math.min(data.length, i + 10); j++) {
              const r = data[j];
              if (r) {
                const cells = r.slice(0, 10).map((c: any) => c === null ? '' : String(c)).join(' | ');
                addLog(`  [${j}]${j === i ? ' >>>' : '   '} ${cells}`);
              }
            }
          }
        }
      }
    } catch (err: any) {
      addLog(`ERROR: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Admin Import - Servettkalkyler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button onClick={previewStructure} disabled={loading} variant="outline">
              Preview Structure
            </Button>
            <Button onClick={runImport} disabled={loading} variant="destructive">
              {loading ? 'Working...' : '🗑️ Clear DB & Import All'}
            </Button>
          </div>
          
          <div className="bg-muted rounded-lg p-4 max-h-[600px] overflow-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {log.length === 0 ? 'Click a button to start...' : log.join('\n')}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
