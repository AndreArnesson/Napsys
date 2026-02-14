import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

type Rating = 'buy' | 'hold' | 'sell';

interface RatingBadgeProps {
  rating: Rating | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}

export function RatingBadge({ rating, size = 'md' }: RatingBadgeProps) {
  const { t } = useLanguage();

  if (!rating) {
    return null;
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  const colorClasses = {
    buy: 'bg-rating-buy/10 text-rating-buy border-rating-buy/20',
    hold: 'bg-rating-hold/10 text-rating-hold border-rating-hold/20',
    sell: 'bg-rating-sell/10 text-rating-sell border-rating-sell/20',
  };

  const labels = {
    buy: t.analysis.buy,
    hold: t.analysis.hold,
    sell: t.analysis.sell,
  };

  return (
    <span
      className={cn(
        'rounded-full border font-medium uppercase tracking-wide',
        sizeClasses[size],
        colorClasses[rating]
      )}
    >
      {labels[rating]}
    </span>
  );
}
