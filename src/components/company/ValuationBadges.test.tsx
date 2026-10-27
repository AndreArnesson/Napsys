import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MOSBadge } from './MOSBadge';
import { RatingBadge } from './RatingBadge';

vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: {
      mos: { undervalued: 'Undervalued', fair: 'Fair value', overvalued: 'Overvalued' },
      analysis: { buy: 'Buy', hold: 'Hold', sell: 'Sell' },
    },
  }),
}));

describe('MOSBadge', () => {
  it.each([
    [20, 'Undervalued'],
    [0, 'Fair value'],
    [-10, 'Fair value'],
    [-10.1, 'Overvalued'],
  ])('classifies MoS %s as %s', (value, label) => {
    render(<MOSBadge value={value} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders no badge when value is missing and can hide the label', () => {
    const { container, rerender } = render(<MOSBadge value={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<MOSBadge value={25} showLabel={false} />);
    expect(screen.getByText('+25.0%')).toBeInTheDocument();
    expect(screen.queryByText('Undervalued')).not.toBeInTheDocument();
  });
});

describe('RatingBadge', () => {
  it.each([
    ['buy', 'Buy'],
    ['hold', 'Hold'],
    ['sell', 'Sell'],
  ] as const)('renders the %s rating', (rating, label) => {
    render(<RatingBadge rating={rating} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders nothing without a rating', () => {
    const { container } = render(<RatingBadge rating={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
