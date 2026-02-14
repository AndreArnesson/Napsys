import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

interface MOSBadgeProps {
  value: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function MOSBadge({ value, size = 'md', showLabel = true }: MOSBadgeProps) {
  const { t } = useLanguage();

  if (value === null || value === undefined) {
    return null;
  }

  // MOS > 0 means undervalued (good), MOS < 0 means overvalued (bad)
  const getStatus = () => {
    if (value >= 20) return 'undervalued';
    if (value >= -10) return 'fair';
    return 'overvalued';
  };

  const status = getStatus();

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-lg px-4 py-2 font-semibold',
  };

  const colorClasses = {
    undervalued: 'bg-mos-undervalued/10 text-mos-undervalued border-mos-undervalued/20',
    fair: 'bg-mos-fair/10 text-mos-fair border-mos-fair/20',
    overvalued: 'bg-mos-overvalued/10 text-mos-overvalued border-mos-overvalued/20',
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'rounded-full border font-medium',
          sizeClasses[size],
          colorClasses[status]
        )}
      >
        {value >= 0 ? '+' : ''}{value.toFixed(1)}%
      </span>
      {showLabel && (
        <span className="text-muted-foreground text-sm">
          {t.mos[status]}
        </span>
      )}
    </div>
  );
}
