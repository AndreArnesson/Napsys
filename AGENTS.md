# Napsys

Napsys är en app för bolags- och investeringsanalyser. Frontend använder React,
TypeScript, Vite, Tailwind och shadcn/ui. Supabase hanterar databas, inloggning,
Storage och Edge Functions. Kör terminalkommandon från projektroten.

## Hitta i projektet

- `src/pages/`: sidor, bland annat `CompanyDetail.tsx`, `AnalysisEditor.tsx` och `Dashboard.tsx`.
- `src/components/`: återanvändbara komponenter och analysverktyg.
- `src/i18n/`: svenska och engelska texter; uppdatera båda språken vid nya UI-texter.
- `src/integrations/supabase/`: klient och databastyper.
- `supabase/migrations/`: versionshanterade databasändringar.
- `supabase/functions/`: Edge Functions.

## Databasmigreringar från terminalen

Supabase-projektet är **Napsys**, ref `ymwrlclbovmipkwgvqgw`, enligt
`supabase/config.toml`. Kontrollera att det länkade projektet är rätt före skrivning.
Använd terminalen när en migrering ingår i uppgiften. Installerad CLI vid senaste
kontrollen var `2.95.4`; kontrollera tillgängliga kommandon med `--help`.

1. Läs migrationshistoriken med `supabase migration list --linked`.
2. Skapa nya migrationsfiler med `supabase migration new <namn>`.
3. Granska SQL och verifiera ändringen lokalt före körning mot drift.
4. Kör en specifik fil och registrera därefter versionen:

   ```powershell
   supabase db query --linked --file "supabase/migrations/<version>_<namn>.sql"
   supabase migration repair <version> --status applied --linked
   ```

   Ersätt platshållarna med filens namn och tidsstämpel. Kör `repair` först när
   SQL-körningen lyckats; kommandot registrerar historik och kör ingen SQL.
5. Verifiera schema, behörigheter och migrationshistorik efteråt.

Historiken har en känd skillnad för `report_retention_30_days`: lokal fil har
version `20261101205316`, medan drift registrerat `20261101205359`. Kontrollera
skillnaden innan generell `supabase db push`; använd `--dry-run` för att se vad
som skulle köras. Ändra inte äldre migrationer för att få historiken att matcha.

Delningsmigreringen `20261105205426_add_company_sharing.sql` är registrerad som
tillämpad i drift, verifierat 2026-11-05. Kör inte om den som del av frontendändringar.
Även `20261105211843_add_stock_companions.sql` är tillämpad och registrerad,
verifierat 2026-11-07.

## Delning och behörigheter

Delning gäller ett företag med alla dess nuvarande och framtida analyser.
`ShareCompanyDialog.tsx` väljer godkända börskompanjoner från en lista och anropar
`share_company_with_companion`. Kompanjonsförfrågningar skapas via exakt e-post
och måste godkännas av mottagaren. Inställningar visar kompanjoner samt inkommande
och utgående delningar. Ingen e-post skickas.

`stock_companions` lagrar förfrågningar och godkända relationer. Att vara kompanjoner
ger ingen automatisk tillgång till analyser. `companion_all_shares` ger riktad
läsåtkomst till alla ägarens nuvarande och framtida företag och analyser. Stängs
den av finns enskilda företagsdelningar kvar. Tas kompanjonskapet bort raderas
delningar mellan personerna i båda riktningarna. Respektive person styr sin delning.

Dashboard och inställningar läser delade företag genom företagens RLS; enbart
`shares`-tabellen fångar inte användare som får åtkomst via delning av allt.

Bevara RLS och ägarkontroller på servern. Mottagarens vy ska inte autospara,
importera eller erbjuda ändring av ägarens data. Databasens privata funktion
slår upp exakt e-postadress utan att exponera användarregistret för frontend.

## Verifiering

- `npm run dev`: lokal utveckling.
- `npm run build`: produktionsbygge.
- `npm test`: Vitest; kör relevanta tester för ändringen.
- `npm test -- src/lib/companySharing.database.test.ts`: lokala PostgreSQL-tester
  via PGlite, inklusive RLS och återkallning; använder inte driftens databas.
- `npm test -- src/lib/stockCompanions.database.test.ts`: kompanjonsförfrågningar,
  riktad delning av allt, framtida analyser, borttagning och RLS via PGlite.
- `npx tsc --noEmit -p tsconfig.app.json`: typkontroll. Vid senaste kontrollen
  fanns 32 befintliga diagnostikfel; jämför mot utgångsläget och inför inga nya.

README innehåller fortfarande generisk Lovable-information. Kontrollera faktisk
konfiguration och kod innan du utgår från dess instruktioner för driftsättning.
