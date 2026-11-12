import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AssistantContent } from '@/components/ai/AssistantContent';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, MessageSquare, Newspaper, RefreshCw, Send, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { companyAssistantTranslations, type CompanyAssistantTexts } from '@/i18n/companyAssistant';
import {
  assistantKeys,
  CompanyAssistantError,
  invokeAssistant,
  loadAssistantSettings,
  loadAssistantTurns,
  loadCompanyNews,
  parseAssistantFeeds,
  readChatTurn,
  safeAssistantUrl,
  saveAssistantSettings,
  type CompanyChatTurn,
} from '@/lib/companyAssistant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface CompanyAssistantProps {
  companyId: string;
  isOwner: boolean;
}

function errorMessage(error: unknown, texts: CompanyAssistantTexts, fallback: string): string {
  const code = error instanceof CompanyAssistantError ? error.code
    : typeof error === 'string' ? error : '';
  const message = ['quota_exhausted', 'daily_limit', 'quota_paused'].includes(code) ? texts.quotaError
    : code === 'rate_limited' ? texts.rateError
    : ['forbidden', 'unauthorized'].includes(code) ? texts.permissionError
    : code === 'chat_disabled' ? texts.chatDisabled
    : code === 'news_disabled' ? texts.newsOff
    : code === 'news_refresh_limited' ? texts.newsRefreshLimited
    : code === 'news_partial_feed_failure' ? texts.partialNewsError
    : ['invalid_feed_url', 'invalid_feed_urls'].includes(code) ? texts.invalidFeeds
    : ['invalid_request', 'invalid_question'].includes(code) ? texts.questionError
    : code === 'not_configured' ? texts.configurationError
    : code === 'disabled' ? texts.disabledError : fallback;
  const seconds = error instanceof CompanyAssistantError ? error.retryAfterSeconds : undefined;
  return seconds && Number.isFinite(seconds) && seconds > 0
    ? `${message} ${texts.retryAfter.replace('{seconds}', String(Math.ceil(seconds)))}` : message;
}

export function CompanyAssistant(props: CompanyAssistantProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  if (!user) return <p className="text-sm text-muted-foreground">{companyAssistantTranslations[language].signIn}</p>;
  return <CompanyAssistantContent key={`${props.companyId}:${user.id}`} {...props} userId={user.id} />;
}

function CompanyAssistantContent({ companyId, isOwner, userId }: CompanyAssistantProps & { userId: string }) {
  const { language } = useLanguage();
  const texts = companyAssistantTranslations[language];
  const queryClient = useQueryClient();
  const fieldId = useId();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lifecycle = useRef({ active: true, controller: new AbortController() });
  const [settingsInitialized, setSettingsInitialized] = useState(false);
  const [question, setQuestion] = useState('');
  const [chatEnabled, setChatEnabled] = useState(true);
  const [newsEnabled, setNewsEnabled] = useState(false);
  const [feeds, setFeeds] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pauseRevision, setPauseRevision] = useState(0);

  useEffect(() => {
    lifecycle.current.active = true;
    if (lifecycle.current.controller.signal.aborted) lifecycle.current.controller = new AbortController();
    const current = lifecycle.current;
    return () => {
      current.active = false;
      current.controller.abort();
      queryClient.removeQueries({ queryKey: assistantKeys.turns(companyId, userId), exact: true });
    };
  }, [companyId, userId, queryClient]);

  const settings = useQuery({
    queryKey: assistantKeys.settings(companyId, userId),
    queryFn: ({ signal }) => loadAssistantSettings(companyId, signal),
    retry: false,
  });
  const turns = useQuery({
    queryKey: assistantKeys.turns(companyId, userId),
    queryFn: ({ signal }) => loadAssistantTurns(companyId, userId, signal),
    retry: false,
  });
  const news = useQuery({
    queryKey: assistantKeys.news(companyId, userId),
    queryFn: ({ signal }) => loadCompanyNews(companyId, signal),
    retry: false,
  });

  useEffect(() => {
    if (!settings.isSuccess || settingsInitialized) return;
    setSettingsInitialized(true);
    setChatEnabled(settings.data?.chat_enabled ?? true);
    setNewsEnabled(settings.data?.news_enabled ?? false);
    setFeeds((settings.data?.feed_urls ?? []).join('\n'));
  }, [settings.data, settings.isSuccess, settingsInitialized]);

  const save = useMutation({
    mutationFn: async () => {
      if (!isOwner) throw new CompanyAssistantError('forbidden');
      const feedUrls = parseAssistantFeeds(feeds);
      if (feedUrls === null) throw new CompanyAssistantError('invalid_feed_url');
      await saveAssistantSettings(companyId, { chatEnabled, newsEnabled, feedUrls }, lifecycle.current.controller.signal);
    },
    retry: false,
    onSuccess: async () => {
      if (!lifecycle.current.active) return;
      setSettingsError('');
      setSettingsDirty(false);
      toast.success(texts.saved);
      await queryClient.invalidateQueries({ queryKey: assistantKeys.settings(companyId, userId) });
    },
    onError: error => {
      if (lifecycle.current.active) setSettingsError(errorMessage(error, texts, texts.settingsError));
    },
  });

  const chat = useMutation({
    mutationFn: async (submittedQuestion: string) => {
      const result = readChatTurn(await invokeAssistant('company-chat', { companyId, question: submittedQuestion, language }, lifecycle.current.controller.signal));
      if (result.company_id !== companyId || result.user_id !== userId) throw new CompanyAssistantError('request_failed');
      return result;
    },
    retry: false,
    onSuccess: turn => {
      if (!lifecycle.current.active) return;
      queryClient.setQueryData<CompanyChatTurn[]>(assistantKeys.turns(companyId, userId), previous =>
        [...(previous ?? []).filter(existing => existing.id !== turn.id), turn].slice(-20));
      setQuestion('');
    },
  });

  const refresh = useMutation({
    mutationFn: async () => {
      if (!isOwner) throw new CompanyAssistantError('forbidden');
      return invokeAssistant('company-news', { companyId, action: 'refresh', language }, lifecycle.current.controller.signal);
    },
    retry: false,
    onSuccess: async result => {
      if (!lifecycle.current.active) return;
      if (result && typeof result === 'object' && 'status' in result && result.status === 'paused') {
        const code = 'code' in result && typeof result.code === 'string' ? result.code : 'quota_exhausted';
        const seconds = 'retryAfterSeconds' in result && typeof result.retryAfterSeconds === 'number' ? result.retryAfterSeconds : undefined;
        toast.info(errorMessage(new CompanyAssistantError(code, seconds), texts, texts.newsError));
      } else if (result && typeof result === 'object' && 'status' in result && result.status === 'partial') {
        toast.info(texts.partialNewsError);
      } else toast.success(texts.newsUpdated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: assistantKeys.settings(companyId, userId) }),
        queryClient.invalidateQueries({ queryKey: assistantKeys.news(companyId, userId) }),
      ]);
    },
    onError: async () => {
      if (!lifecycle.current.active) return;
      await queryClient.invalidateQueries({ queryKey: assistantKeys.settings(companyId, userId) });
      await queryClient.invalidateQueries({ queryKey: assistantKeys.news(companyId, userId) });
    },
  });

  useEffect(() => {
    if (chat.isSuccess) bottomRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [chat.isSuccess, turns.data?.length]);

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim() || question.trim().length > 4000 || chat.isPending || !canChat) return;
    chat.mutate(question.trim());
  };
  const submitSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOwner || save.isPending) return;
    setSettingsError('');
    save.mutate();
  };
  const markSettingsDirty = () => {
    setSettingsDirty(true);
    setSettingsError('');
  };
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(language === 'sv' ? 'sv-SE' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }) : texts.notChecked;
  };
  const canChat = settings.isSuccess && (settings.data?.chat_enabled ?? true) && !turns.isError && !turns.isPending;
  const activeNews = settings.data?.news_enabled ?? false;
  const newsPause = settings.data?.news_paused_until;
  const isNewsPaused = !!newsPause && new Date(newsPause).getTime() > Date.now();
  const settingsLoaded = settings.isSuccess && settingsInitialized;

  useEffect(() => {
    const expiresAt = Date.parse(newsPause ?? '');
    const remaining = expiresAt - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    // Refresh the button at expiry without starting a new import or AI request.
    const timer = window.setTimeout(() => setPauseRevision(value => value + 1), Math.min(remaining + 1, 26 * 60 * 60 * 1000));
    return () => window.clearTimeout(timer);
  }, [newsPause, pauseRevision]);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{texts.quotaNote}</p>
      <Badge variant="secondary" className="shrink-0">{texts.freeTier}</Badge>
    </div>

    {settings.isError && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4 text-sm">
      <span>{texts.loadError}</span><Button variant="outline" size="sm" onClick={() => void settings.refetch()}>{texts.retry}</Button>
    </div>}

    {isOwner && settings.isSuccess && <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-medium text-sm [&::marker]:text-muted-foreground">
        <Settings2 className="mr-2 inline h-4 w-4" />{texts.settings}
      </summary>
      <form onSubmit={submitSettings} className="space-y-4 pt-4">
        <p className="text-sm text-muted-foreground">{texts.settingsDescription}</p>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${fieldId}-chat`}>{texts.chatEnabled}</Label>
          <Switch id={`${fieldId}-chat`} checked={chatEnabled} disabled={save.isPending || !settingsLoaded}
            onCheckedChange={value => { setChatEnabled(value); markSettingsDirty(); }} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${fieldId}-news`}>{texts.newsEnabled}</Label>
          <Switch id={`${fieldId}-news`} checked={newsEnabled} disabled={save.isPending || !settingsLoaded}
            onCheckedChange={value => { setNewsEnabled(value); markSettingsDirty(); }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-feeds`}>{texts.feedsLabel}</Label>
          <Textarea id={`${fieldId}-feeds`} value={feeds} placeholder={texts.feedsPlaceholder} rows={3}
            disabled={save.isPending || !settingsLoaded} aria-describedby={`${fieldId}-feeds-help`}
            onChange={event => { setFeeds(event.target.value); markSettingsDirty(); }} />
          <p id={`${fieldId}-feeds-help`} className="text-xs text-muted-foreground">{texts.feedsHelp}</p>
        </div>
        {settingsError && <p role="alert" className="text-sm text-destructive">{settingsError}</p>}
        <Button type="submit" size="sm" disabled={!settingsDirty || save.isPending || !settingsLoaded}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{save.isPending ? texts.saving : texts.save}
        </Button>
      </form>
    </details>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><MessageSquare className="h-5 w-5 text-primary" />{texts.title}</CardTitle>
          <CardDescription>{texts.description}</CardDescription>
          <p className="text-xs text-muted-foreground">{texts.privateChat}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[36rem] min-h-32 space-y-5 overflow-y-auto pr-1" role="log" aria-label={texts.title}>
            {turns.isPending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{texts.loading}</p>}
            {turns.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{texts.loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void turns.refetch()}>{texts.retry}</Button></div>}
            {turns.isSuccess && turns.data.length === 0 && <p className="py-5 text-sm text-muted-foreground">{texts.emptyChat}</p>}
            {(turns.data ?? []).map(turn => <article key={turn.id} className="space-y-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{texts.you}</p>
                <p className="whitespace-pre-wrap break-words text-sm">{turn.question}</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">{texts.assistant}</span><time dateTime={turn.created_at}>{formatDate(turn.created_at)}</time>
                </div>
                <AssistantContent content={turn.answer} sources={turn.sources} />
              </div>
            </article>)}
            {chat.isPending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{texts.thinking}</p>}
            <div ref={bottomRef} />
          </div>
          {settings.isSuccess && !settings.data?.chat_enabled && settings.data !== null && <p role="status" className="rounded-md bg-muted p-3 text-sm">{texts.chatDisabled}</p>}
          {chat.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(chat.error, texts, texts.chatError)}</p>}
          <form onSubmit={submitQuestion} className="space-y-2 border-t pt-4">
            <Label htmlFor={`${fieldId}-question`}>{texts.askLabel}</Label>
            <Textarea id={`${fieldId}-question`} value={question} onChange={event => { setQuestion(event.target.value); if (chat.isError) chat.reset(); }}
              placeholder={texts.askPlaceholder} rows={3} maxLength={4000} disabled={!canChat || chat.isPending}
              aria-describedby={`${fieldId}-source-note`} />
            <div className="flex items-start justify-between gap-3">
              <p id={`${fieldId}-source-note`} className="max-w-lg text-xs text-muted-foreground">{texts.sourcesNote}</p>
              <Button type="submit" size="sm" disabled={!canChat || chat.isPending || !question.trim()} className="shrink-0">
                {chat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{texts.send}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Newspaper className="h-5 w-5 text-primary" />{texts.newsTitle}</CardTitle>
            {isOwner && <Button variant="outline" size="sm" disabled={!activeNews || !settings.isSuccess || refresh.isPending || isNewsPaused}
              onClick={() => refresh.mutate()}>
              {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {refresh.isPending ? texts.refreshing : texts.refresh}
            </Button>}
          </div>
          <CardDescription>{texts.newsDescription}</CardDescription>
          {settings.isSuccess && <p className="text-xs text-muted-foreground">{activeNews ? texts.newsOn : texts.newsOff}</p>}
          <p className="text-xs text-muted-foreground">{texts.lastChecked}: {settings.data?.last_news_checked_at ? formatDate(settings.data.last_news_checked_at) : texts.notChecked}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isNewsPaused && <p role="status" className="rounded-md bg-muted p-3 text-sm">{texts.pausedUntil} {formatDate(newsPause)}</p>}
          {settings.data?.last_news_error && !refresh.isError && <p role="status" className="text-sm text-muted-foreground">
            {errorMessage(settings.data.last_news_error, texts, texts.newsError)}
          </p>}
          {refresh.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(refresh.error, texts, texts.newsError)}</p>}
          {settings.data?.news_summary && <section className="rounded-lg bg-primary/5 p-3 space-y-2">
            <h3 className="text-sm font-medium">{texts.newsSummary}</h3>
            <AssistantContent content={settings.data.news_summary} />
          </section>}
          {news.isPending && <p role="status" className="text-sm text-muted-foreground">{texts.loading}</p>}
          {news.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{texts.loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void news.refetch()}>{texts.retry}</Button></div>}
          {news.isSuccess && news.data.length === 0 && <p className="text-sm text-muted-foreground">{settings.data?.last_news_checked_at ? texts.noNewPosts : texts.noNews}</p>}
          <ul className="space-y-3">
            {(news.data ?? []).map(item => {
              const url = safeAssistantUrl(item.url);
              return <li key={item.id} className="space-y-2 rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{item.source || texts.unknownSource}
                  {item.published_at && <> · <time dateTime={item.published_at}>{formatDate(item.published_at)}</time></>}</p>
                {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-sm font-medium hover:text-primary hover:underline">
                  <span className="break-words">{item.title}</span><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                </a> : <p className="text-sm font-medium break-words">{item.title}</p>}
                {item.summary && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.summary}</p>}
              </li>;
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  </div>;
}
