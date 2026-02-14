
## Fix Database Schema and Build Errors

There are three distinct issues to resolve:

### 1. Missing columns on `analyses` table (causes 400 error)
The code tries to insert `current_price` and `shares_outstanding` into the `analyses` table, and also tries to update those fields in AnalysisEditor. However, these columns don't exist on the table. We need to add them via a database migration.

**Migration SQL:**
- Add `current_price NUMERIC` to `analyses`
- Add `shares_outstanding BIGINT` to `analyses`

### 2. Missing column on `balance_sheet` table (build error)
AnalysisEditor references `short_term_debt` on balance_sheet rows, but the table doesn't have this column. We need to add it.

**Migration SQL:**
- Add `short_term_debt NUMERIC` to `balance_sheet`

### 3. TypeScript build errors in CompanyDetail.tsx
The CEO data casting has type issues. The fix:
- Change line 122 to cast through `unknown` first: `(company.management as unknown as CEOData)`
- Handle the fallback case with explicit `String()` cast: `{ name: String(company.management) }`

### Summary of changes
1. **Database migration**: Add `current_price`, `shares_outstanding` to `analyses`; add `short_term_debt` to `balance_sheet`
2. **CompanyDetail.tsx**: Fix CEOData type casting on lines 121-123
