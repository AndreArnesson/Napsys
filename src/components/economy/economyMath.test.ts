import { describe, expect, it } from 'vitest';
import { calculateEconomyTotals, calculatePortfolioValue, calculateSnapshotNetWorth, getLatestBalances, isSameUpdateDate } from './economyMath';

describe('economy value calculations', () => {
  it('adds portfolio values only when the caller supplies same-day portfolios', () => {
    const totals = calculateEconomyTotals([
      { category: 'bank_account', amount: 25_000 },
      { category: 'debt', amount: -10_000 },
    ], 100_000);

    expect(totals).toEqual({
      otherAssets: 25_000,
      portfolioValue: 100_000,
      totalAssets: 125_000,
      totalDebt: 10_000,
      netWorth: 115_000,
    });
  });

  it('handles debts recorded as either positive or negative values', () => {
    const positive = calculateEconomyTotals([{ category: 'debt', amount: 4_500 }]);
    const negative = calculateEconomyTotals([{ category: 'debt', amount: -4_500 }]);
    expect(positive.totalDebt).toBe(4_500);
    expect(negative.totalDebt).toBe(4_500);
    expect(positive.netWorth).toBe(-4_500);
    expect(negative.netWorth).toBe(-4_500);
  });

  it('sums holdings across portfolios and treats missing values as zero', () => {
    expect(calculatePortfolioValue([
      { holdings: [{ value_sek: 20_000 }, { value_sek: null }] },
      { holdings: [{ value_sek: 30_000 }] },
    ])).toBe(50_000);
  });

  it('calculates saved snapshot net worth with only explicitly matched portfolio snapshots', () => {
    const entries = [
      { category: 'bank_account', amount: 20_000 },
      { category: 'debt', amount: -2_000 },
    ];

    expect(calculateSnapshotNetWorth(entries)).toBe(18_000);
    expect(calculateSnapshotNetWorth(entries, [{ holdings: [{ value_sek: 10_000 }] }])).toBe(28_000);
  });

  it('prefills updates with the latest value per account without pulling in future entries', () => {
    const latest = getLatestBalances([
      { id: 'bank-old', category: 'bank_account', label: 'Nordea', amount: 1_000, entry_date: '2026-01-01', created_at: '2026-01-01T10:00:00Z' },
      { id: 'bank-new', category: 'bank_account', label: 'Nordea', amount: 2_000, entry_date: '2026-02-01', created_at: '2026-02-01T10:00:00Z' },
      { id: 'bank-future', category: 'bank_account', label: 'Nordea', amount: 3_000, entry_date: '2026-12-01', created_at: '2026-12-01T10:00:00Z' },
      { id: 'savings', category: 'savings', label: 'Avanza', amount: 5_000, entry_date: '2026-01-15', created_at: '2026-01-15T10:00:00Z' },
    ], '2026-10-27');

    expect(latest.map(entry => [entry.id, entry.amount])).toEqual([
      ['bank-new', 2_000],
      ['savings', 5_000],
    ]);
  });

  it('uses the most recently created entry when an account has multiple values on one date', () => {
    const latest = getLatestBalances([
      { id: 'old', category: 'bank_account', label: 'Nordea', amount: 1_000, entry_date: '2026-10-27', created_at: '2026-10-27T09:00:00Z' },
      { id: 'new', category: 'bank_account', label: 'Nordea', amount: 2_000, entry_date: '2026-10-27', created_at: '2026-10-27T10:00:00Z' },
    ], '2026-10-27');

    expect(latest[0].id).toBe('new');
  });

  it('links portfolio values only when the economy and portfolio dates are identical', () => {
    expect(isSameUpdateDate('2026-10-27', '2026-10-27')).toBe(true);
    expect(isSameUpdateDate('2026-10-27', '2026-03-18')).toBe(false);
    expect(isSameUpdateDate('2026-10-27', null)).toBe(false);
    expect(isSameUpdateDate(null, '2026-10-27')).toBe(false);
  });
});
