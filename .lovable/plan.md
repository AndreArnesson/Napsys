

# Fix: Missing 2025 Data and Wrong EV/EBIT Calculations

## Problem 1: EV/EBIT and EV/EBITDA show absurd values (6,738,116x)

The root cause is a **unit mismatch**. In `AnalysisEditor.tsx`, the EV (Enterprise Value) is calculated as:
- `marketCap = price * sharesOutstanding = 13.56 * 29,119,000 = ~395,000,000 SEK` (raw SEK)
- `netDebt = long_term_debt - cash = 14.6 - 50.6 = -36 MSEK` (in millions from DB)

Then `EV / EBIT = 395,000,000 / 58.6 = 6,738,116x` -- completely wrong because EBIT (58.6) is in MSEK but marketCap is in raw SEK.

**Fix**: Convert marketCap to MSEK before computing EV ratios. Divide `marketCap` by `1,000,000` so all values are in the same unit (MSEK).

**File**: `src/pages/AnalysisEditor.tsx` (lines 405-418)

The same unit issue also exists in `HistoricalDataTable.tsx` `computeEV` function (line 168-173), where `currentPrice * sharesOutstanding` gives raw SEK but debt/cash are in MSEK.

**Files**: `src/components/analysis/HistoricalDataTable.tsx` (lines 167-173)

## Problem 2: Missing 2025 historical data

The Boersdata Excel says "Senaste rapport: Q4 2025", meaning there should be 2025 data. The Year sheet header columns likely include 2025 (formatted as `2025/12` which becomes an Excel date serial number). The parser's `extractYear` function handles date serials, but there may be an edge case where 2025/12 is stored differently.

**Investigation needed**: Add console logging for the exact header values found. Additionally, the Boersdata "R12" (Rolling 12 months) sheet may contain the latest 2025 full-year data that the Year sheet doesn't yet have. The parser currently only reads the "Year" sheet -- it should also try the "R12" sheet for the most recent fiscal year if it contains newer data than the Year sheet.

**Fix**: In `parseBoersdataExcel`, also parse the R12 sheet and merge in any fiscal years not already present in the yearly data.

**File**: `src/components/company/FileImportDialog.tsx`

## Technical Changes

### 1. Fix EV unit mismatch in `AnalysisEditor.tsx`
Change the EV calculation block (lines 405-418) to convert marketCap to MSEK:

```typescript
const marketCap = priceNum * sharesNum;
const marketCapMSEK = marketCap / 1_000_000;
// netDebt, ebit, ebitda are already in MSEK from DB
const ev = netDebt !== null ? marketCapMSEK + netDebt : null;
```

Also update display to show `ev / 1e3` for Mdr instead of `ev / 1e9`.

### 2. Fix EV unit mismatch in `HistoricalDataTable.tsx`
Same fix in `computeEV`:

```typescript
const marketCap = currentPrice * sharesOutstanding;
const marketCapMSEK = marketCap / 1_000_000;
return marketCapMSEK + debt - cash;
```

Update the EV display formatting accordingly.

### 3. Parse R12 sheet for latest data in `FileImportDialog.tsx`
In `parseBoersdataExcel`, after parsing the Year sheet, also look for an "R12" sheet. If it contains a fiscal year not present in the yearly data (e.g., 2025), merge that data in.

### 4. Fix Borsvarde/EV display in sidebar
The sidebar shows `(priceNum * sharesNum) / 1e9` for Borsvarde in "Mdr" -- this is correct since price*shares is in raw SEK. But EV must use the corrected MSEK calculation and display as `(evMSEK / 1000).toFixed(2) Mdr`.
