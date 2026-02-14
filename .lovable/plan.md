

# Plan: 3 Improvements

## 1. Excel-style Watchlist (Bevakningslistan)

Replace the current dialog-based watchlist with an inline-editable spreadsheet table. Users can:
- Click any cell to edit it directly (inline inputs)
- Press "+" button at the bottom to add a new empty row
- Press "+" button on the right header to add a new custom column (stored as a JSONB `custom_columns` field)
- Delete rows with a trash icon per row

**Database change**: Add `custom_columns JSONB DEFAULT '{}'` to the `watchlist` table. This stores user-defined column names and values as key-value pairs per row.

**Component rewrite** (`WatchlistSection.tsx`):
- Remove the dialog-based form entirely
- Render cells as `<Input>` fields that auto-save on blur (debounced)
- Column headers for custom columns are also editable
- A "+" column header button opens a small popover to name a new column
- The "+" row button at the bottom inserts a new watchlist row via Supabase and refetches

## 2. Quarterly Estimates in SpreadsheetAnalysis

The current `SpreadsheetAnalysis` component only supports yearly columns (Year 0-3). It needs a mode toggle for quarterly estimates.

**Changes to `SpreadsheetAnalysis.tsx`**:
- Add a `mode` toggle: "Yearly" vs "Quarterly"
- When quarterly is selected, columns become `2026 Q1`, `2026 Q2`, `2026 Q3`, `2026 Q4`, `2027 Q1`, etc.
- Update the `YearlyProjection` interface to include an optional `quarter` field
- The `updateProjection` function keys on `year + quarter` instead of just `year`
- Revenue, EBIT, net margin, EPS, P/E, target P/E, estimated price, and MOS all work per-quarter
- Add props for quarterly mode control from `AnalysisEditor`

**Changes to `AnalysisEditor.tsx`**:
- Pass the `showQuarterly` state to `SpreadsheetAnalysis` so estimates match the data view mode

## 3. Auto-populate "Antal aktier" from Uploaded Financials

The parsing already extracts `sharesOutstanding` from the Info sheet and per-year data. The issue is that when importing from the Analysis page, the `companyInfo.sharesOutstanding` is used to update the company table BUT not the analysis-level `sharesOutstanding` state reliably.

**Fix in `AnalysisEditor.tsx`**:
- In `handleAnalysisImport`, after setting `setSharesOutstanding(String(companyInfo.sharesOutstanding))`, also check the latest year's `shares_outstanding` from the parsed data rows themselves (not just Info sheet)
- If `companyInfo.sharesOutstanding` is missing but individual year rows have `shares_outstanding`, use the latest year's value

**Fix in `CompanyDetail.tsx`**:
- Same logic: after import, also check if the company's `shares_outstanding` was updated and invalidate queries

---

## Technical Details

### Database Migration
- Add `custom_columns JSONB DEFAULT '{}'::jsonb` to `watchlist` table

### Files Modified
- `src/components/watchlist/WatchlistSection.tsx` -- full rewrite to inline-editable spreadsheet
- `src/components/analysis/SpreadsheetAnalysis.tsx` -- add quarterly mode with year+quarter columns
- `src/pages/AnalysisEditor.tsx` -- pass quarterly mode to SpreadsheetAnalysis, fix shares auto-populate
- `src/pages/CompanyDetail.tsx` -- fix shares auto-populate from import

