

## Engångsjusteringar i analysen

Lägga till möjlighet att registrera engångsposter (one-time items) som justerar EBIT, EBITDA eller Nettoresultat per år/kvartal. Justerade värden visas som nya rader i estimattabellen.

### Datamodell

Justeringarna sparas i analysens `projections`-JSON (som redan lagrar all estimatdata) via ett nytt fält `adjustments` på analysen, alternativt direkt i analysens JSON-kolumn. Enklast: ett nytt fält `adjustments` i `analyses`-tabellen (JSONB).

Varje justering:
```text
{
  id: string (uuid),
  description: string,      // "Omstruktureringskostnad"
  amount: number,            // 12 (MSEK)
  metric: 'ebit' | 'ebitda' | 'netIncome',
  year: number,
  quarter?: number
}
```

### Steg

1. **Databasmigration** -- Lägg till `adjustments JSONB DEFAULT '[]'` kolumn på `analyses`-tabellen.

2. **Ny komponent `AdjustmentsEditor`** -- Ett litet UI-block (collapsible card) i analysflödet:
   - Tabell med kolumner: Beskrivning, Belopp (MSEK), Typ (EBIT/EBITDA/Nettoresultat), Period (år + ev kvartal)
   - Knappar för att lägga till / ta bort justeringar
   - Data sparas via autosave precis som övriga analysfält

3. **Uppdatera `AnalysisEditor.tsx`** -- Hantera `adjustments` state, ladda från `currentAnalysis`, inkludera i `saveMutation`, rendera `AdjustmentsEditor` mellan historisk data och estimattabellen.

4. **Uppdatera `SpreadsheetAnalysis.tsx`** -- 
   - Ny prop `adjustments`
   - Nya beräknade rader: "Justerad EBIT", "Justerad EBITDA", "Justerat nettoresultat" som summerar basvärdena + justeringar för respektive period
   - Justerade marginaler (justerad EBIT-marginal etc.) baserade på justerade värden
   - Nya rader läggs till i `ALL_ESTIMATE_ROWS` och `rows`

### Tekniska detaljer

- Justeringsbeloppet adderas till grundvärdet (positivt belopp = kostnad som läggs tillbaka, t.ex. +12 MSEK på EBIT betyder att man justerar bort en engångskostnad)
- Justerade värden påverkar även EV/EBIT och EV/EBITDA om användaren väljer att visa justerade multiplar
- Sparas automatiskt via befintlig debounce-save

