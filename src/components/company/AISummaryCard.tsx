import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, Save } from 'lucide-react';
import { AssistantContent } from '@/components/ai/AssistantContent';

interface AISummaryCardProps {
  readOnly?: boolean;
  title: string;
  summary: string;
  onGenerate: () => void;
  onSave: () => void;
  generating: boolean;
  hasUnsavedChanges: boolean;
  emptyText: string;
}

export function AISummaryCard({
  readOnly = false,
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
          {!readOnly && <div className="flex gap-2">
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
          </div>}
        </div>
      </CardHeader>
      <CardContent>
        {summary ? (
          <AssistantContent content={summary} allowHtml />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            {emptyText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
