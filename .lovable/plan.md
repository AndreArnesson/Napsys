
# Fix MOS-fargkontrast och la till rad-filtrering i estimatdelen

## Problem 1: MOS-farg ar olaslig
MOS-cellen anvander `formatPercent()` som returnerar text med `text-success` (gron) eller `text-destructive` (rod) farg. Denna farg hamnar inuti en Badge som har t.ex. `bg-emerald-600 text-white`. Resultatet ar att den inre `text-success`-fargen overskriver `text-white`, sa du far gron text pa gron bakgrund -- olasbart.

**Losning:** Rendera MOS-vardet direkt som vit text inuti Badge istallet for att anvanda `formatPercent()`. Formatet blir `+XX.XX%` med enbart `text-white`.

## Problem 2: Rad-filtrering i estimatdelen
Historisk data har redan en dropdown med checkboxar for att valja vilka kolumner/rader som visas. Estimatdelen saknar detta och visar alltid samma fasta rader.

**Losning:** Implementera samma monster som `HistoricalDataTable`:
- Definiera en lista med alla tillgangliga rader (Kurs, Oms.tillvaxt, Omsattning, EBIT, Vinstmarginal, EBIT-marginal, EBITDA-marginal, VPA, VPA-tillvaxt, Utdelning, Direktavkastning, P/E, Rimlig P/E, Estimerad kurs, MOS)
- Lagga till en "Kolumner"-knapp med Popover och checkboxar (precis som historisk data)
- Ta bort de separata switcharna for EBIT-marginal och EBITDA-marginal (de ersatts av den nya filtreringen)
- Behall "Per aktie"-switchen separat da den paverkar berakningar, inte bara synlighet

## Tekniska detaljer

### Fil: `src/components/analysis/SpreadsheetAnalysis.tsx`

**MOS-fix (rad ~448-455):**
- Ersatt `formatPercent(proj.mos)` med en enkel strangen `{proj.mos >= 0 ? '+' : ''}{proj.mos.toFixed(2)}%` renderad direkt med `text-white`

**Rad-filtrering:**
1. Definiera en konstant `ALL_ESTIMATE_ROWS` med `key`, `label` och `group` for varje rad
2. Definiera `DEFAULT_ESTIMATE_ROWS` med de rader som visas som standard
3. Lagga till state: `visibleRows` med `useState<string[]>(DEFAULT_ESTIMATE_ROWS)`
4. Lagga till en Popover-knapp i headern (bredvid befintliga kontroller) med checkboxar grupperade efter kategori
5. Filtrera `rows`-arrayen baserat pa `visibleRows`
6. Ta bort `showEbitMargin`/`showEbitdaMargin` state och deras Switch-komponenter
