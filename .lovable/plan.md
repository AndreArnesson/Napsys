

## Remove Timeline Feature

The "Tidslinje" (Timeline) tab in company detail is dead code. The `timeline_events` table exists in the database but nothing ever writes to it. The tab just shows "Inga händelser ännu" permanently.

### Steps

1. **Remove Timeline tab and content from `CompanyDetail.tsx`**
   - Remove the `useQuery` for `timeline_events`
   - Remove the `<TabsTrigger value="timeline">` 
   - Remove the `<TabsContent value="timeline">` block

2. **Remove timeline translations from `translations.ts` and `LanguageContext.tsx`**
   - Remove `timeline` key from both `sv` and `en` translation objects
   - Remove `company.timeline` key
   - Remove timeline type from `LanguageContext.tsx`

3. **Clean up `Dashboard.tsx`**
   - Remove the `timeline_events` delete call when deleting a company

4. **Drop `timeline_events` table** via database migration (optional — can keep for future use)

