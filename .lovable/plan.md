

## Import Analyses from Excel

Since the Excel file is binary and can't be read directly, the approach is to build a backend function that parses the file and imports the data.

### Step 1: Deploy a discovery function

Create a temporary edge function `parse-excel-preview` that:
- Receives the uploaded Excel file
- Uses SheetJS (xlsx) to parse it
- Returns the sheet names, row counts, and first ~20 rows of each sheet as JSON

This lets us see the exact structure (what "Analysavskiljare" looks like, column layout, which sheets exist) before writing the import logic.

### Step 2: Build the import function

Based on the discovered structure, create an `import-analyses` edge function that:
1. Clears all data from: `income_statement`, `balance_sheet`, `quarterly_income_statement`, `quarterly_balance_sheet`, `analyses`, `insider_trades`, `companies`, `watchlist`, `shares`
2. Parses each section between "Analysavskiljare" markers as a separate analysis
3. Extracts company name from the section header (e.g. "Bolagsnamn_André")
4. Maps user ownership:
   - `_André` / `_andre` → `andre.arnesson@gmail.com` (user ID: `3924ba1f-e8e5-4285-b2fa-ad43bd7b6627`)
   - `_pontus` / `_Pontus` → `tstning@gmail.com` (user ID: `ae160905-7460-44cc-8cfb-32c9ea6fb309`)
5. Creates company records and analysis records with financial data using the existing `parseBoersdataExcel`-style field mappings
6. Uses the service role key to bypass RLS

### Step 3: Trigger the import

Call the edge function with the uploaded file to execute the import, then verify the data.

### User accounts
- `andre.arnesson@gmail.com` → `3924ba1f-e8e5-4285-b2fa-ad43bd7b6627`
- `tstning@gmail.com` → `ae160905-7460-44cc-8cfb-32c9ea6fb309`
- Third user: `flugansomaldrigkomhem@gmail.com` → `e3d6ecef-1182-474d-9ee6-c5b7c59edccf`

