import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBoersdataExcel, ParsedFinancialData } from '@/components/company/FileImportDialog';

/**
 * Helper to build a mock XLSX workbook from sheet data.
 */
function buildWorkbook(sheetNames: string[], sheetsData: Record<string, any[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const name of sheetNames) {
    const data = sheetsData[name] || [];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

/**
 * Build a workbook where the Year sheet has an artificially narrow !ref,
 * simulating the Börsdata export bug where cells exist beyond the reported range.
 */
function buildWorkbookWithNarrowRef(
  sheetNames: string[],
  sheetsData: Record<string, any[][]>,
  narrowRef: string,
  narrowSheetName: string
): XLSX.WorkBook {
  const wb = buildWorkbook(sheetNames, sheetsData);
  wb.Sheets[narrowSheetName]['!ref'] = narrowRef;
  return wb;
}

describe('parseBoersdataExcel', () => {
  describe('horizontal format (years as columns)', () => {
    it('should parse a standard horizontal layout', () => {
      const data: any[][] = [
        ['Report(s)', null, null, null, 2024, 2023, 2022],
        ['Nettoomsättning', 'MSEK', null, null, 1000, 900, 800],
        ['EBIT', 'MSEK', null, null, 200, 180, 160],
        ['Net Income', 'MSEK', null, null, 100, 90, 80],
      ];
      const wb = buildWorkbook(
        ['Info', 'Year'],
        { 'Info': [['Company']], 'Year': data }
      );
      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(3);
      expect(result[0].fiscal_year).toBe(2022);
      expect(result[0].revenue).toBe(800);
      expect(result[0].ebit).toBe(160);
      expect(result[0].net_income).toBe(80);
      expect(result[2].fiscal_year).toBe(2024);
      expect(result[2].revenue).toBe(1000);
    });

    it('should parse Börsdata format with Swedish field names', () => {
      const data: any[][] = [
        ['Report', null, null, null, 2022, 2023, 2024],
        ['Nettoomsättning', 'MSEK', null, null, 636, 479, 486],
        ['Bruttoresultat', 'MSEK', null, null, 257, 167, 189],
        ['Rörelseresultat', 'MSEK', null, null, 115, -1.4, 15.3],
        ['EBITDA', 'MSEK', null, null, 126, 12.4, 34.1],
        ['Resultat Hänföring Aktieägare', 'MSEK', null, null, 84.0, -4.4, 10.7],
        ['Vinst/Aktie', 'SEK', null, null, 2.88, -0.15, 0.37],
        ['Utdelning', 'SEK', null, null, 0, 0, 0],
        [null, null, null, null, null, null, null],
        ['Summa Tillgångar', 'MSEK', null, null, 539, 565, 537],
        ['Summa Eget Kapital', 'MSEK', null, null, 271, 267, 278],
        ['Kassa/Bank', 'MSEK', null, null, 15.4, 4.3, 3.9],
        ['Totala Skulder', 'MSEK', null, null, 268, 298, 259],
        ['Kortfristiga Skulder', 'MSEK', null, null, 255, 275, 240],
        ['Långfristiga Skulder', 'MSEK', null, null, 13.6, 22.6, 18.7],
        [null, null, null, null, null, null, null],
        ['Bruttomarginal', '%', null, null, 40.4, 34.9, 39.0],
        ['Rörelsemarginal', '%', null, null, 18.2, -0.3, 3.2],
        ['Vinstmarginal', '%', null, null, 13.2, -0.9, 2.2],
        ['Soliditet', '%', null, null, 50.2, 47.3, 51.8],
      ];
      const wb = buildWorkbook(
        ['Info', 'Year'],
        { 'Info': [['Company']], 'Year': data }
      );
      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(3);

      // 2022
      const y2022 = result.find(r => r.fiscal_year === 2022)!;
      expect(y2022.revenue).toBe(636);
      expect(y2022.gross_income).toBe(257);
      expect(y2022.operating_income).toBe(115);
      expect(y2022.ebitda).toBe(126);
      expect(y2022.net_income).toBe(84.0);
      expect(y2022.earnings_per_share).toBe(2.88);
      expect(y2022.total_assets).toBe(539);
      expect(y2022.total_equity).toBe(271);
      expect(y2022.cash_equivalents).toBe(15.4);
      expect(y2022.total_liabilities).toBe(268);
      expect(y2022.gross_margin).toBeCloseTo(0.404);
      expect(y2022.operating_margin).toBeCloseTo(0.182);
      expect(y2022.net_margin).toBeCloseTo(0.132);
      expect(y2022.equity_ratio).toBeCloseTo(0.502);
    });
  });

  describe('narrow !ref correction', () => {
    it('should correct a narrow !ref and parse data beyond reported range', () => {
      // This simulates the actual Börsdata bug where !ref is A1:B79
      // but data extends to column L
      const data: any[][] = [
        ['Report', null, null, null, 2022, 2023, 2024],
        ['Nettoomsättning', 'MSEK', null, null, 636, 479, 486],
        ['Rörelseresultat', 'MSEK', null, null, 115, -1.4, 15.3],
        ['EBITDA', 'MSEK', null, null, 126, 12.4, 34.1],
      ];
      const wb = buildWorkbookWithNarrowRef(
        ['Info', 'Year'],
        { 'Info': [['Company']], 'Year': data },
        'A1:B4',
        'Year'
      );

      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(3);
      expect(result[0].fiscal_year).toBe(2022);
      expect(result[0].revenue).toBe(636);
      expect(result[0].operating_income).toBe(115);
      expect(result[0].ebitda).toBe(126);
      expect(result[2].fiscal_year).toBe(2024);
      expect(result[2].revenue).toBe(486);
    });

    it('should handle narrow !ref with full Börsdata-like data', () => {
      const data: any[][] = [
        ['Report(s)', null, null, null, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
        ['Nettoomsättning', 'MSEK', null, null, 325, 402, 636, 479, 486, 773, 698],
        ['Bruttoresultat', 'MSEK', null, null, 133, 158, 257, 167, 189, 324, 280],
        ['Summa Tillgångar', 'MSEK', null, null, 382, 473, 539, 565, 537, 597, 662],
        ['Summa Eget Kapital', 'MSEK', null, null, 181, 224, 271, 267, 278, 368, 416],
        ['Kassa/Bank', 'MSEK', null, null, 13.1, 14.9, 15.4, 4.3, 3.9, 20.4, 50.6],
        ['Bruttomarginal', '%', null, null, 41.0, 39.4, 40.4, 34.9, 39.0, 41.9, 40.1],
        ['Soliditet', '%', null, null, 47.5, 47.5, 50.2, 47.3, 51.8, 61.5, 62.8],
      ];
      // Set narrow !ref to simulate the bug
      const wb = buildWorkbookWithNarrowRef(
        ['Info', 'Year', 'R12', 'Quarter', 'PriceDay', 'PriceWeek', 'PriceMonth', 'Styles'],
        { 'Info': [['Company']], 'Year': data, 'R12': [[]], 'Quarter': [[]], 'PriceDay': [[]], 'PriceWeek': [[]], 'PriceMonth': [[]], 'Styles': [[]] },
        'A1:B8',
        'Year'
      );

      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(7); // 2018-2024
      
      const y2024 = result.find(r => r.fiscal_year === 2024)!;
      expect(y2024).toBeDefined();
      expect(y2024.revenue).toBe(698);
      expect(y2024.gross_income).toBe(280);
      expect(y2024.total_assets).toBe(662);
      expect(y2024.total_equity).toBe(416);
      expect(y2024.cash_equivalents).toBe(50.6);
      expect(y2024.gross_margin).toBeCloseTo(0.401);
      expect(y2024.equity_ratio).toBeCloseTo(0.628);

      const y2018 = result.find(r => r.fiscal_year === 2018)!;
      expect(y2018).toBeDefined();
      expect(y2018.revenue).toBe(325);
    });
  });

  describe('vertical format (years as rows, 2 columns)', () => {
    it('should parse a vertical layout with 2 columns', () => {
      const data: any[][] = [
        ['Report(s)', null],
        ['Net Sales', null],
        ['2024/12', 1000],
        ['2023/12', 900],
        ['2022/12', 800],
        ['EBIT', null],
        ['2024/12', 200],
        ['2023/12', 180],
        ['2022/12', 160],
      ];
      const wb = buildWorkbook(
        ['Info', 'Year'],
        { 'Info': [['Company']], 'Year': data }
      );
      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(3);
      expect(result[0].fiscal_year).toBe(2022);
      expect(result[0].revenue).toBe(800);
      expect(result[0].ebit).toBe(160);
      expect(result[2].fiscal_year).toBe(2024);
      expect(result[2].revenue).toBe(1000);
      expect(result[2].ebit).toBe(200);
    });

    it('should handle percentage fields in vertical format', () => {
      const data: any[][] = [
        ['Report(s)', null],
        ['Bruttomarginal', null],
        ['2024', 15.5],
        ['2023', 14.2],
        ['Revenue', null],
        ['2024', 500],
        ['2023', 450],
      ];
      const wb = buildWorkbook(
        ['Info', 'Year'],
        { 'Info': [['Company']], 'Year': data }
      );
      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(2);
      expect(result[0].fiscal_year).toBe(2023);
      expect(result[0].revenue).toBe(450);
      expect(result[0].gross_margin).toBeCloseTo(0.142);
      expect(result[1].fiscal_year).toBe(2024);
      expect(result[1].revenue).toBe(500);
      expect(result[1].gross_margin).toBeCloseTo(0.155);
    });

    it('should handle Swedish field names in vertical format', () => {
      const data: any[][] = [
        ['Report(s)', null],
        ['Nettoomsättning', null],
        ['2024/12', 1000],
        ['2023/12', 900],
        ['Rörelseresultat', null],
        ['2024/12', 200],
        ['2023/12', 180],
      ];
      const wb = buildWorkbook(
        ['Info', 'Year'],
        { 'Info': [['Company']], 'Year': data }
      );
      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(2);
      expect(result[0].fiscal_year).toBe(2023);
      expect(result[0].revenue).toBe(900);
      expect(result[0].operating_income).toBe(180);
    });
  });

  describe('sheet selection', () => {
    it('should find the Year sheet by name', () => {
      const wb = buildWorkbook(
        ['Info', 'Year'],
        { 'Info': [['X']], 'Year': [['Report', null, 2024, 2023, 2022], ['Revenue', null, 100, 90, 80], ['EBIT', null, 20, 18, 16]] }
      );
      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(3);
    });

    it('should find the År sheet by name', () => {
      const wb = buildWorkbook(
        ['Info', 'År'],
        { 'Info': [['X']], 'År': [['Report', null, 2024, 2023, 2022], ['Revenue', null, 100, 90, 80], ['EBIT', null, 20, 18, 16]] }
      );
      const result = parseBoersdataExcel(wb);
      expect(result.length).toBe(3);
    });
  });
});
