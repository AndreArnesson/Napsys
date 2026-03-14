import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Upload, Loader2, Trash2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ReportAnalyzerProps {
  companyId: string;
  analysisId: string;
  companyName?: string;
  readOnly?: boolean;
}

export function ReportAnalyzer({ companyId, analysisId, companyName, readOnly = false }: ReportAnalyzerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);

  // Fetch uploaded reports
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['report_documents', companyId, analysisId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_documents' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Upload files
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') {
          toast.error(`${file.name} är inte en PDF`);
          continue;
        }
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} är för stor (max 20MB)`);
          continue;
        }

        const filePath = `${companyId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from('reports').upload(filePath, file);
        if (uploadError) { toast.error(`Kunde inte ladda upp ${file.name}`); continue; }

        const { error: dbError } = await supabase.from('report_documents' as any).insert({
          company_id: companyId,
          analysis_id: analysisId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
        });
        if (dbError) { console.error(dbError); toast.error(`Kunde inte spara ${file.name}`); }
      }
      queryClient.invalidateQueries({ queryKey: ['report_documents', companyId, analysisId] });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Delete report
  const deleteMutation = useMutation({
    mutationFn: async (report: any) => {
      await supabase.storage.from('reports').remove([report.file_path]);
      await supabase.from('report_documents' as any).delete().eq('id', report.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report_documents', companyId, analysisId] });
    },
    onError: () => toast.error('Kunde inte ta bort rapport'),
  });

  // Analyze with AI
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const filesToAnalyze = selectedFileIds.size > 0
        ? reports.filter((r: any) => selectedFileIds.has(r.id))
        : reports;

      if (filesToAnalyze.length === 0) throw new Error('Inga rapporter att analysera');

      const { data, error } = await supabase.functions.invoke('analyze-reports', {
        body: {
          filePaths: filesToAnalyze.map((r: any) => r.file_path),
          question: question.trim() || undefined,
          companyName,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.summary;
    },
    onSuccess: (summary) => setAiResult(summary),
    onError: (err: Error) => toast.error(err.message || 'Kunde inte analysera rapporter'),
  });

  const toggleFile = (id: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Rapportanalys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload area */}
        {!readOnly && (
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Laddar upp...
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Klicka för att ladda upp rapporter (PDF)</p>
                <p className="text-xs text-muted-foreground">Du kan välja flera filer samtidigt</p>
              </div>
            )}
          </div>
        )}

        {/* Uploaded files list */}
        {reports.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Uppladdade rapporter ({reports.length}) — klicka för att markera vilka som ska analyseras
            </p>
            <div className="space-y-1">
              {reports.map((report: any) => (
                <div
                  key={report.id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors',
                    selectedFileIds.has(report.id)
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-muted/50 hover:bg-muted border border-transparent'
                  )}
                  onClick={() => toggleFile(report.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{report.file_name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {report.file_size ? formatSize(report.file_size) : ''}
                    </span>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(report); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {selectedFileIds.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedFileIds(new Set())} className="text-xs">
                <X className="h-3 w-3 mr-1" /> Avmarkera alla
              </Button>
            )}
          </div>
        )}

        {/* Question input + analyze button */}
        {reports.length > 0 && (
          <div className="space-y-3">
            <Textarea
              placeholder="Ställ en fråga om rapporterna, t.ex. 'Finns det risker i balansräkningen?' eller 'Hur har trenden varit i segment X?'  Lämna tomt för en generell sammanfattning."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-[80px]"
            />
            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending || reports.length === 0}
              className="gap-2"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {analyzeMutation.isPending ? 'Analyserar...' : `Analysera ${selectedFileIds.size > 0 ? selectedFileIds.size : 'alla'} rapport${(selectedFileIds.size > 0 ? selectedFileIds.size : reports.length) !== 1 ? 'er' : ''}`}
            </Button>
          </div>
        )}

        {/* AI Result */}
        {aiResult && (
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI-analys</span>
            </div>
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: aiResult }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
