import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RatingBadge } from '@/components/company/RatingBadge';
import { MOSBadge } from '@/components/company/MOSBadge';
import { formatDistanceToNow } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { History, Plus, ChevronRight, Lock } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface Analysis {
  id: string;
  rating?: string | null;
  margin_of_safety?: number | null;
  confidence_level?: number | null;
  summary_comment?: string | null;
  is_draft: boolean;
  locked?: boolean;
  updated_at: string;
  created_at: string;
}

interface PreviousAnalysesListProps {
  analyses: Analysis[];
  currentAnalysisId?: string;
  onSelect: (analysis: Analysis) => void;
  onCreateNew: () => void;
}

export function PreviousAnalysesList({ 
  analyses, 
  currentAnalysisId,
  onSelect,
  onCreateNew 
}: PreviousAnalysesListProps) {
  const { t, language } = useLanguage();
  const locale = language === 'sv' ? sv : enUS;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Analyses
            </CardTitle>
            <CardDescription>
              {analyses.length} {analyses.length === 1 ? 'analysis' : 'analyses'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onCreateNew} className="gap-1">
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {analyses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No previous analyses
          </p>
        ) : (
          analyses.map((analysis) => (
            <button
              key={analysis.id}
              onClick={() => onSelect(analysis)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                analysis.id === currentAnalysisId
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <RatingBadge rating={analysis.rating as 'buy' | 'hold' | 'sell' | null} size="sm" />
                  {analysis.locked && (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  )}
                  {analysis.is_draft && (
                    <Badge variant="outline" className="text-xs">
                      {t.analysis.draft}
                    </Badge>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {formatDistanceToNow(new Date(analysis.updated_at), { addSuffix: true, locale })}
                </span>
                {analysis.margin_of_safety !== null && (
                  <>
                    <span>•</span>
                    <MOSBadge value={analysis.margin_of_safety} size="sm" />
                  </>
                )}
              </div>
              {analysis.summary_comment && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {analysis.summary_comment}
                </p>
              )}
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
