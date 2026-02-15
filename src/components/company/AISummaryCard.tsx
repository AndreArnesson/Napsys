import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, Save } from 'lucide-react';

interface AISummaryCardProps {
  title: string;
  summary: string;
  onGenerate: () => void;
  onSave: () => void;
  generating: boolean;
  hasUnsavedChanges: boolean;
  emptyText: string;
}

export function AISummaryCard({
  title,
  summary,
  onGenerate,
  onSave,
  generating,
  hasUnsavedChanges,
  emptyText,
}: AISummaryCardProps) {
  return (
    <Card className="border-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={generating}
              className="gap-1.5"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {summary ? 'Generera ny' : 'Generera'}
            </Button>
            {hasUnsavedChanges && (
              <Button size="sm" onClick={onSave} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                Spara
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert
              prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
              prose-h3:text-base prose-h4:text-sm
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-li:text-muted-foreground prose-li:leading-relaxed
              prose-strong:text-foreground prose-strong:font-semibold
              prose-ul:my-2 prose-ol:my-2"
            dangerouslySetInnerHTML={{ __html: summary }}
          />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            {emptyText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
