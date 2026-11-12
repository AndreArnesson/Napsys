import { memo, useId } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { SKIP, visit } from 'unist-util-visit';
import type { ElementContent, Root } from 'hast';
import { ExternalLink } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { assistantContentTranslations } from '@/i18n/assistantContent';
import { safeAssistantUrl, type AssistantSource } from '@/lib/companyAssistant';

export interface AssistantContentProps {
  content: string;
  sources?: AssistantSource[];
  /** Only for summaries and report analyses that already store HTML. */
  allowHtml?: boolean;
}

interface CitationTarget {
  source: AssistantSource;
  anchor: string;
}

// Transform text nodes, never code or existing links. Only supplied source IDs
// become citations, so a model cannot invent a clickable source.
function rehypeCitations({ targets }: { targets: CitationTarget[] }) {
  const byId = new Map(targets.map(target => [target.source.id, target]));
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type === 'element' && ['a', 'code', 'pre'].includes(node.tagName)) return SKIP;
      if (node.type !== 'text' || index === undefined || parent?.type !== 'element') return;
      const parts: ElementContent[] = [];
      let offset = 0;
      for (const match of node.value.matchAll(/\[([A-Za-z][A-Za-z0-9_-]*)\]/g)) {
        const target = byId.get(match[1]);
        if (!target) continue;
        if (match.index > offset) parts.push({ type: 'text', value: node.value.slice(offset, match.index) });
        parts.push({
          type: 'element', tagName: 'a',
          properties: { href: `#${target.anchor}`, title: target.source.label },
          children: [{ type: 'text', value: match[0] }],
        });
        offset = match.index + match[0].length;
      }
      if (parts.length === 0) return;
      if (offset < node.value.length) parts.push({ type: 'text', value: node.value.slice(offset) });
      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}

export const AssistantContentRenderer = memo(function AssistantContentRenderer({ content, sources = [], allowHtml = false }: AssistantContentProps) {
  const { language } = useLanguage();
  const texts = assistantContentTranslations[language];
  const id = useId().replace(/:/g, '');
  const targets = sources.map((source, index) => ({ source, anchor: `assistant-${id}-source-${index}` }));
  const byHref = new Map(targets.map(target => [`#${target.anchor}`, target]));

  return <div className="min-w-0">
    <div className="prose prose-sm min-w-0 max-w-none break-words text-foreground dark:prose-invert
      prose-headings:mb-2 prose-headings:mt-5 prose-headings:font-semibold prose-headings:text-foreground
      prose-h3:text-base prose-h4:text-sm prose-h5:text-sm prose-h6:text-sm
      prose-p:my-3 prose-p:whitespace-pre-line prose-p:leading-7
      prose-ul:my-3 prose-ul:pl-5 prose-ol:my-3 prose-ol:pl-5 prose-li:my-1 prose-li:leading-7
      prose-strong:font-semibold prose-strong:text-foreground prose-a:text-primary dark:prose-a:text-blue-300
      prose-blockquote:border-primary/30 prose-blockquote:font-normal prose-blockquote:text-muted-foreground
      prose-code:break-words prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5
      prose-code:font-normal prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none
      prose-pre:overflow-x-auto prose-pre:bg-muted prose-pre:text-foreground
      prose-th:whitespace-nowrap prose-th:bg-muted/60 prose-th:px-3 prose-th:py-2 prose-th:text-foreground
      prose-td:min-w-[7rem] prose-td:px-3 prose-td:py-2 prose-td:align-top
      [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          ...(allowHtml ? [rehypeRaw, rehypeSanitize] : []),
          [rehypeCitations, { targets }],
        ]}
        urlTransform={(url, key) => key === 'href' ? (byHref.has(url) ? url : safeAssistantUrl(url)) : undefined}
        components={{
          h1: 'h3', h2: 'h3',
          // AI output must not load remote images or tracking pixels.
          img: ({ alt }) => alt ? <span>{alt}</span> : null,
          a: ({ href, children, title }) => {
            if (!href) return <span>{children}</span>;
            const citation = byHref.get(href);
            const external = !citation && !href.startsWith('/');
            return <a href={href} title={title}
              target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}
              aria-label={citation ? texts.citation.replace('{id}', citation.source.id).replace('{label}', citation.source.label) : undefined}
              className={citation
                ? 'not-prose inline rounded bg-primary/10 px-1 py-0.5 text-xs font-medium text-primary no-underline hover:bg-primary/20 dark:bg-blue-400/10 dark:text-blue-300 dark:hover:bg-blue-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'rounded underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}
              onClick={citation ? event => {
                event.preventDefault();
                const source = document.getElementById(citation.anchor);
                source?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
                source?.focus({ preventScroll: true });
              } : undefined}>{children}</a>;
          },
          table: ({ children }) => <div role="region" aria-label={texts.table} tabIndex={0}
            className="my-4 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border dark:[color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <table className="my-0 w-full text-sm">{children}</table>
          </div>,
        }}
      >{content}</Markdown>
    </div>
    {targets.length > 0 && <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">{texts.sources}</p>
      <ul className="flex flex-wrap gap-2">
        {targets.map(({ source, anchor }) => {
          const url = safeAssistantUrl(source.url);
          return <li key={anchor} id={anchor} tabIndex={-1}
            className="max-w-full scroll-m-3 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background">
            {url ? <a href={url} target={url.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-primary hover:underline dark:text-blue-300">
              <span className="break-words">[{source.id}] {source.label}</span><ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            </a> : <span className="inline-block rounded-md border bg-background px-2 py-1 text-xs break-words">[{source.id}] {source.label}</span>}
          </li>;
        })}
      </ul>
    </div>}
  </div>;
});
