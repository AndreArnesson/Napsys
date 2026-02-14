

# Plan: 10 Improvements to Analysis and Company Pages

This is a large set of changes spanning database schema, file parsing, UI components, and business logic. Here's the breakdown:

---

## 1. Toggle Total vs Per Share in Analysis Page

**Current state**: The `HistoricalDataTable` already has a total/per-share toggle button, but the `SpreadsheetAnalysis` component (the estimates grid) does not.

**Changes**:
- Add a `perShare` toggle state to `SpreadsheetAnalysis`
- When active, divide revenue and other absolute values by `sharesOutstanding`
- Display both modes in the spreadsheet grid

---

## 2. Show Dividend Data

**Current state**: `ParsedFinancialData` already parses `dividend` from Excel, but it's never stored in the database or displayed.

**Changes**:
- **Database migration**: Add `dividend NUMERIC` and `earnings_per_share NUMERIC` columns to `income_statement`
- **FileImportDialog**: Include `dividend` and `earnings_per_share` in the income rows sent to DB
- **HistoricalDataTable**: Add a "Utdelning" column option
- **CompanyDetail financials tab**: Show dividend in the table

---

## 3. Quarterly Data Support + Quarterly Estimates

**Current state**: Only yearly data is supported. No quarterly tables exist.

**Changes**:
- **Database migration**: Create `quarterly_income_statement` and `quarterly_balance_sheet` tables with `fiscal_year`, `quarter` columns, plus same financial fields. Add RLS policies mirroring the yearly tables.
- **FileImportDialog**: Detect and parse Borsdata "Quarter"/"Kvartal" sheet, store to quarterly tables
- **CompanyDetail**: Add yearly/quarterly toggle on financials tab
- **AnalysisEditor**: Fetch quarterly data and allow estimates on quarter basis in the SpreadsheetAnalysis component
- **HistoricalDataTable**: Accept a `period` mode prop to show quarterly data

---

## 4. Name Your Analysis

**Current state**: Analyses have no name/title field. The analysis list shows only rating + MOS + timestamp.

**Changes**:
- **Database migration**: Add `name TEXT` column to `analyses`
- **AnalysisEditor**: Add a name input field in the header
- **CompanyDetail analysis list**: Display the analysis name prominently in each card

---

## 5. Upload Images in Analysis and Overview

**Current state**: No image upload capability exists.

**Changes**:
- **Storage**: Create a storage bucket `analysis-images` via migration
- **AnalysisEditor**: Add an image upload area (drag-and-drop) that uploads to storage and saves the URL
- **Database migration**: Add `images JSONB` column to `analyses` table (stores array of image URLs)
- **CompanyDetail overview**: Add image upload section for company-level images; add `images JSONB` to `companies` table
- **Display**: Show uploaded images as a gallery/grid in both views

---

## 6. Fix EV/EBIT/EBITDA in "Vardering" Column Selection

**Current state**: The `HistoricalDataTable` defines `ev`, `ev_ebit`, `ev_ebitda` columns in `ALL_COLUMNS` and they can be toggled on, but the table rendering never handles these column keys. The `computeEV` function returns `undefined` because it lacks market cap data.

**Changes**:
- The EV columns require a current market cap. Pass `currentPrice` as a prop to `HistoricalDataTable`
- Compute EV per year as: `(currentPrice * sharesOutstanding) + totalDebt - cash` (using current market cap as approximation)
- Add rendering for `isVisible('ev')`, `isVisible('ev_ebit')`, `isVisible('ev_ebitda')` in both `TableHeader` and `TableBody`

---

## 7. Financial Import Scoped to Analysis (Not Global)

**Current state**: Uploading financials overwrites ALL income/balance data for the company, affecting every analysis.

**Changes**:
- **Database migration**: Add `analysis_id UUID REFERENCES analyses(id)` column to `income_statement` and `balance_sheet` (nullable -- null means "company-level/shared data")
- **AnalysisEditor**: Add an import button that stores data with the specific `analysis_id`
- **AnalysisEditor queries**: When fetching data, prefer analysis-specific data if it exists, fall back to company-level
- **CompanyDetail**: Keep existing import as company-level (analysis_id = null), which serves as the default baseline
- Update RLS policies for the new column

---

## 8. Read Number of Shares from Uploaded Financial

**Current state**: `parseBoersdataInfoSheet` already looks for "number of shares" / "antal aktier" in the Info sheet and stores it to `companyInfo.sharesOutstanding`. This is then saved to the `companies` table.

**Changes**:
- Also check the Year/data sheet for "antal aktier" / "number of shares" row and parse it per year
- Add `shares_outstanding BIGINT` to `income_statement` (or a dedicated field) so per-year share counts are preserved
- Display in the historical data table

---

## 9. Fix 2025 Data Not Showing

**Current state**: The `extractYear` function accepts years 2000-2035, so 2025 should work. The issue is likely in the Excel parsing -- the year header detection or the sheet range correction.

**Changes**:
- Debug by checking the console logs from the import. The likely cause is that 2025 data appears as a date serial (e.g., "2025/12" formatted as an Excel date like 45657) that isn't being correctly extracted.
- Update `extractYear` to handle more date serial formats and partial-year strings like "2025/12"
- Add more robust logging and fix edge cases in `parseBoersdataExcel` where the header row scan might miss 2025 columns
- Verify with the user's actual file format

---

## 10. Add "Karaktar" (Nature) to Insider Trading Table

**Current state**: The FI CSV parser reads column index 11 for type (Forvary/Avyttring) but doesn't extract "Karaktar" (Nature of transaction). The `InsiderTrade` interface and `InsiderTable` don't have this field.

**Changes**:
- **ParsedInsiderTrade**: Add `nature?: string` field
- **parseInsiderCSV**: Extract the "Karaktar" column from the FI CSV (typically around column index 12 or nearby)
- **InsiderTrade interface**: Add `nature?: string`
- **InsiderTable**: Add a "Karaktar" column showing the nature of the transaction

---

## Technical Summary

### Database Migrations Needed:
1. Add `dividend`, `earnings_per_share` to `income_statement`
2. Add `name`, `images` to `analyses`
3. Add `images` to `companies`
4. Create `quarterly_income_statement` and `quarterly_balance_sheet` tables with RLS
5. Create storage bucket `analysis-images`
6. Add `analysis_id` to `income_statement` and `balance_sheet` for per-analysis scoping

### Files to Modify:
- `src/components/company/FileImportDialog.tsx` -- parse dividend, quarterly data, shares per year, fix 2025
- `src/components/company/InsiderTable.tsx` -- add "Karaktar" column
- `src/components/analysis/HistoricalDataTable.tsx` -- render EV columns, add dividend, quarterly mode
- `src/components/analysis/SpreadsheetAnalysis.tsx` -- per-share toggle, quarterly estimates
- `src/pages/AnalysisEditor.tsx` -- analysis name, image upload, per-analysis import, pass currentPrice to HistoricalDataTable
- `src/pages/CompanyDetail.tsx` -- analysis name display, image upload on overview, quarterly toggle on financials

### New Files:
- Image upload component (shared between analysis and overview)

