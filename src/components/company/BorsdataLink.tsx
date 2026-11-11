import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { borsdataTranslations } from '@/i18n/borsdata';
import { borsdataExportUrl, loadBorsdataLink, type BorsdataInstrument } from '@/lib/borsdata';

const linkClass = 'inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors';

export function BorsdataLink({ companyId, name, ticker, exchange }: {
  companyId: string; name: string; ticker?: string | null; exchange?: string | null;
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = borsdataTranslations[language];
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['borsdata-link', user?.id, companyId, name, ticker, exchange];
  const lookup = useQuery({
    queryKey,
    queryFn: ({ signal }) => loadBorsdataLink(companyId, signal),
    enabled: !!user,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const choose = (instrument: BorsdataInstrument) => {
    queryClient.setQueryData(queryKey, { ...lookup.data, match: instrument });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span className="inline-flex items-center gap-1">
        {lookup.data?.match ? (
          <>
            <a href={borsdataExportUrl(lookup.data.match)} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <ExternalLink className="h-3 w-3" />{t.label}
            </a>
            <DialogTrigger asChild>
              <button type="button" className="p-1 text-muted-foreground hover:text-foreground" aria-label={t.change} title={t.change}>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DialogTrigger>
          </>
        ) : (
          <DialogTrigger asChild>
            <button type="button" className={linkClass} disabled={lookup.isLoading} title={lookup.isLoading ? t.loading : t.choose}>
              {lookup.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}{t.label}
            </button>
          </DialogTrigger>
        )}
      </span>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.choose}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {lookup.isFetching ? <p role="status" className="text-sm text-muted-foreground">{t.loading}</p>
          : lookup.isError ? <p role="alert" className="text-sm text-destructive">{t.error}</p>
            : !lookup.data?.candidates.length ? <p className="text-sm text-muted-foreground">{t.empty}</p> : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {lookup.data.candidates.map(instrument => (
                  <a key={instrument.urlName} href={borsdataExportUrl(instrument)} target="_blank" rel="noopener noreferrer"
                    onClick={() => choose(instrument)} className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted">
                    <span><span className="block text-sm font-medium">{instrument.name}</span>
                      <span className="block text-xs text-muted-foreground">{instrument.ticker} · {instrument.country}</span></span>
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </a>
                ))}
              </div>
            )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => lookup.refetch()} disabled={lookup.isFetching}>{t.retry}</Button>
          <Button variant="outline" asChild>
            <a href="https://borsdata.se/terminal" target="_blank" rel="noopener noreferrer">{t.openTerminal}<ExternalLink className="ml-1 h-3 w-3" /></a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
