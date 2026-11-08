import { useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Newspaper, RefreshCw } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { newsTranslations } from '@/i18n/news';
import { safeAssistantUrl } from '@/lib/companyAssistant';
import { companyXSearch, loadMonitoredCompanies, loadNewsPage, NEWS_PAGE_SIZE } from '@/lib/newsFeed';

export default function News() {
  const { user, loading } = useAuth();
  if (loading) return <MainLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div></MainLayout>;
  if (!user) return <Navigate to="/auth" replace />;
  return <NewsContent key={user.id} userId={user.id} />;
}

function NewsContent({ userId }: { userId: string }) {
  const { language } = useLanguage();
  const texts = newsTranslations[language];
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const companyId = params.get('company');
  const tab = params.get('tab') === 'x' ? 'x' : 'news';
  const companies = useQuery({ queryKey: ['news-companies', userId],
    queryFn: ({ signal }) => loadMonitoredCompanies(signal), retry: false });
  const selection = (companies.data ?? []).filter(company => !companyId || company.id === companyId);
  const feed = useInfiniteQuery({
    queryKey: ['news-feed', userId, companyId], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => loadNewsPage(companyId, pageParam, signal),
    getNextPageParam: (last, pages) => last.length === NEWS_PAGE_SIZE ? pages.length : undefined,
    enabled: companies.isSuccess && selection.length > 0 && tab === 'news', retry: false,
  });
  useEffect(() => () => {
    queryClient.removeQueries({ queryKey: ['news-companies', userId] });
    queryClient.removeQueries({ queryKey: ['news-feed', userId] });
  }, [queryClient, userId]);
  const changeParam = (key: string, value: string) => {
    setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; });
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['news-companies', userId] });
    void queryClient.invalidateQueries({ queryKey: ['news-feed', userId] });
  };
  const visibleIds = new Set(selection.map(company => company.id));
  const articles = [...new Map((feed.data?.pages.flat() ?? []).filter(item => visibleIds.has(item.company_id)).map(item => [item.id, item])).values()];
  const formatDate = (value: string | null) => {
    const date = new Date(value ?? '');
    return Number.isFinite(date.getTime()) ? date.toLocaleString(language === 'sv' ? 'sv-SE' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }) : texts.unknownDate;
  };
  return <MainLayout><div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2"><h1 className="flex items-center gap-2 text-3xl font-bold"><Newspaper className="h-7 w-7" />{texts.title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{texts.description}</p></div>
      <Button variant="outline" onClick={refresh} disabled={companies.isFetching || feed.isFetching}><RefreshCw className="h-4 w-4" />{texts.refresh}</Button>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <Tabs value={tab} onValueChange={value => changeParam('tab', value === 'x' ? 'x' : '')}>
        <TabsList><TabsTrigger value="news">{texts.articles}</TabsTrigger><TabsTrigger value="x">{texts.social}</TabsTrigger></TabsList>
      </Tabs>
      <div className="w-full space-y-2 sm:w-72"><Label htmlFor="news-company">{texts.company}</Label>
        <select id="news-company" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={companyId ?? ''} onChange={event => changeParam('company', event.target.value)}>
          <option value="">{texts.all}</option>
          {(companies.data ?? []).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </div>
    </div>
    {companies.isPending && <p role="status" className="text-sm text-muted-foreground">{texts.loading}</p>}
    {(companies.isError || (tab === 'news' && feed.isError)) && <div role="alert" className="rounded-lg border p-4 text-sm">{texts.error}</div>}
    {companies.isSuccess && selection.length === 0 && <Card><CardHeader><CardTitle>{texts.noCompanies}</CardTitle></CardHeader>
      <CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{texts.enable}</p>
        <Button asChild variant="outline"><Link to="/">{texts.companies}</Link></Button>
        {companyId && <Button variant="ghost" onClick={() => changeParam('company', '')}>{texts.all}</Button>}
      </CardContent></Card>}
    {selection.length > 0 && tab === 'x' && <div className="space-y-4">
      <div className="space-y-2"><h2 className="text-xl font-semibold">{texts.socialTitle}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{texts.socialDescription}</p>
        <p className="max-w-3xl text-sm text-muted-foreground">{texts.socialLimit}</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{selection.map(company => <Card key={company.id}>
        <CardHeader><CardTitle className="text-lg"><Link to={`/company/${company.id}`}>{company.name}</Link></CardTitle>
          {company.ticker && <p className="text-sm text-muted-foreground">{company.ticker}</p>}</CardHeader>
        <CardContent><Button asChild variant="outline"><a href={companyXSearch(company)} target="_blank" rel="noopener noreferrer">{texts.openX}<ExternalLink className="h-4 w-4" /></a></Button></CardContent>
      </Card>)}</div>
    </div>}
    {selection.length > 0 && tab === 'news' && <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{texts.schedule}</p>
      {feed.isPending && <p role="status" className="text-sm text-muted-foreground">{texts.loading}</p>}
      {feed.isSuccess && articles.length === 0 && <Card><CardContent className="space-y-3 p-6">
        <p className="font-medium">{texts.empty}</p><p className="text-sm text-muted-foreground">{texts.emptyHelp}</p>
        {selection.length === 1 && <Link className="text-sm text-primary underline" to={`/company/${selection[0].id}?tab=assistant`}>{texts.companyLink}</Link>}
      </CardContent></Card>}
      {articles.map(item => {
        const url = safeAssistantUrl(item.url);
        return <Card key={item.id}><CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <Link className="font-medium text-primary hover:underline" to={`/company/${item.company_id}?tab=assistant`}>{item.companies.name}</Link>
            <span>{item.source} · {item.published_at ? formatDate(item.published_at) : `${texts.fetched}: ${formatDate(item.fetched_at)}`}</span>
          </div>
          <h2 className="text-lg font-semibold leading-snug">{url ? <a className="hover:underline" href={url} target="_blank" rel="noopener noreferrer">{item.title}</a> : item.title}</h2>
          {item.summary && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{item.summary}</p>}
          {url && <a className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href={url} target="_blank" rel="noopener noreferrer">{texts.original}<ExternalLink className="h-3 w-3" /></a>}
        </CardContent></Card>;
      })}
      {feed.hasNextPage && <Button variant="outline" onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>{feed.isFetchingNextPage ? texts.fetching : texts.more}</Button>}
    </div>}
  </div></MainLayout>;
}
