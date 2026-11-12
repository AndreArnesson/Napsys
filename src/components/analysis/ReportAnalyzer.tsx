import { useState, useRef } from 'react';
import { AssistantContent } from '@/components/ai/AssistantContent';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Upload, Loader2, Trash2, Sparkles, X, Search, Download, CalendarDays, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { FiReport } from '@/lib/fiReports';
import type { FiReportKind } from '@/lib/fiReports';
import {
  filterFiReportsByKind,
  filterFiReportsByLanguage,
  getFiReportKey,
  groupFiReportsByYear,
  type FiReportLanguageFilter,
} from '@/lib/fiReportGroups';
import { extractFiReportTextFromZip } from '@/lib/fiReportArchive';
import type { FiShortPosition, FiShortSellingData } from '../../../supabase/functions/fi-reports/_shared/shortSelling';
import type { Database } from '@/integrations/supabase/types';

type ReportDocument = Database['public']['Tables']['report_documents']['Row'];
const MAX_ANALYSIS_REPORTS = 8;
const FI_REPORT_KIND_OPTIONS: Array<{ kind: FiReportKind; label: string }> = [
  { kind: 'Annual report', label: 'Årsredovisning' },
  { kind: 'Year-end release', label: 'Bokslutskommuniké (Q4)' },
  { kind: 'Half-year report', label: 'Halvårsrapport (Q2)' },
  { kind: 'Quarterly report', label: 'Kvartalsrapport (Q1/Q3)' },
];

interface ReportAnalyzerProps {
  companyId: string;
  analysisId: string;
  companyName?: string;
  readOnly?: boolean;
}

function FiShortPositionTable({ positions, historical = false }: { positions: FiShortPosition[]; historical?: boolean }) {
  const percentage = (value: number | null, belowThreshold = false) => value == null
    ? (belowThreshold ? '<0,5%' : '—')
    : `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}%`;
  if (positions.length === 0) return <p className="text-xs text-muted-foreground">Inga individuella positioner visas av FI.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">Innehavare</th>
            <th className="py-2 pr-3 font-medium">ISIN</th>
            <th className="py-2 pr-3 font-medium">Position</th>
            <th className="py-2 pr-3 font-medium">Datum</th>
            <th className="py-2 font-medium">{historical ? 'Efterföljande position' : 'Föregående position'}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position, index) => (
            <tr key={`${position.holder}-${position.positionDate}-${index}`} className="border-t">
              <td className="py-2 pr-3">{position.holder}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{position.isin || '—'}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{percentage(position.percentage, position.belowThreshold)}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{position.positionDate}</td>
              <td className="py-2 whitespace-nowrap">{percentage(position.previousPercentage, position.previousBelowThreshold)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportAnalyzer({ companyId, analysisId, companyName, readOnly = false }: ReportAnalyzerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectedFiReportKeys, setSelectedFiReportKeys] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [fiReports, setFiReports] = useState<FiReport[] | null>(null);
  const [fiReportKinds, setFiReportKinds] = useState<Set<FiReportKind>>(
    new Set(['Annual report', 'Quarterly report', 'Half-year report']),
  );
  const [fiLanguageFilter, setFiLanguageFilter] = useState<FiReportLanguageFilter>('Swedish');
  const [fiSearchError, setFiSearchError] = useState<string | null>(null);
  const [searchingFi, setSearchingFi] = useState(false);
  const [importingFiReport, setImportingFiReport] = useState<string | null>(null);
  const [importingFiReports, setImportingFiReports] = useState(false);
  const [fiShortSelling, setFiShortSelling] = useState<FiShortSellingData | null>(null);
  const [fiShortSellingError, setFiShortSellingError] = useState<string | null>(null);
  const [searchingFiShortSelling, setSearchingFiShortSelling] = useState(false);

  // Fetch uploaded reports
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['report_documents', companyId, analysisId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_documents')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
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

        const { error: dbError } = await supabase.from('report_documents').insert({
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

  const searchFiReports = async () => {
    setSearchingFi(true);
    setFiReports(null);
    setSelectedFiReportKeys(new Set());
    setFiSearchError(null);
    try {
      const { data, error } = await supabase.functions.invoke('fi-reports', {
        body: { action: 'search', companyName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFiReports(data?.reports || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FI-tjänsten kunde inte nås.';
      setFiSearchError(`${message} Ladda upp PDF:en manuellt nedan.`);
      toast.error(message);
    } finally {
      setSearchingFi(false);
    }
  };

  const searchFiShortSelling = async () => {
    setSearchingFiShortSelling(true);
    setFiShortSelling(null);
    setFiShortSellingError(null);
    try {
      const { data, error } = await supabase.functions.invoke('fi-reports', {
        body: { action: 'short-positions', companyName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFiShortSelling(data?.shortSelling ?? { found: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FI:s blankningsregister kunde inte nås.';
      setFiShortSellingError(message);
      toast.error(message);
    } finally {
      setSearchingFiShortSelling(false);
    }
  };

  const importFiReport = async (report: FiReport, notify = true): Promise<boolean> => {
    setImportingFiReport(report.id);
    try {
      const reportRequest = {
        reportId: report.id,
        period: report.period,
        kind: report.kind,
        language: report.language,
        companyId,
        analysisId,
        companyName,
      };
      const { data: downloaded, error: downloadError } = await supabase.functions.invoke('fi-reports', {
        body: {
          action: 'download',
          ...reportRequest,
        },
      });
      if (downloadError) throw downloadError;
      if (!downloaded || typeof (downloaded as Blob).arrayBuffer !== 'function') {
        throw new Error('FI skickade ingen rapportfil.');
      }

      const archive = await (downloaded as Blob).arrayBuffer();
      const signature = new TextDecoder().decode(new Uint8Array(archive, 0, Math.min(archive.byteLength, 5)));
      let importBody: Record<string, unknown>;
      if (signature.startsWith('%PDF-')) {
        importBody = { action: 'import', ...reportRequest };
      } else {
        const reportText = await extractFiReportTextFromZip(archive);
        importBody = { action: 'import-text', ...reportRequest, reportText };
      }

      const { data, error } = await supabase.functions.invoke('fi-reports', { body: importBody });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.document?.id) setSelectedFileIds((current) => new Set(current).add(data.document.id));
      await queryClient.invalidateQueries({ queryKey: ['report_documents', companyId, analysisId] });
      if (notify) toast.success('Rapporten från FI har sparats och markerats för analys');
      return true;
    } catch (error) {
      if (notify) {
        toast.error(error instanceof Error ? error.message : 'Kunde inte hämta FI-rapporten. Ladda upp PDF:en manuellt.');
      }
      return false;
    } finally {
      setImportingFiReport(null);
    }
  };

  const toggleFiReport = (report: FiReport) => {
    const key = getFiReportKey(report);
    if (!selectedFiReportKeys.has(key) && selectedFiReportKeys.size >= MAX_ANALYSIS_REPORTS) {
      toast.error(`Välj högst ${MAX_ANALYSIS_REPORTS} rapporter åt gången.`);
      return;
    }
    setSelectedFiReportKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const importSelectedFiReports = async () => {
    const selected = (fiReports ?? []).filter((report) => selectedFiReportKeys.has(getFiReportKey(report)));
    if (selected.length === 0) return;
    if (selectedFileIds.size + selected.length > MAX_ANALYSIS_REPORTS) {
      toast.error(`Analysen kan innehålla högst ${MAX_ANALYSIS_REPORTS} rapporter. Avmarkera några redan uppladdade rapporter först.`);
      return;
    }

    setImportingFiReports(true);
    let imported = 0;
    const failedKeys = new Set<string>();
    try {
      for (const report of selected) {
        if (await importFiReport(report, false)) imported += 1;
        else failedKeys.add(getFiReportKey(report));
      }
      setSelectedFiReportKeys(failedKeys);
      if (imported > 0) {
        toast.success(`${imported} ${imported === 1 ? 'rapport har' : 'rapporter har'} hämtats från FI och markerats för analys`);
      }
      if (failedKeys.size > 0) {
        toast.error(`${failedKeys.size} rapport(er) kunde inte hämtas. De är fortfarande markerade så att du kan försöka igen.`);
      }
    } finally {
      setImportingFiReports(false);
    }
  };

  // Delete report
  const deleteMutation = useMutation({
    mutationFn: async (report: ReportDocument) => {
      await supabase.storage.from('reports').remove([report.file_path]);
      await supabase.from('report_documents').delete().eq('id', report.id);
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
        ? reports.filter((r) => selectedFileIds.has(r.id))
        : reports;

      if (filesToAnalyze.length === 0) throw new Error('Inga rapporter att analysera');
      if (filesToAnalyze.length > MAX_ANALYSIS_REPORTS) {
        throw new Error(`Välj högst ${MAX_ANALYSIS_REPORTS} rapporter per analys.`);
      }

      const { data, error } = await supabase.functions.invoke('analyze-reports', {
        body: {
          filePaths: filesToAnalyze.map((r) => r.file_path),
          question: question.trim() || undefined,
          companyName,
        },
      });
      if (error) {
        const context = 'context' in error ? error.context : undefined;
        if (context instanceof Response) {
          const body = await context.clone().json().catch(() => null) as { error?: string } | null;
          if (body?.error) throw new Error(body.error);
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data.summary;
    },
    onSuccess: (summary) => setAiResult(summary),
    onError: (err: Error) => toast.error(err.message || 'Kunde inte analysera rapporter'),
  });

  const toggleFile = (id: string) => {
    if (!selectedFileIds.has(id) && selectedFileIds.size >= MAX_ANALYSIS_REPORTS) {
      toast.error(`Välj högst ${MAX_ANALYSIS_REPORTS} rapporter per analys.`);
      return;
    }
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
  const formatPublishedAt = (publishedAt?: string) => {
    if (!publishedAt) return null;
    const [date, time] = publishedAt.split('T');
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}${time ? ` ${time}` : ''}`;
  };
  const reportsOfSelectedKinds = fiReports
    ? filterFiReportsByKind(fiReports, [...fiReportKinds])
    : [];
  const visibleFiReports = filterFiReportsByLanguage(reportsOfSelectedKinds, fiLanguageFilter);
  const fiReportGroups = fiReports ? groupFiReportsByYear(visibleFiReports) : [];
  const selectedFiReportCount = selectedFiReportKeys.size;
  const allFiReportsSelected = visibleFiReports.length > 0 &&
    visibleFiReports.every((report) => selectedFiReportKeys.has(getFiReportKey(report)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Rapportanalys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <section className="rounded-lg border p-4 space-y-3" aria-label="Hämta rapport från FI">
            <div className="rounded-md border bg-muted/20 p-3 space-y-3" aria-label="Hämta blankning från FI">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">FI:s blankningsregister</p>
                  <p className="text-xs text-muted-foreground">Hämta rapporterad blankning och historik för bolaget.</p>
                </div>
                <Button onClick={searchFiShortSelling} disabled={searchingFiShortSelling || !companyName} variant="outline" size="sm" className="gap-2">
                  {searchingFiShortSelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
                  {searchingFiShortSelling ? 'Söker blankning…' : 'Hämta blankning från FI'}
                </Button>
              </div>
              {fiShortSellingError && <p role="alert" className="text-sm text-destructive">{fiShortSellingError}</p>}
              {fiShortSelling && !fiShortSelling.found && (
                <p role="status" className="text-sm text-muted-foreground">Bolaget hittades inte i FI:s blankningsregister. Det kan saknas rapporterbara positioner eller så är FI inte behörig myndighet för bolaget.</p>
              )}
              {fiShortSelling?.found && (
                <div className="space-y-3" aria-label="Blankningsdata från FI">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <p className="text-sm font-medium">{fiShortSelling.issuerName}</p>
                    <p className="text-sm">Summa blankning: <strong>{fiShortSelling.totalPercentage?.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}%</strong></p>
                    {fiShortSelling.latestPositionDate && <p className="text-xs text-muted-foreground">Senaste positionsdatum: {fiShortSelling.latestPositionDate}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">Summan omfattar rapporterade positioner över 0,1 %. Innehavare visas av FI från 0,5 %.</p>
                  <FiShortPositionTable positions={fiShortSelling.positions ?? []} />
                  {(fiShortSelling.historicalPositions?.length ?? 0) > 0 && (
                    <details className="rounded-md border px-3">
                      <summary className="cursor-pointer py-2 text-sm font-medium">Historiska positioner ({fiShortSelling.historicalPositions!.length})</summary>
                      <div className="pb-3"><FiShortPositionTable positions={fiShortSelling.historicalPositions!} historical /></div>
                    </details>
                  )}
                  {fiShortSelling.sourceUrl && <a className="text-xs text-primary underline underline-offset-2" href={fiShortSelling.sourceUrl} target="_blank" rel="noreferrer">Visa källan hos FI</a>}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">FI:s rapportregister</p>
                <p className="text-xs text-muted-foreground">Primär källa för bolag som finns i FI:s register.</p>
              </div>
              <Button onClick={searchFiReports} disabled={searchingFi || importingFiReports || Boolean(importingFiReport) || !companyName} variant="outline" size="sm" className="gap-2">
                {searchingFi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {searchingFi ? 'Söker hos FI…' : 'Sök rapporter hos FI'}
              </Button>
            </div>

            {fiSearchError && (
              <p className="text-sm text-destructive" role="alert">{fiSearchError}</p>
            )}

            {fiReports?.length === 0 && (
              <p className="text-sm text-muted-foreground" role="status">
                Ingen rapport hittades hos FI. Ladda upp PDF:en manuellt nedan.
              </p>
            )}

            {fiReports && fiReports.length > 0 && (
              <div className="space-y-3" aria-label="Rapporter hittade hos FI">
                <div className="flex flex-wrap items-end justify-between gap-3 rounded-md bg-muted/40 p-2">
                  <fieldset className="min-w-0 space-y-1">
                    <legend className="text-xs text-muted-foreground">Rapporttyper att visa</legend>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {FI_REPORT_KIND_OPTIONS.map(({ kind, label }) => (
                        <label key={kind} className="inline-flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            aria-label={`Rapporttyp ${label}`}
                            checked={fiReportKinds.has(kind)}
                            disabled={importingFiReports || Boolean(importingFiReport)}
                            onChange={() => {
                              setFiReportKinds((current) => {
                                const next = new Set(current);
                                if (next.has(kind)) next.delete(kind);
                                else next.add(kind);
                                return next;
                              });
                              setSelectedFiReportKeys(new Set());
                            }}
                            className="h-4 w-4 accent-primary"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Språk
                    <select
                      aria-label="Filtrera rapporter efter språk"
                      className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                      value={fiLanguageFilter}
                      disabled={importingFiReports || Boolean(importingFiReport)}
                      onChange={(event) => {
                        setFiLanguageFilter(event.target.value as FiReportLanguageFilter);
                        setSelectedFiReportKeys(new Set());
                      }}
                    >
                      <option value="Swedish">Svenska om tillgängligt</option>
                      <option value="English">English if available</option>
                      <option value="all">Visa båda språken</option>
                    </select>
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={importingFiReports || Boolean(importingFiReport)}
                    onClick={() => {
                      if (allFiReportsSelected || selectedFiReportCount > 0) {
                        setSelectedFiReportKeys(new Set());
                        return;
                      }
                      setSelectedFiReportKeys(new Set(
                        visibleFiReports.slice(0, MAX_ANALYSIS_REPORTS).map(getFiReportKey),
                      ));
                      if (visibleFiReports.length > MAX_ANALYSIS_REPORTS) {
                        toast.error(`Du kan välja högst ${MAX_ANALYSIS_REPORTS} rapporter åt gången.`);
                      }
                    }}
                  >
                    {allFiReportsSelected || selectedFiReportCount > 0
                      ? 'Avmarkera valda'
                      : visibleFiReports.length > MAX_ANALYSIS_REPORTS
                        ? `Markera upp till ${MAX_ANALYSIS_REPORTS}`
                        : 'Markera alla'}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={selectedFiReportCount === 0 || importingFiReports || Boolean(importingFiReport)}
                    onClick={importSelectedFiReports}
                  >
                    {importingFiReports ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {importingFiReports
                      ? 'Hämtar valda rapporter…'
                      : `Hämta valda rapporter (${selectedFiReportCount})`}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  FI visar rapportperioden i listan. Publiceringsdatum visas när FI lämnar det för rapporten.
                </p>

                {visibleFiReports.length === 0 && (
                  <p className="text-sm text-muted-foreground" role="status">
                    Inga rapporter av valda typer. Ändra rapporttyperna ovan.
                  </p>
                )}

                {fiReportGroups.map((group, yearIndex) => {
                  const yearReports = [...group.annual, ...group.yearEnd, ...group.quarterly, ...group.other];
                  const yearSelected = yearReports.filter((report) => selectedFiReportKeys.has(getFiReportKey(report))).length;
                  const categories = [
                    { title: 'Årsredovisningar', reports: group.annual },
                    { title: 'Bokslutskommunikéer (Q4)', reports: group.yearEnd },
                    { title: 'Kvartals- och halvårsrapporter', reports: group.quarterly },
                    { title: 'Övriga rapporter', reports: group.other },
                  ].filter((category) => category.reports.length > 0);

                  return (
                    <details key={group.year} open={yearIndex === 0} className="rounded-md border px-3">
                      <summary className="cursor-pointer list-none py-3">
                        <span className="font-medium">
                          {group.year}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">{yearReports.length} rapporter</span>
                        </span>
                      </summary>
                      <div className="space-y-3 pb-3">
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={importingFiReports || Boolean(importingFiReport)}
                            onClick={() => {
                              if (yearSelected === yearReports.length) {
                                setSelectedFiReportKeys((current) => {
                                  const next = new Set(current);
                                  yearReports.forEach((report) => next.delete(getFiReportKey(report)));
                                  return next;
                                });
                                return;
                              }
                              const toAdd = yearReports.filter((report) =>
                                !selectedFiReportKeys.has(getFiReportKey(report))
                              );
                              const capacity = Math.max(0, MAX_ANALYSIS_REPORTS - selectedFiReportKeys.size);
                              setSelectedFiReportKeys((current) => {
                                const next = new Set(current);
                                toAdd.slice(0, capacity).forEach((report) => next.add(getFiReportKey(report)));
                                return next;
                              });
                              if (toAdd.length > capacity) {
                                toast.error(`Du kan välja högst ${MAX_ANALYSIS_REPORTS} rapporter åt gången.`);
                              }
                            }}
                          >
                            {yearSelected === yearReports.length ? 'Avmarkera år' : 'Markera år'}
                          </Button>
                        </div>
                        {categories.map((category) => (
                          <section key={category.title} className="space-y-1">
                            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{category.title}</h4>
                            <ul className="space-y-1">
                              {category.reports.map((report) => {
                                const reportKey = getFiReportKey(report);
                                return (
                                  <li key={reportKey}>
                                    <label className={cn(
                                      'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                                      selectedFiReportKeys.has(reportKey) ? 'bg-primary/10' : 'bg-muted/50 hover:bg-muted',
                                      (importingFiReports || Boolean(importingFiReport)) && 'cursor-not-allowed opacity-60',
                                    )}>
                                      <input
                                        type="checkbox"
                                        aria-label={`Välj ${report.period} ${report.kind} ${report.language}`}
                                        checked={selectedFiReportKeys.has(reportKey)}
                                        disabled={importingFiReports || Boolean(importingFiReport)}
                                        onChange={() => toggleFiReport(report)}
                                        className="h-4 w-4 accent-primary"
                                      />
                                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      <span className="min-w-0 flex-1">{report.period}</span>
                                      <span className="text-xs text-muted-foreground">{report.language}</span>
                                      {report.publishedAt && (
                                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                          <CalendarDays className="h-3.5 w-3.5" />
                                          Publicerad {formatPublishedAt(report.publishedAt)}
                                        </span>
                                      )}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Manual upload remains as fallback when FI has no matching filing. */}
        {!readOnly && (
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Manuell reserv</p>
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
                  <p className="text-sm font-medium">Ladda upp rapporter som PDF</p>
                  <p className="text-xs text-muted-foreground">Använd detta när FI saknar bolaget eller hämtningen misslyckas.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Uploaded files list */}
        {reports.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Uppladdade rapporter ({reports.length}) — klicka för att markera vilka som ska analyseras
            </p>
            <div className="space-y-1">
              {reports.map((report) => (
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
            <AssistantContent content={aiResult} allowHtml />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
