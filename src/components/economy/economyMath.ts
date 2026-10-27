export interface EconomyAmount {
  category: string;
  amount: number | string;
}

export interface PortfolioAmount {
  holdings: Array<{ value_sek?: number | null }>;
}

export interface DatedEconomyEntry extends EconomyAmount {
  id: string;
  category: string;
  label: string;
  entry_date: string;
  created_at?: string;
  notes?: string | null;
}

export function isSameUpdateDate(economyDate?: string | null, portfolioDate?: string | null): boolean {
  return Boolean(economyDate && portfolioDate && economyDate === portfolioDate);
}

export function getLatestBalances(entries: DatedEconomyEntry[], asOfDate: string): DatedEconomyEntry[] {
  const latestByAccount = new Map<string, DatedEconomyEntry>();

  for (const entry of entries) {
    if (entry.entry_date > asOfDate) continue;

    const identity = `${entry.category}\u0000${entry.label.trim().toLocaleLowerCase('sv-SE')}`;
    const current = latestByAccount.get(identity);
    if (!current || entry.entry_date > current.entry_date || (
      entry.entry_date === current.entry_date && (entry.created_at || '') > (current.created_at || '')
    )) {
      latestByAccount.set(identity, entry);
    }
  }

  return Array.from(latestByAccount.values()).sort((a, b) =>
    a.category.localeCompare(b.category) || a.label.localeCompare(b.label, 'sv-SE'),
  );
}

export function calculatePortfolioValue(portfolios: PortfolioAmount[]): number {
  return portfolios.reduce(
    (total, portfolio) => total + portfolio.holdings.reduce((sum, holding) => sum + Number(holding.value_sek ?? 0), 0),
    0,
  );
}

export function calculateEconomyTotals(entries: EconomyAmount[], matchedPortfolioValue = 0) {
  const otherAssets = entries
    .filter(entry => entry.category !== 'debt')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const debts = entries
    .filter(entry => entry.category === 'debt')
    .reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0);
  const totalAssets = otherAssets + matchedPortfolioValue;

  return {
    otherAssets,
    portfolioValue: matchedPortfolioValue,
    totalAssets,
    totalDebt: debts,
    netWorth: totalAssets - debts,
  };
}

export function calculateSnapshotNetWorth(entries: EconomyAmount[], sameDayPortfolios: PortfolioAmount[] = []): number {
  return calculateEconomyTotals(entries, calculatePortfolioValue(sameDayPortfolios)).netWorth;
}
