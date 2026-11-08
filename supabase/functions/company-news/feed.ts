import { SaxesParser } from "saxes";

/** Only these publishers are fetched. Article links are displayed, never fetched. */
export const FEED_HOSTS = new Set([
  "news.cision.com",
  "news.google.com",
  "mfn.se",
  "www.mfn.se",
  "www.di.se",
  "feeds.feedburner.com",
]);
export const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_XML_NODES = 10_000;
const MAX_XML_DEPTH = 32;

export interface FeedItem {
  url: string;
  title: string;
  source: string;
  published_at: string | null;
  /** Short excerpt supplied by the RSS publisher, not a generated claim. */
  summary: string | null;
}

export class FeedError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function isAllowedFeedUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") && FEED_HOSTS.has(url.hostname) &&
      (url.hostname !== "news.google.com" || url.pathname.startsWith("/rss"));
  } catch {
    return false;
  }
}

export function defaultNewsFeed(companyName: string): string {
  const url = new URL("https://news.google.com/rss/search");
  // Quotes keep common company names from matching unrelated individual words.
  const name = companyName.replace(/["\r\n]/g, " ").trim().slice(0, 150);
  url.searchParams.set("q", `"${name}" when:7d`);
  url.searchParams.set("hl", "sv");
  url.searchParams.set("gl", "SE");
  url.searchParams.set("ceid", "SE:sv");
  return url.toString();
}

/** A display-only link must not be executable or carry credentials. */
export function normalizeArticleUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value.trim(), base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (!url.hostname.includes(".") || /^(?:\d+\.){3}\d+$/.test(url.hostname) || url.hostname.includes(":")) return null;
    if (/(?:^|\.)(?:localhost|local|internal|testhost)$/.test(url.hostname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    const normalized = url.toString();
    return normalized.length <= 3000 ? normalized : null;
  } catch {
    return null;
  }
}

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  text: string;
  children: XmlNode[];
}

const localName = (name: string) => name.split(":").at(-1)?.toLowerCase() || "";
const child = (node: XmlNode, name: string) => node.children.find((entry) => entry.name === name);
const content = (node?: XmlNode): string => node
  ? node.text + node.children.map((entry) => content(entry)).join(" ")
  : "";

function cleanText(value: string, maxLength: number): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (match) => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
  })[match] || match).replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim().slice(0, maxLength);
}

export function parseNewsFeed(xml: string, feedUrl: string): FeedItem[] {
  if (new TextEncoder().encode(xml).byteLength > MAX_FEED_BYTES) throw new FeedError("feed_too_large");
  const roots: XmlNode[] = [];
  const stack: XmlNode[] = [];
  let nodes = 0;
  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", () => { throw new FeedError("feed_invalid_xml"); });
  parser.on("opentag", (tag) => {
    if (++nodes > MAX_XML_NODES || stack.length >= MAX_XML_DEPTH) throw new FeedError("feed_too_large");
    const node: XmlNode = { name: localName(tag.name), attributes: tag.attributes, text: "", children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  });
  const text = (value: string) => { if (stack.length) stack[stack.length - 1].text += value; };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.on("closetag", () => { stack.pop(); });
  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError("feed_invalid_xml");
  }
  const root = roots[0];
  if (!root || !["rss", "rdf", "feed"].includes(root.name)) throw new FeedError("feed_invalid_xml");
  const channel = root.name === "rss" ? child(root, "channel") : root;
  if (!channel) throw new FeedError("feed_invalid_xml");
  const entries = channel.children.filter((node) => node.name === (root.name === "feed" ? "entry" : "item"));
  const feedTitle = cleanText(content(child(channel, "title")), 150) || new URL(feedUrl).hostname;
  return entries.slice(0, 100).flatMap((entry) => {
    const title = cleanText(content(child(entry, "title")), 500);
    const links = entry.children.filter((node) => node.name === "link");
    const link = root.name === "feed"
      ? links.find((node) => !node.attributes.rel || node.attributes.rel === "alternate")?.attributes.href
      : content(links[0]) || content(child(entry, "guid"));
    const url = link ? normalizeArticleUrl(link, feedUrl) : null;
    if (!title || !url) return [];
    const dateText = content(child(entry, "pubdate")) || content(child(entry, "published")) ||
      content(child(entry, "updated")) || content(child(entry, "date"));
    const timestamp = Date.parse(dateText);
    const source = cleanText(content(child(entry, "source")), 150) || feedTitle;
    const excerpt = cleanText(content(child(entry, "description")) || content(child(entry, "summary")) ||
      content(child(entry, "content")) || content(child(entry, "encoded")), 1200);
    return [{ url, title, source, published_at: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null, summary: excerpt || null }];
  });
}

export function deduplicateNews(items: FeedItem[]): FeedItem[] {
  const urls = new Set<string>();
  const headlines = new Set<string>();
  return items.filter((item) => {
    const headline = `${item.title.toLocaleLowerCase().replace(/\s+/g, " ").trim()}|${item.source.toLocaleLowerCase().trim()}`;
    if (urls.has(item.url) || headlines.has(headline)) return false;
    urls.add(item.url);
    headlines.add(headline);
    return true;
  });
}

export function recentNews(items: FeedItem[], now: number, lastCheckedAt?: string | null): FeedItem[] {
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  // An overlap covers delayed feed publication and changes around the previous check.
  const previousCheck = Date.parse(lastCheckedAt || "");
  const cutoff = Number.isFinite(previousCheck) ? Math.max(sevenDaysAgo, previousCheck - 24 * 60 * 60 * 1000) : sevenDaysAgo;
  return deduplicateNews(items).filter((item) => {
    if (!item.published_at) return true;
    const timestamp = Date.parse(item.published_at);
    return timestamp >= cutoff && timestamp <= now + 24 * 60 * 60 * 1000;
  }).sort((a, b) => (b.published_at || "").localeCompare(a.published_at || "")).slice(0, 50);
}

/** Redirects are manual so an approved feed cannot redirect the server to an internal URL. */
export async function downloadNewsFeed(feedUrl: string, fetcher: typeof fetch = fetch): Promise<string> {
  let currentUrl = feedUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    for (let redirect = 0; redirect <= 2; redirect++) {
      if (!isAllowedFeedUrl(currentUrl)) throw new FeedError("invalid_feed_url");
      const response = await fetcher(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Napsys/1.0 RSS", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirect === 2) throw new FeedError("news_feed_failed");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!response.ok || !response.body) throw new FeedError("news_feed_failed");
      if (Number(response.headers.get("content-length")) > MAX_FEED_BYTES) {
        await response.body.cancel();
        throw new FeedError("feed_too_large");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0;
      let text = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_FEED_BYTES) throw new FeedError("feed_too_large");
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      return text;
    }
    throw new FeedError("news_feed_failed");
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError("news_feed_failed");
  } finally {
    clearTimeout(timeout);
  }
}
