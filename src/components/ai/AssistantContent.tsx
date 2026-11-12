import { lazy, Suspense } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { AssistantContentProps } from './AssistantContentRenderer';

const Renderer = lazy(() => import('./AssistantContentRenderer').then(module => ({ default: module.AssistantContentRenderer })));

export function AssistantContent(props: AssistantContentProps) {
  const { t } = useLanguage();
  return <Suspense fallback={<div role="status" aria-label={t.common.loading} className="space-y-2 py-1">
    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
  </div>}>
    <Renderer {...props} />
  </Suspense>;
}
