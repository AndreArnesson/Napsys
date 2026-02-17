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
    undervalued: 'bg-emerald-600 text-white border-emerald-700',
    fair: 'bg-amber-500 text-white border-amber-600',
    overvalued: 'bg-red-600 text-white border-red-700',
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
