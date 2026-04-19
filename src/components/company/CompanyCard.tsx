import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MOSBadge } from './MOSBadge';
import { RatingBadge } from './RatingBadge';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/i18n/LanguageContext';
import { TrendingUp, TrendingDown, Minus, Calendar, FileDown, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';

interface YearMOS {
  year: number;
  mos: number;
  estimatedPrice?: number;
}

interface CompanyCardProps {
  company: {
    id: string;
    name: string;
    ticker: string | null;
    current_price: number | null;
    updated_at: string;
    trading_currency?: string | null;
  };
  analysis?: {
    rating: 'buy' | 'hold' | 'sell' | null;
    margin_of_safety: number | null;
    created_at: string;
    projections?: any[] | null;
    analysis_price?: number | null;
  } | null;
  priceChange?: number;
  isShared?: boolean;
  onlyImported?: boolean;
}

export function CompanyCard({ company, analysis, priceChange, isShared, onlyImported }: CompanyCardProps) {
  const { t, language } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);

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

  // Extract per-year MOS from projections
  const yearlyMOS: YearMOS[] = [];
  const currentYear = new Date().getFullYear();
  if (analysis?.projections && Array.isArray(analysis.projections)) {
    for (const proj of analysis.projections) {
      if (proj?.year && proj?.mos !== undefined && proj?.mos !== null && proj.year >= currentYear) {
        yearlyMOS.push({ 
          year: proj.year, 
          mos: proj.mos,
          estimatedPrice: proj.estimatedPrice,
        });
      }
    }
    yearlyMOS.sort((a, b) => a.year - b.year);
  }

  // Calculate MOS from current price for each year
  const currentPriceMOS: YearMOS[] = [];
  if (company.current_price && analysis?.analysis_price && yearlyMOS.length > 0) {
    for (const ym of yearlyMOS) {
      if (ym.estimatedPrice) {
        const mosFromCurrentPrice = ((ym.estimatedPrice - company.current_price) / ym.estimatedPrice) * 100;
        currentPriceMOS.push({ year: ym.year, mos: mosFromCurrentPrice });
      }
    }
  }

  // Primary MOS to show (the one saved as margin_of_safety, typically year+3)
  const primaryMOS = yearlyMOS.length > 0 ? yearlyMOS[yearlyMOS.length - 1] : null;
  const primaryCurrentPriceMOS = currentPriceMOS.length > 0 ? currentPriceMOS[currentPriceMOS.length - 1] : null;

  const getMOSColor = (value: number) => {
    if (value >= 20) return 'text-emerald-600';
    if (value >= -10) return 'text-amber-500';
    return 'text-destructive';
  };

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
        <CardContent className="space-y-3">
          {/* Rating and Price */}
          <div className="flex items-center justify-between">
            <RatingBadge rating={analysis?.rating as 'buy' | 'hold' | 'sell' | null} />
            <span className="text-sm text-muted-foreground">
              {company.current_price 
                ? `${company.current_price.toFixed(2)} ${company.trading_currency || 'SEK'}`
                : '—'
              }
            </span>
          </div>

          {/* MOS from analysis price */}
          {primaryMOS && (
            <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  MOS {primaryMOS.year}
                </span>
                <span className={`text-sm font-semibold ${getMOSColor(primaryMOS.mos)}`}>
                  {primaryMOS.mos >= 0 ? '+' : ''}{primaryMOS.mos.toFixed(0)}%
                </span>
              </div>

              {/* MOS from today's price */}
              {primaryCurrentPriceMOS && Math.abs(primaryCurrentPriceMOS.mos - primaryMOS.mos) > 0.5 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {language === 'sv' ? 'Från dagens kurs' : 'From current price'}
                  </span>
                  <span className={`text-xs font-semibold ${getMOSColor(primaryCurrentPriceMOS.mos)}`}>
                    {primaryCurrentPriceMOS.mos >= 0 ? '+' : ''}{primaryCurrentPriceMOS.mos.toFixed(0)}%
                  </span>
                </div>
              )}

              {/* Expandable details for other years */}
              {yearlyMOS.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDetails(!showDetails); }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full justify-center pt-0.5"
                  >
                    {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {language === 'sv' ? 'Alla år' : 'All years'}
                  </button>
                  {showDetails && (
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      {yearlyMOS.map((ym) => {
                        const cpMos = currentPriceMOS.find(c => c.year === ym.year);
                        return (
                          <div key={ym.year} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{ym.year}</span>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${getMOSColor(ym.mos)}`}>
                                {ym.mos >= 0 ? '+' : ''}{ym.mos.toFixed(0)}%
                              </span>
                              {cpMos && Math.abs(cpMos.mos - ym.mos) > 0.5 && (
                                <span className={`${getMOSColor(cpMos.mos)} opacity-60`}>
                                  ({cpMos.mos >= 0 ? '+' : ''}{cpMos.mos.toFixed(0)}%)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-[10px] text-muted-foreground/70 pt-0.5">
                        {language === 'sv' ? '(parentes = från dagens kurs)' : '(parentheses = from current price)'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Fallback: show simple MOS if no projections but has margin_of_safety */}
          {!primaryMOS && analysis?.margin_of_safety !== null && analysis?.margin_of_safety !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">MOS</span>
              <MOSBadge value={analysis.margin_of_safety} size="sm" showLabel={true} />
            </div>
          )}

          {/* Price change since analysis */}
          {priceChange !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {language === 'sv' ? 'Sedan analys' : 'Since analysis'}
              </span>
              <div className={`flex items-center gap-1 ${priceColor}`}>
                <PriceIcon className="h-3 w-3" />
                <span className="text-xs font-medium">
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
                </span>
              </div>
            </div>
          )}

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