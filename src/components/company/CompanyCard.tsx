import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MOSBadge } from './MOSBadge';
import { RatingBadge } from './RatingBadge';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/i18n/LanguageContext';
import { TrendingUp, TrendingDown, Minus, Calendar, FileDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';

interface CompanyCardProps {
  company: {
    id: string;
    name: string;
    ticker: string | null;
    current_price: number | null;
    updated_at: string;
  };
  analysis?: {
    rating: 'buy' | 'hold' | 'sell' | null;
    margin_of_safety: number | null;
    created_at: string;
  } | null;
  priceChange?: number;
  isShared?: boolean;
  onlyImported?: boolean;
}

export function CompanyCard({ company, analysis, priceChange, isShared, onlyImported }: CompanyCardProps) {
  const { t, language } = useLanguage();

  const locale = language === 'sv' ? sv : enUS;
  const lastAnalysisDate = analysis?.created_at 
    ? formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true, locale })
    : null;

  const PriceIcon = priceChange && priceChange > 0 
    ? TrendingUp 
    : priceChange && priceChange < 0 
    ? TrendingDown 
    : Minus;

  const priceColor = priceChange && priceChange > 0
    ? 'text-success'
    : priceChange && priceChange < 0
    ? 'text-destructive'
    : 'text-muted-foreground';

  return (
    <Link to={`/company/${company.id}`}>
      <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/20 cursor-pointer animate-fade-in">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">
                {company.name}
              </CardTitle>
              {company.ticker && (
                <p className="text-sm text-muted-foreground font-mono">
                  {company.ticker}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {onlyImported && (
                <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
                  <FileDown className="h-3 w-3" />
                  {language === 'sv' ? 'Importerad' : 'Imported'}
                </Badge>
              )}
              {isShared && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {t.dashboard.sharedWithMe}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rating and MOS */}
          <div className="flex items-center justify-between">
            <RatingBadge rating={analysis?.rating as 'buy' | 'hold' | 'sell' | null} />
            <MOSBadge value={analysis?.margin_of_safety} size="sm" showLabel={false} />
          </div>

          {/* Price and trend */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {company.current_price 
                ? `${company.current_price.toFixed(2)} SEK`
                : '—'
              }
            </span>
            {priceChange !== undefined && (
              <div className={`flex items-center gap-1 ${priceColor}`}>
                <PriceIcon className="h-3 w-3" />
                <span className="text-xs">
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* Last analysis */}
          {lastAnalysisDate && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{t.dashboard.lastAnalysis}: {lastAnalysisDate}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}