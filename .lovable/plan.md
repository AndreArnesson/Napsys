

# Improvement Plan: 9 Features and Fixes

This is a large set of changes. I recommend implementing them in batches to keep things manageable. Here's the plan grouped by priority and complexity.

---

## 1. Navigation between Overview and Analysis

**Problem**: You constantly switch between overview (company detail tabs) and the analysis editor, which are separate pages.

**Solution**: Add a persistent floating navigation bar or breadcrumb-style quick-nav at the top of the analysis editor that lets you jump back to specific tabs on the company page (and vice versa). Also add a "quick-switch" dropdown on both pages showing all analyses for the company.

**Changes**:
- `AnalysisEditor.tsx`: Replace the simple "Back" link with a mini tab bar: "Oversikt | Finansiell data | Analys" that links to the right company tab
- `CompanyDetail.tsx`: Add a quick link to the most recent analysis in the header area

---

## 2. Dividend Yield (Direktavkastning) in Estimates

**Problem**: Dividend yield is missing from the estimate spreadsheet.

**Solution**: Add a computed "Direktavkastning (%)" row to `SpreadsheetAnalysis.tsx`. It calculates as `(dividend / price) * 100`. The dividend row should also be added as an editable input.

**Changes**:
- `SpreadsheetAnalysis.tsx`: Add "Utdelning (SEK)" editable row and "Direktavkastning (%)" computed row to the `rows` array. Add `dividend` to the `YearlyProjection` interface.

---

## 3. Financial Import Should Not Affect Other Analyses

**Problem**: When importing financial data from the company overview page, it overwrites company-level data (`analysis_id = null`). Since analyses without their own scoped data fall back to company-level data, re-importing changes what existing analyses display.

**Solution**: The current architecture already supports analysis-scoped data (analyses that have imported their own data use `analysis_id = X`). The issue is the fallback. When an analysis is created, it should snapshot the current company-level data at creation time.

**Changes**:
- `CompanyDetail.tsx` (analysis creation): When creating a new analysis, copy all current company-level `income_statement` and `balance_sheet` rows into analysis-scoped rows (with the new `analysis_id`). This way each analysis has its own frozen copy.
- This means future company-level imports won't affect existing analyses.

---

## 4. Rich Text Editing (Lists, Tables, Bold, etc.)

**Problem**: Text fields (notes, description, moats) are plain `<Textarea>` with no formatting.

**Solution**: Replace `<Textarea>` with a lightweight rich text editor. I'll use a simple approach with a toolbar for bold, italic, lists, using `contentEditable` with a minimal implementation or a small library like Tiptap.

**Recommendation**: Use a custom minimal rich-text component with buttons for Bold, Italic, Bullet List, Numbered List, and render the output as HTML/Markdown. Store as HTML string in the database.

**Changes**:
- Create `src/components/ui/rich-text-editor.tsx`: A reusable rich text component with basic toolbar
- Update `SpreadsheetAnalysis.tsx` (notes), `CompanyDetail.tsx` (description, moats), and `AnalysisEditor.tsx` to use the new editor

---

## 5. Missing Insider Trades (Nelly June 2025)

**Problem**: Insider trades are stored only in React state (`useState`), not in the database. When you navigate away and come back, they're gone. Additionally, the parser may be filtering out some trades.

**Solution**: 
- Create an `insider_trades` table in the database to persist imported trades
- Update `CompanyDetail.tsx` to load/save trades from the database
- Review the parser for any filtering issues

**Changes**:
- Database migration: Create `insider_trades` table with columns matching the `InsiderTrade` interface
- `CompanyDetail.tsx`: Replace `useState` for insider trades with DB queries
- `FileImportDialog.tsx`: Review the parser to ensure all trades are captured (check for date filtering or row limits)

---

## 6. Optional Sections on Overview (Founded, Business Model)

**Problem**: The overview page has fixed sections. You want to optionally show/hide sections and add new ones like "Grundat" (founded year) and "Affarsmodell" (business model).

**Solution**: Add a section picker (checkboxes or toggles) that lets you choose which sections to display. Add new fields to the company record for `founded_year` and `business_model`.

**Changes**:
- Database migration: Add `founded_year` (integer) and `business_model` (text) columns to `companies`
- `CompanyDetail.tsx`: Add collapsible sections for the new fields. Add a settings popover to toggle section visibility (stored in company record or localStorage)

---

## 7. Optional Sections in Analysis (Employees, Debt)

**Problem**: The analysis editor shows DebtSection always. You want optional/toggleable sections.

**Solution**: Add toggle switches in the analysis sidebar to show/hide sections like Debt, plus new sections like "Anstallda" (employees).

**Changes**:
- `AnalysisEditor.tsx`: Add toggle state for each optional section. Add an "Anstallda" (employees) input field.
- Database: Add `employees` column to `analyses` or store in a flexible JSON field

---

## 8. Paste Screenshots Easily

**Problem**: Currently you have to click "Lagg till" and browse for files. You want to paste from clipboard.

**Solution**: Add clipboard paste support to the `ImageUpload` component. Listen for `paste` events, extract image data from clipboard, and upload automatically.

**Changes**:
- `ImageUpload.tsx`: Add `onPaste` event handler that reads `clipboardData.items` for image types, creates a Blob, uploads to storage, and adds to the image list. Also add drag-and-drop support.

---

## 9. Delete Analyses

**Problem**: There's no way to delete an analysis.

**Solution**: Add a delete button to each analysis card on the company detail page and a delete option in the analysis editor.

**Changes**:
- `CompanyDetail.tsx`: Add a delete button (with confirmation dialog) on each analysis card in the analysis tab
- `AnalysisEditor.tsx`: Add a delete button in the header that deletes the analysis and navigates back to the company page
- The delete should also clean up analysis-scoped `income_statement` and `balance_sheet` rows

---

## Implementation Order (Recommended)

| Batch | Items | Complexity |
|-------|-------|------------|
| 1 | #9 Delete analyses, #2 Dividend yield, #8 Paste screenshots | Low |
| 2 | #1 Navigation, #5 Insider trades DB, #3 Snapshot on create | Medium |
| 3 | #6 Overview sections, #7 Analysis sections | Medium |
| 4 | #4 Rich text editor | Medium-High |

---

## Technical Details

### Database Migrations Needed
1. `insider_trades` table: `id uuid PK, company_id uuid FK, date text, person text, position text, type text, volume numeric, price numeric, currency text, instrument text, isin text, nature text, created_at timestamptz`
2. `companies` table: Add `founded_year integer`, `business_model text` columns
3. `analyses` table: Add `employees integer`, `visible_sections jsonb` columns

### Rich Text Editor Approach
Use `document.execCommand` with a `contentEditable` div for simplicity (no extra dependencies). Store content as HTML. Toolbar buttons: **B**, *I*, bullet list, numbered list. Render saved HTML with `dangerouslySetInnerHTML` in read-only views.

### Clipboard Paste for Images
```typescript
// Listen for paste on the card/page
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      // Upload blob to storage...
    }
  }
});
```

### Analysis Snapshot on Create
When clicking "Ny analys", after inserting the analysis row, copy all `income_statement` and `balance_sheet` rows where `analysis_id IS NULL` and re-insert them with the new `analysis_id`.

