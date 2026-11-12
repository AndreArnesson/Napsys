import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { borsdataTranslations } from '@/i18n/borsdata';
import { searchBorsdataCompanies, type BorsdataInstrument } from '@/lib/borsdata';

export function CompanySearch({ onSelect, disabled = false }: {
  onSelect: (instrument: BorsdataInstrument) => void; disabled?: boolean;
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = borsdataTranslations[language];
  const id = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-result-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, id]);
  const lookup = useQuery({
    queryKey: ['borsdata-search', user?.id, debounced],
    queryFn: ({ signal }) => searchBorsdataCompanies(debounced, signal),
    enabled: !!user && open && !disabled && debounced.length >= 2,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const visible = open && !disabled && query.trim().length >= 2;
  const pending = query.trim() !== debounced || lookup.isFetching;
  const results = pending ? [] : lookup.data ?? [];
  const choose = (instrument: BorsdataInstrument) => {
    onSelect(instrument);
    setOpen(false);
    setQuery('');
    setActive(-1);
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <Label htmlFor={id}>{t.searchLabel}</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} role="combobox" aria-autocomplete="list" aria-expanded={visible && results.length > 0}
          aria-controls={`${id}-results`} aria-describedby={`${id}-help`}
          aria-activedescendant={visible && results[active] ? `${id}-result-${active}` : undefined}
          value={query} placeholder={t.searchPlaceholder} disabled={disabled} autoComplete="off" maxLength={120} className="pl-9"
          onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (visible && results[active]) choose(results[active]);
            } else if (visible && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
              event.preventDefault();
              setActive(index => event.key === 'ArrowDown' ? Math.min(index + 1, results.length - 1) : Math.max(index - 1, 0));
            } else if (visible && event.key === 'Escape') {
              event.preventDefault(); event.stopPropagation(); setOpen(false);
            }
          }} />
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">{t.searchHelp}</p>
      {visible && (pending ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />{t.searching}
      </p> : lookup.isError ? <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">{t.error}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => lookup.refetch()}>{t.retry}</Button>
      </div> : results.length ? <div id={`${id}-results`} role="listbox" aria-label={t.searchLabel}
        className="max-h-48 overflow-y-auto rounded-md border bg-background">
        {results.map((instrument, index) => <button key={instrument.urlName} id={`${id}-result-${index}`} type="button"
          role="option" aria-selected={active === index} onMouseEnter={() => setActive(index)} onClick={() => choose(instrument)}
          className={`block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent ${active === index ? 'bg-accent' : ''}`}>
          <span className="block text-sm font-medium">{instrument.name}</span>
          <span className="block text-xs text-muted-foreground">{instrument.ticker} · {instrument.country}</span>
        </button>)}
      </div> : <p role="status" className="text-sm text-muted-foreground">{t.noResults}</p>)}
    </div>
  );
}
