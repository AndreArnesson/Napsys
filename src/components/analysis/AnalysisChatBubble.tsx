import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare, Send, X } from 'lucide-react';
import { AssistantContent } from '@/components/ai/AssistantContent';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { analysisChatTranslations } from '@/i18n/analysisChat';
import type { AnalysisValuationContext } from '@/lib/analysisValuation';
import { companyAssistantTranslations } from '@/i18n/companyAssistant';
import {
  analysisChatKey, analysisDraftPayload, loadAnalysisChat, readAnalysisChatTurn,
  type AnalysisChatDraft, type AnalysisChatTurn,
} from '@/lib/analysisChat';
import {
  assistantKeys, CompanyAssistantError, invokeAssistant, loadAssistantSettings,
} from '@/lib/companyAssistant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface AnalysisChatBubbleProps {
  companyId: string;
  analysisId: string;
  analysisName?: string;
  draft?: AnalysisChatDraft;
  getValuationContext?: () => AnalysisValuationContext | undefined;
}

export function AnalysisChatBubble(props: AnalysisChatBubbleProps) {
  const { user } = useAuth();
  if (!user) return null;
  return <AnalysisChatContent key={`${props.companyId}:${props.analysisId}:${user.id}`} {...props} userId={user.id} />;
}

function AnalysisChatContent({ companyId, analysisId, analysisName, draft, getValuationContext, userId }: AnalysisChatBubbleProps & { userId: string }) {
  const { language } = useLanguage();
  const texts = analysisChatTranslations[language];
  const common = companyAssistantTranslations[language];
  const queryClient = useQueryClient();
  const questionId = useId();
  const messagesRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const focusQuestionOnOpenRef = useRef(false);
  const submittingRef = useRef(false);
  const lifecycle = useRef({ active: true, controller: new AbortController() });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const valuationGetterRef = useRef(getValuationContext);
  valuationGetterRef.current = getValuationContext;
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');

  useEffect(() => {
    lifecycle.current.active = true;
    if (lifecycle.current.controller.signal.aborted) lifecycle.current.controller = new AbortController();
    const current = lifecycle.current;
    return () => {
      current.active = false;
      current.controller.abort();
      queryClient.removeQueries({ queryKey: analysisChatKey(companyId, analysisId, userId), exact: true });
    };
  }, [companyId, analysisId, userId, queryClient]);

  const settings = useQuery({
    queryKey: assistantKeys.settings(companyId, userId),
    queryFn: ({ signal }) => loadAssistantSettings(companyId, signal),
    enabled: open,
    retry: false,
  });
  const turns = useQuery({
    queryKey: analysisChatKey(companyId, analysisId, userId),
    queryFn: ({ signal }) => loadAnalysisChat(companyId, analysisId, userId, signal),
    enabled: open,
    retry: false,
  });

  const chat = useMutation({
    mutationFn: async (submittedQuestion: string) => {
      const analysisDraft = analysisDraftPayload(draftRef.current);
      const analysisValuation = valuationGetterRef.current?.();
      const result = await invokeAssistant('company-chat', {
        companyId, analysisId, question: submittedQuestion, language,
        ...(analysisDraft ? { analysisDraft } : {}),
        ...(analysisValuation ? { analysisValuation } : {}),
      }, lifecycle.current.controller.signal);
      return readAnalysisChatTurn(result, companyId, analysisId, userId);
    },
    retry: false,
    onSuccess: turn => {
      if (!lifecycle.current.active) return;
      queryClient.setQueryData<AnalysisChatTurn[]>(analysisChatKey(companyId, analysisId, userId), previous =>
        [...(previous ?? []).filter(existing => existing.id !== turn.id), turn].slice(-20));
      setQuestion('');
    },
    onSettled: () => { submittingRef.current = false; },
  });

  useEffect(() => {
    const messages = messagesRef.current;
    if (chat.isSuccess && open && messages) messages.scrollTo?.({ top: messages.scrollHeight, behavior: 'smooth' });
  }, [chat.isSuccess, turns.data?.length, open]);

  const chatAllowed = settings.isSuccess && (settings.data?.chat_enabled ?? true) && turns.isSuccess;
  useEffect(() => {
    if (open && chatAllowed && focusQuestionOnOpenRef.current) {
      focusQuestionOnOpenRef.current = false;
      questionRef.current?.focus({ preventScroll: true });
    }
  }, [open, chatAllowed]);
  const errorMessage = (error: unknown) => {
    const code = error instanceof CompanyAssistantError ? error.code : '';
    const message = ['quota_exhausted', 'daily_limit', 'quota_paused', 'project_daily_limit', 'user_daily_limit'].includes(code) ? common.quotaError
      : code === 'rate_limited' ? common.rateError
      : ['forbidden', 'unauthorized', 'analysis_not_found', 'company_not_found'].includes(code) ? texts.permissionError
      : code === 'chat_disabled' ? common.chatDisabled
      : ['invalid_request', 'invalid_question'].includes(code) ? common.questionError
      : code === 'not_configured' ? common.configurationError : common.chatError;
    const seconds = error instanceof CompanyAssistantError ? error.retryAfterSeconds : undefined;
    return seconds && Number.isFinite(seconds) && seconds > 0
      ? `${message} ${common.retryAfter.replace('{seconds}', String(Math.ceil(seconds)))}` : message;
  };
  const sendQuestion = () => {
    if (!chatAllowed || chat.isPending || submittingRef.current || !question.trim() || question.trim().length > 4000) return;
    submittingRef.current = true;
    chat.mutate(question.trim());
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendQuestion();
  };

  return <Popover modal={false} open={open} onOpenChange={nextOpen => {
    focusQuestionOnOpenRef.current = nextOpen;
    setOpen(nextOpen);
  }}>
    <PopoverTrigger asChild>
      <Button type="button" size="icon" aria-label={texts.launch} title={texts.launch}
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg ring-1 ring-background/20 sm:bottom-8 sm:right-8">
        <MessageSquare className="h-5 w-5" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent side="top" align="end" sideOffset={12} collisionPadding={16}
      aria-modal={false} aria-labelledby={`${questionId}-title`} aria-describedby={`${questionId}-context`}
      onInteractOutside={event => {
        // Keep the chat open while the user reads or edits the analysis.
        focusQuestionOnOpenRef.current = false;
        event.preventDefault();
      }}
      className="flex h-[min(40rem,calc(100dvh-7rem))] max-h-[var(--radix-popover-content-available-height)] w-[min(28rem,calc(100vw-2rem))] flex-col gap-0 overflow-y-auto overscroll-contain rounded-xl p-0 shadow-xl">
      <div className="shrink-0 space-y-2 border-b p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 id={`${questionId}-title`} className="line-clamp-2 break-words pr-2 text-lg font-semibold" title={analysisName?.trim() || texts.title}>{analysisName?.trim() || texts.title}</h2>
            <p id={`${questionId}-context`} className="text-sm text-muted-foreground">{texts.context}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label={texts.close} onClick={() => setOpen(false)} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div><Badge variant="secondary">{common.freeTier}</Badge></div>
        <p className="text-xs text-muted-foreground">{texts.privateChat}</p>
        {draft && <p className="text-xs text-muted-foreground">{texts.draftContext}</p>}
      </div>

      <div ref={messagesRef} className="min-h-24 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4" role="log" aria-label={texts.title}>
        {(settings.isPending || turns.isPending) && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />{common.loading}
        </p>}
        {(settings.isError || turns.isError) && <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{texts.loadError}</p>
          <Button variant="outline" size="sm" onClick={() => { void settings.refetch(); void turns.refetch(); }}>{common.retry}</Button>
        </div>}
        {turns.isSuccess && turns.data.length === 0 && <p className="py-5 text-sm leading-relaxed text-muted-foreground">{texts.empty}</p>}
        {(turns.data ?? []).map(turn => <article key={turn.id} className="space-y-3">
          <div className="rounded-lg bg-muted p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{common.you}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{turn.question}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{texts.assistant}</p>
            <AssistantContent content={turn.answer} sources={turn.sources} />
          </div>
        </article>)}
        {chat.isPending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />{common.thinking}
        </p>}
      </div>

      <div className="shrink-0 space-y-3 border-t bg-background p-4">
        {settings.isSuccess && settings.data?.chat_enabled === false && <p role="status" className="text-sm text-muted-foreground">{common.chatDisabled}</p>}
        {chat.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(chat.error)}</p>}
        <form onSubmit={submit} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Label htmlFor={questionId}>{texts.question}</Label>
            <span id={`${questionId}-keyboard`} className="text-xs text-muted-foreground">{texts.keyboardHint}</span>
          </div>
          <Textarea ref={questionRef} id={questionId} value={question} rows={2} maxLength={4000} placeholder={texts.placeholder}
            className="resize-none" disabled={!chatAllowed || chat.isPending} aria-describedby={`${questionId}-keyboard ${questionId}-quota`}
            onKeyDown={event => {
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              event.preventDefault();
              if (!event.repeat) sendQuestion();
            }}
            onChange={event => { setQuestion(event.target.value); if (chat.isError) chat.reset(); }} />
          <div className="flex items-start justify-between gap-3">
            <p id={`${questionId}-quota`} className="text-xs text-muted-foreground">{common.quotaNote}</p>
            <Button type="submit" size="sm" disabled={!chatAllowed || chat.isPending || !question.trim()} className="shrink-0">
              {chat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{common.send}
            </Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">{common.sourcesNote}</p>
      </div>
    </PopoverContent>
  </Popover>;
}
