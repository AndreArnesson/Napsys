

## Plan: Snyggare AI-sammanfattning + automatisk aktiekurshämtning

### 1. Snyggare formatering av AI-sammanfattningar

AI-sammanfattningen returnerar markdown-text men renderas idag bara med `<br/>`-ersattning, vilket ser platt ut. Planen:

- Installera en liten markdown-till-HTML-konverterare (eller bygga en enkel egen med regex for rubriker, fetstil, listor, punktlistor)
- Alternativt: be AI:n returnera HTML direkt istallet for markdown
- Styla med `prose`-klasser for snygga rubriker, listor, fetstil
- Applicera pa bade finansiell sammanfattning och insynssammanfattning

**Losning:** Uppdatera edge function-prompten att returnera HTML istallet for markdown, och forbattra rendering-komponenten med en dedikerad `AISummaryCard`-komponent som hanterar formatering, generera-knapp och spara-knapp i ett snyggt kort.

### 2. Automatisk aktiekurshamtning via Yahoo Finance

Yahoo Finance har ett inofficiellt men pålitligt API som fungerar for svenska aktier (suffix `.ST`, t.ex. `VOLV-B.ST`). Det kraver ingen API-nyckel.

**Implementationsplan:**

- **Ny edge function `fetch-stock-price`**: Anropar Yahoo Finance API (`query1.finance.yahoo.com/v7/finance/quote`) med bolagets ticker
- Mappar svenska tickers till Yahoo-format (lagger till `.ST` om det behövs)
- Returnerar aktuell kurs, daglig forandring, valuta
- **UI-knapp i KeyDataEditor eller headern**: "Hamta aktuell kurs"-knapp bredvid priset
- Sparar automatiskt till `current_price` i databasen

---

### Tekniska detaljer

**Fil: `supabase/functions/fetch-stock-price/index.ts`** (ny)
- Tar emot `ticker` och `exchange` (default: Stockholm)
- Mappar ticker till Yahoo-format: `VOLV-B` -> `VOLV-B.ST`
- Borser: `.ST` (Stockholm), `.HE` (Helsinki), `.CO` (Kopenhamn), `.OL` (Oslo)
- Gor GET till `https://query1.finance.yahoo.com/v7/finance/quote?symbols=TICKER`
- Returnerar `{ price, change, changePercent, currency, name }`

**Fil: `supabase/functions/ai-summary/index.ts`** (uppdatera)
- Uppdatera prompten att returnera formaterad HTML istallet for markdown
- Laga till instruktioner om att anvanda `<h3>`, `<ul>`, `<li>`, `<strong>` etc.

**Fil: `src/components/company/AISummaryCard.tsx`** (ny komponent)
- Extrahera AI-sammanfattningskortet till en aterbrukbar komponent
- Props: `title`, `summary`, `onGenerate`, `onSave`, `generating`, `hasUnsavedChanges`
- Snyggare rendering med `prose`-klasser

**Fil: `src/pages/CompanyDetail.tsx`** (uppdatera)
- Ersatt inline AI-sammanfattningskort med `AISummaryCard`
- Lagg till "Hamta kurs"-knapp i headern eller KeyDataEditor
- Anropa `fetch-stock-price` edge function och uppdatera `current_price`

**Fil: `src/components/company/KeyDataEditor.tsx`** (uppdatera)
- Lagg till aktuellt pris-falt med "Hamta"-knapp
- Visa senast uppdaterat pris

