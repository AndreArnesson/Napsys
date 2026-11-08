// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_FEED_BYTES,
  defaultNewsFeed,
  deduplicateNews,
  downloadNewsFeed,
  isAllowedFeedUrl,
  normalizeArticleUrl,
  parseNewsFeed,
  recentNews,
  type FeedItem,
} from '../../supabase/functions/company-news/feed';

const feedUrl = 'https://news.cision.com/example/rss';
const item = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  title: 'Example wins an order', url: 'https://example.com/order', source: 'Example AB',
  summary: null, published_at: '2026-11-08T07:00:00.000Z', ...overrides,
});

describe('RSS and Atom ingestion', () => {
  it('decodes XML and CDATA, preserves publication dates and cleans publisher excerpts', () => {
    const result = parseNewsFeed(`<?xml version="1.0"?><rss version="2.0"><channel>
      <title>Issuer news</title><item><title><![CDATA[Example &amp; Company reports Q3]]></title>
      <link>https://example.com/q3?utm_source=feed&amp;report=2026#top</link>
      <description><![CDATA[<p>Sales grew <b>12%</b>.</p>]]></description>
      <source>Company &#65;B</source><pubDate>Sun, 08 Nov 2026 08:00:00 +0100</pubDate>
      </item></channel></rss>`, feedUrl);
    expect(result).toEqual([{
      url: 'https://example.com/q3?report=2026', title: 'Example & Company reports Q3',
      source: 'Company AB', summary: 'Sales grew 12%.', published_at: '2026-11-08T07:00:00.000Z',
    }]);
  });

  it('handles Atom namespaces, alternate links and an invalid date without using the self link', () => {
    const result = parseNewsFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Market news</title>
      <entry><title>Quarterly results</title><link rel="self" href="https://example.com/api/q3"/>
      <link rel="alternate" href="https://example.com/q3"/><updated>not a date</updated>
      <summary>Revenue &gt; last year</summary></entry>
      <entry><title>Unsafe link</title><link href="javascript:alert(1)"/></entry></feed>`, feedUrl);
    expect(result).toEqual([{
      title: 'Quarterly results', url: 'https://example.com/q3', source: 'Market news',
      summary: 'Revenue > last year', published_at: null,
    }]);
  });

  it('supports RSS 1.0 RDF and a namespaced publication date', () => {
    const result = parseNewsFeed(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <item><title>News</title><link>https://example.com/news</link><dc:date>2026-11-08T08:00:00Z</dc:date></item></rdf:RDF>`, feedUrl);
    expect(result[0].published_at).toBe('2026-11-08T08:00:00.000Z');
  });

  it('accepts a valid empty feed and rejects malformed XML and non-feed HTML', () => {
    expect(parseNewsFeed('<rss><channel><title>Empty</title></channel></rss>', feedUrl)).toEqual([]);
    for (const xml of ['<rss><channel><item></channel></rss>', '<html><body>Login</body></html>', 'not XML']) {
      expect(() => parseNewsFeed(xml, feedUrl)).toThrow();
    }
  });

  it('rejects DTDs and external entities instead of fetching or expanding them', () => {
    expect(() => parseNewsFeed(`<!DOCTYPE rss [<!ENTITY xxe SYSTEM "http://127.0.0.1/secret">]>
      <rss><channel><item><title>&xxe;</title></item></channel></rss>`, feedUrl)).toThrow('feed_invalid_xml');
  });

  it('bounds document size, node count, nesting and extracted item count', () => {
    expect(() => parseNewsFeed(' '.repeat(MAX_FEED_BYTES + 1), feedUrl)).toThrow('feed_too_large');
    expect(() => parseNewsFeed(`<rss><channel>${'<a>'.repeat(40)}${'</a>'.repeat(40)}</channel></rss>`, feedUrl)).toThrow('feed_too_large');
    expect(() => parseNewsFeed(`<rss><channel>${'<x/>'.repeat(10_001)}</channel></rss>`, feedUrl)).toThrow('feed_too_large');
    const xml = `<rss><channel>${Array.from({ length: 120 }, (_, index) => `<item><title>News ${index}</title><link>https://example.com/${index}</link></item>`).join('')}</channel></rss>`;
    expect(parseNewsFeed(xml, feedUrl)).toHaveLength(100);
  });
});

describe('feed URL security and bounded downloading', () => {
  it('fetches only HTTPS URLs on the supported publisher hostnames', () => {
    expect(isAllowedFeedUrl(feedUrl)).toBe(true);
    expect(isAllowedFeedUrl('https://news.google.com/rss/search?q=example')).toBe(true);
    for (const value of [
      'http://news.cision.com/rss', 'https://127.0.0.1/rss', 'https://[::1]/rss',
      'https://localhost/rss', 'https://news.cision.com.evil.com/rss',
      'https://evil.com@news.cision.com/rss', 'https://news.cision.com:8443/rss',
      'https://news.google.com/not-rss', 'file:///secret', '',
    ]) expect(isAllowedFeedUrl(value), value).toBe(false);
  });

  it('rejects executable article links and normalizes tracking parameters', () => {
    expect(normalizeArticleUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeArticleUrl('https://user:secret@example.com/')).toBeNull();
    expect(normalizeArticleUrl('https://127.0.0.1/')).toBeNull();
    expect(normalizeArticleUrl('https://example.com/story?utm_source=a&fbclid=b&keep=c#top'))
      .toBe('https://example.com/story?keep=c');
  });

  it('validates every redirect before following it', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }));
    await expect(downloadNewsFeed(feedUrl, fetcher)).rejects.toThrow('invalid_feed_url');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
  });

  it('follows a bounded redirect to another approved source', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://news.cision.com/issuer/feed' } }))
      .mockResolvedValueOnce(new Response('<rss><channel/></rss>'));
    expect(await downloadNewsFeed(feedUrl, fetcher)).toBe('<rss><channel/></rss>');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('enforces the byte limit even when a response has no Content-Length', async () => {
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_FEED_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    } }));
    await expect(downloadNewsFeed(feedUrl, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow('feed_too_large');
  });

  it('builds a default company-specific RSS query without adding untrusted URL parameters', () => {
    const url = new URL(defaultNewsFeed('Example "AB" & Co\nOther'));
    expect(url.hostname).toBe('news.google.com');
    expect(url.searchParams.get('q')).toBe('"Example  AB  & Co Other" when:7d');
    expect(url.searchParams.get('ceid')).toBe('SE:sv');
  });
});

describe('daily news selection', () => {
  it('removes duplicate URLs and duplicate publisher headlines without dropping other stories', () => {
    expect(deduplicateNews([
      item(), item({ title: 'Renamed title' }), item({ url: 'https://example.com/copy' }),
      item({ title: 'Different material event', url: 'https://example.com/new' }),
    ])).toHaveLength(2);
  });

  it('uses an overlap for delayed feed entries, excludes stale/future stories and sorts newest first', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    const result = recentNews([
      item(),
      item({ url: 'https://example.com/old', title: 'Old', published_at: '2026-10-01T00:00:00.000Z' }),
      item({ url: 'https://example.com/future', title: 'Future', published_at: '2027-01-01T00:00:00.000Z' }),
      item({ url: 'https://example.com/delayed', title: 'Delayed', published_at: '2026-11-06T14:00:00.000Z' }),
    ], now, '2026-11-07T12:00:00Z');
    expect(result.map((entry) => entry.title)).toEqual(['Example wins an order', 'Delayed']);
  });
});
