

## Plan: Portföljöversikt med cirkeldiagram

### Vad som ska byggas
Lägg till en visuell översikt i Portföljer-fliken som visar:
1. **Ett cirkeldiagram per portfölj** baserat på senaste snapshot-innehavet (weight_percent)
2. **Ett totalt cirkeldiagram** som aggregerar alla portföljers senaste snapshots

### Teknisk approach

**Ny komponent: `src/components/portfolio/PortfolioOverview.tsx`**
- Tar in `portfolios` som prop
- Hämtar senaste snapshot per portfölj (med holdings) via en query som joinar `portfolio_snapshots` + `portfolio_holdings`
- Renderar Recharts `PieChart` per portfölj + ett aggregerat
- Använder befintliga `ChartContainer`/`ChartTooltip` från `src/components/ui/chart.tsx`
- Visar company_name och weight_percent i varje sektor
- Fallback-text om en portfölj saknar snapshots/holdings

**Ändringar i `src/pages/Portfolio.tsx`**
- Importera och rendera `PortfolioOverview` ovanför portföljkorten i portfolios-fliken
- Skicka in `portfolios`-datan

### Layout
```text
┌─────────────────────────────────────┐
│ Totalt alla portföljer  [PieChart]  │
├──────────────┬──────────────────────┤
│ Portfölj A   │ Portfölj B           │
│ [PieChart]   │ [PieChart]           │
├──────────────┴──────────────────────┤
│ Portföljkort (befintliga)           │
└─────────────────────────────────────┘
```

### Inga databasändringar behövs
All data finns redan i `portfolio_snapshots` + `portfolio_holdings`.

### Filer som ändras/skapas
- **Ny**: `src/components/portfolio/PortfolioOverview.tsx`
- **Ändras**: `src/pages/Portfolio.tsx`

