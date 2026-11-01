import { describe, expect, it } from 'vitest';
import { findFiIssuer, parseFiIssuerDetail } from '../../supabase/functions/fi-reports/_shared/shortSelling';

const registerHtml = `
  <table><tr><th>Emittentens namn</th><th>Emittentens LEI-kod</th><th>Positionsdatum senaste position</th><th>Summa blankning %</th></tr>
  <tr><td><a href="Emittent?id=549300J9WWQ5CBYQ1M77">Oncopeptides AB</a></td><td>549300J9WWQ5CBYQ1M77</td><td>2026-10-30</td><td>2,27</td></tr>
  <tr><td><a href="Emittent?id=549300W9JLPW15XIFM52">Telefonaktiebolaget LM Ericsson</a></td><td>549300W9JLPW15XIFM52</td><td>2026-10-30</td><td>2,88</td></tr></table>`;

describe('FI short-selling parser', () => {
  it('finds a company despite legal suffix differences', () => {
    expect(findFiIssuer(registerHtml, 'Oncopeptides')).toMatchObject({
      name: 'Oncopeptides AB',
      lei: '549300J9WWQ5CBYQ1M77',
      totalPercentage: 2.27,
    });
  });

  it('does not guess when the company name matches more than one issuer', () => {
    expect(findFiIssuer(registerHtml, 'Oncopeptides AB; Ericsson')).toBeNull();
  });

  it('parses total, current positions, and historical positions from issuer detail', () => {
    const detail = `
      <h3>Oncopeptides AB</h3><p>LEI-kod</p><p>549300J9WWQ5CBYQ1M77</p>
      <p>Summa procent</p><p>2,27</p>
      <h2>Aktuella positioner</h2><table>
        <tr><th>Positionsinnehavare</th><th>ISIN</th><th>Position i procent (%)</th><th>Positionsdatum</th><th>Föregående Position (%)</th></tr>
        <tr><td>Two Sigma Investments, LP</td><td>SE0009414576</td><td>0,6</td><td>2026-10-30</td><td>0,59</td></tr>
      </table>
      <h2>Historiska positioner</h2><table>
        <tr><th>Positionsinnehavare</th><th>ISIN</th><th>Position i procent (%)</th><th>Positionsdatum</th><th>Efterföljande Position (%)</th></tr>
        <tr><td>GSA Capital Partners LLP</td><td>SE0009414576</td><td>&lt;0,5</td><td>2026-08-13</td><td></td></tr>
      </table>`;
    const issuer = findFiIssuer(registerHtml, 'Oncopeptides')!;
    const result = parseFiIssuerDetail(detail, issuer, 'https://www.fi.se/example');

    expect(result).toMatchObject({ found: true, totalPercentage: 2.27, lei: issuer.lei });
    expect(result.positions).toEqual([{
      holder: 'Two Sigma Investments, LP',
      isin: 'SE0009414576',
      percentage: 0.6,
      belowThreshold: false,
      positionDate: '2026-10-30',
      previousPercentage: 0.59,
      previousBelowThreshold: false,
    }]);
    expect(result.historicalPositions).toEqual([{
      holder: 'GSA Capital Partners LLP',
      isin: 'SE0009414576',
      percentage: null,
      belowThreshold: true,
      positionDate: '2026-08-13',
      previousPercentage: null,
      previousBelowThreshold: false,
    }]);
  });
});
