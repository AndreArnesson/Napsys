

## Plan: Portföljhantering ("Min portfölj")

### Koncept
En ny sektion i appen där användaren kan:
1. Skapa flera namngivna portföljer (t.ex. "Aktivt förvaltad", "Byrålådan")
2. Göra portföljuppdateringar per datum — varje uppdatering är en "snapshot" av innehavet vid det tillfället
3. Per innehav ange: bolag/ticker, andel (% eller kr), conviction, motivering, övrigt
4. Importera bankutdrag via CSV/Excel/PDF som AI tolkar och fyller i

### Databasschema

**Tabell: `portfolios`**
- `id` uuid PK
- `user_id` uuid (NOT NULL)
- `name` text (t.ex. "Byrålådan")
- `created_at`, `updated_at`

**Tabell: `portfolio_snapshots`**
- `id` uuid PK
- `portfolio_id` uuid → portfolios
- `snapshot_date` date
- `comment` text (övergripande kommentar)
- `created_at`

**Tabell: `portfolio_holdings`**
- `id` uuid PK
- `snapshot_id` uuid → portfolio_snapshots
- `company_name` text
- `ticker` text
- `weight_percent` numeric (andel i %)
- `value_sek` numeric (värde i kr)
- `conviction` text (hög/medel/låg)
- `rationale` text (motivering)
- `notes` text (övrigt)
- `created_at`

RLS-policies via `portfolio_id → portfolios.user_id = auth.uid()`.

### Frontend-ändringar

1. **Sidebar** (`Sidebar.tsx`): Lägg till nav-item "Min portfölj" med `Briefcase`-ikon, route `/portfolio`
2. **Route** i `App.tsx`: `/portfolio` → ny `Portfolio.tsx`-sida
3. **Portfolio.tsx**: 
   - Lista portföljer med möjlighet att skapa nya
   - Klick på portfölj visar lista av snapshots (sorterade efter datum)
   - Knapp "Ny portföljuppdatering" → dialog med datumväljare
4. **PortfolioSnapshot.tsx**: 
   - Tabell med holdings (bolag, %, kr, conviction, motivering, övrigt)
   - Inline-redigering eller formulär för att lägga till/ta bort innehav
   - Visa historik av snapshots i en tidslinje
5. **Import-funktion**: 
   - Knapp "Importera utdrag" som accepterar CSV, XLSX, PDF
   - Edge function `parse-portfolio-import` som tar filen, extraherar text (PDF via pdf-parse, Excel via xlsx), skickar till AI (Lovable AI / Gemini Flash) med prompt att tolka till strukturerad JSON med holdings
   - Resultatet förhandsgranskas innan det sparas

### Edge Function: `parse-portfolio-import`
- Tar emot fil (base64) + filtyp + portföljnamn
- Parsar till text beroende på format
- Skickar till Lovable AI Gateway med prompt att extrahera: bolag, ticker, andel, värde
- Returnerar strukturerad JSON
- Användaren kan även skriva en fritext-prompt som AI tolkar

### Translations
Lägg till `portfolio`-sektion i sv/en translations.

### Filer som skapas/ändras
- `supabase/migrations/...` — 3 nya tabeller + RLS
- `supabase/functions/parse-portfolio-import/index.ts` — ny edge function
- `src/pages/Portfolio.tsx` — ny sida
- `src/components/portfolio/PortfolioList.tsx` — lista/skapa portföljer
- `src/components/portfolio/SnapshotEditor.tsx` — redigera snapshot med holdings
- `src/components/portfolio/ImportDialog.tsx` — importera bankutdrag
- `src/components/layout/Sidebar.tsx` — ny nav-länk
- `src/App.tsx` — ny route
- `src/i18n/translations.ts` — nya strängar
- `supabase/config.toml` — ny function-config

