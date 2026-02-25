import type { NewsItem, NewsReadingPriorityList, PrioritizedNewsItem } from "../shared/types";

type LlmInvoke = (prompt: { skillDescription: string; context: unknown }) => Promise<unknown>;

export interface TopArticleSummaryEnrichmentOptions {
  fetchFn?: typeof fetch;
  llmInvoke?: LlmInvoke;
  timeoutMs?: number;
  concurrency?: number;
  maxSummaryChars?: number;
  onLlmError?: (error: unknown) => void;
  onItemProcessed?: (event: {
    completed: number;
    total: number;
    index: number;
    item: PrioritizedNewsItem;
    stats: TopArticleSummaryEnrichmentStats;
  }) => void | Promise<void>;
}

export interface TopArticleSummaryEnrichmentStats {
  total: number;
  fromArticleContent: number;
  fromRssFallback: number;
  unavailable: number;
  fetchErrors: number;
  llmSummaries: number;
  llmErrors: number;
}

export interface TopArticleSummaryEnrichmentResult {
  topArticlesToRead: NewsReadingPriorityList;
  stats: TopArticleSummaryEnrichmentStats;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_SUMMARY_CHARS = 260;

const BOILERPLATE_PATTERNS = [
  /\bcookie(s)?\b/i,
  /\bprivacy policy\b/i,
  /\bterms of use\b/i,
  /\bsubscribe\b/i,
  /\bnewsletter\b/i,
  /\badvertis(?:e|ement)\b/i,
  /\bsign up\b/i,
  /\baccept all\b/i,
  /\bcontinue reading\b/i,
];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTitleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function truncateAtWordBoundary(value: string, maxChars: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const slice = normalized.slice(0, Math.max(0, maxChars - 3));
  const trimmed = slice.replace(/\s+\S*$/, "").trim();
  return `${(trimmed || slice).trim()}...`;
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    hellip: "...",
    mdash: "-",
    ndash: "-",
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (_m, name) => namedEntities[name.toLowerCase()] ?? `&${name};`);
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, ". ")
      .replace(/<\/(div|section|article|li|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function removeNonContentBlocks(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ");
}

function extractLongestTagInnerHtml(html: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let best = "";
  for (const match of html.matchAll(regex)) {
    const inner = match[1] ?? "";
    if (inner.length > best.length) {
      best = inner;
    }
  }
  return best || undefined;
}

function parseMetaTags(html: string): Array<Record<string, string>> {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const parsed: Array<Record<string, string>> = [];

  for (const tag of tags) {
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    for (const match of tag.matchAll(attrRegex)) {
      const key = (match[1] ?? "").toLowerCase();
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      if (key) {
        attrs[key] = decodeHtmlEntities(value);
      }
    }
    if (Object.keys(attrs).length > 0) {
      parsed.push(attrs);
    }
  }

  return parsed;
}

function extractMetaDescription(html: string): string | undefined {
  for (const meta of parseMetaTags(html)) {
    const key = (meta.property ?? meta.name ?? "").toLowerCase();
    if (!["og:description", "twitter:description", "description"].includes(key)) {
      continue;
    }
    const content = normalizeWhitespace(meta.content ?? "");
    if (content && !BOILERPLATE_PATTERNS.some((pattern) => pattern.test(content))) {
      return content;
    }
  }
  return undefined;
}

function extractCandidateParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  for (const match of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = normalizeWhitespace(stripTags(match[1] ?? ""));
    if (text.length < 40) {
      continue;
    }
    if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text))) {
      continue;
    }
    paragraphs.push(text);
  }
  return paragraphs;
}

function sanitizeLlmSummary(input: { value: string; title: string; maxChars: number }): string | undefined {
  let value = normalizeWhitespace(input.value)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\s*summary\s*:\s*/i, "")
    .replace(/^\s*[-*]\s*/, "");

  if (!value) {
    return undefined;
  }

  value = value.replace(new RegExp(`^${input.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:\\s-]*`, "i"), "");
  value = normalizeWhitespace(value);
  if (value.length < 20) {
    return undefined;
  }
  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(value))) {
    return undefined;
  }

  return truncateAtWordBoundary(value, input.maxChars);
}

function parseLlmSummaryValue(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    return raw;
  }

  const root = getObject(raw);
  if (!root) {
    return undefined;
  }

  const direct =
    parseString(root.summary) ??
    parseString(root.article_summary) ??
    parseString(root.articleSummary) ??
    parseString(root.concise_summary) ??
    parseString(root.conciseSummary);
  if (direct) {
    return direct;
  }

  const nested = getObject(root.output) ?? getObject(root.result) ?? getObject(root.data);
  if (!nested) {
    return undefined;
  }
  return (
    parseString(nested.summary) ??
    parseString(nested.article_summary) ??
    parseString(nested.articleSummary) ??
    parseString(nested.concise_summary) ??
    parseString(nested.conciseSummary)
  );
}

function buildArticleSummaryPrompt(maxChars: number): string {
  return [
    "Task: Summarize one news article for a market monitoring report.",
    "Return JSON only.",
    'Output schema: {"summary":"..."}',
    "",
    "Rules:",
    "- Use only the provided article excerpt / metadata.",
    "- 1-2 sentences, factual, concise, no hype.",
    "- Focus on what changed and why it matters for market participants.",
    `- Keep the summary under ${maxChars} characters.`,
    "- Do not include markdown, bullets, or prefixes like 'Summary:'.",
  ].join("\n");
}

async function summarizeArticleWithLlm(input: {
  llmInvoke: LlmInvoke;
  item: PrioritizedNewsItem;
  articleText?: string;
  metaDescription?: string;
  maxSummaryChars: number;
}): Promise<string> {
  const excerpt = normalizeWhitespace(input.articleText ?? "").slice(0, 2_400);
  const metaDescription = normalizeWhitespace(input.metaDescription ?? "").slice(0, 600);
  if (!excerpt && !metaDescription) {
    throw new Error("No article text extracted for LLM summarization");
  }

  const raw = await input.llmInvoke({
    skillDescription: buildArticleSummaryPrompt(input.maxSummaryChars),
    context: {
      article: {
        title: input.item.title,
        source: input.item.source,
        published_at: input.item.publishedAt,
        category: input.item.category,
        link: input.item.link,
        article_excerpt: excerpt || undefined,
        meta_description: metaDescription || undefined,
      },
    },
  });

  const parsed = parseLlmSummaryValue(raw);
  const sanitized = parsed
    ? sanitizeLlmSummary({
        value: parsed,
        title: input.item.title,
        maxChars: input.maxSummaryChars,
      })
    : undefined;

  if (!sanitized) {
    throw new Error("LLM summary output missing valid summary");
  }

  return sanitized;
}

function extractArticleText(html: string): { articleText?: string; metaDescription?: string } {
  const cleanedHtml = removeNonContentBlocks(html);
  const preferredScope =
    extractLongestTagInnerHtml(cleanedHtml, "article") ??
    extractLongestTagInnerHtml(cleanedHtml, "main") ??
    extractLongestTagInnerHtml(cleanedHtml, "body") ??
    cleanedHtml;

  const scopedParagraphs = extractCandidateParagraphs(preferredScope);
  const allParagraphs = scopedParagraphs.length > 0 ? scopedParagraphs : extractCandidateParagraphs(cleanedHtml);
  const articleText =
    allParagraphs.length > 0
      ? allParagraphs
          .slice(0, 6)
          .join(" ")
          .slice(0, 4_000)
      : undefined;

  return {
    articleText,
    metaDescription: extractMetaDescription(cleanedHtml),
  };
}

async function fetchHtml(url: string, options: { fetchFn: typeof fetch; timeoutMs: number }): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Unsupported article URL protocol");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchFn(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "market-monitor/0.1",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const size = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

function buildRssSummaryLookup(newsItems: NewsItem[]): {
  byLink: Map<string, string>;
  byTitle: Map<string, string>;
} {
  const byLink = new Map<string, string>();
  const byTitle = new Map<string, string>();

  for (const item of newsItems) {
    const summary = truncateAtWordBoundary(item.summary, DEFAULT_MAX_SUMMARY_CHARS);
    if (!summary) {
      continue;
    }
    byLink.set(item.link, summary);
    byTitle.set(normalizeTitleKey(item.title), summary);
  }

  return { byLink, byTitle };
}

function withArticleSummary(item: PrioritizedNewsItem, articleSummary: string | undefined): PrioritizedNewsItem {
  return articleSummary ? { ...item, articleSummary } : item;
}

export async function enrichTopArticlesWithContentSummaries(
  input: {
    topArticlesToRead: NewsReadingPriorityList;
    newsItems: NewsItem[];
  },
  options: TopArticleSummaryEnrichmentOptions = {},
): Promise<TopArticleSummaryEnrichmentResult> {
  const items = input.topArticlesToRead.items;
  const stats: TopArticleSummaryEnrichmentStats = {
    total: items.length,
    fromArticleContent: 0,
    fromRssFallback: 0,
    unavailable: 0,
    fetchErrors: 0,
    llmSummaries: 0,
    llmErrors: 0,
  };

  if (items.length === 0) {
    return {
      topArticlesToRead: input.topArticlesToRead,
      stats,
    };
  }

  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = clampInt(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000, 30_000);
  const concurrency = clampInt(options.concurrency ?? DEFAULT_CONCURRENCY, 1, 8);
  const maxSummaryChars = clampInt(options.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS, 120, 500);
  const rssSummaryLookup = buildRssSummaryLookup(input.newsItems);
  let completed = 0;

  const enrichedItems = await mapWithConcurrency(items, concurrency, async (item) => {
    const rssFallback =
      rssSummaryLookup.byLink.get(item.link) ??
      rssSummaryLookup.byTitle.get(normalizeTitleKey(item.title));

    let html: string | undefined;
    try {
      html = await fetchHtml(item.link, { fetchFn, timeoutMs });
    } catch {
      stats.fetchErrors += 1;
    }

    let enrichedItem: PrioritizedNewsItem;

    if (html) {
      try {
        const extracted = extractArticleText(html);
        if (options.llmInvoke) {
          try {
            const articleSummary = await summarizeArticleWithLlm({
              llmInvoke: options.llmInvoke,
              item,
              articleText: extracted.articleText,
              metaDescription: extracted.metaDescription,
              maxSummaryChars,
            });
            stats.fromArticleContent += 1;
            stats.llmSummaries += 1;
            enrichedItem = withArticleSummary(item, articleSummary);
            completed += 1;
            await options.onItemProcessed?.({
              completed,
              total: items.length,
              index: item.rank - 1,
              item: enrichedItem,
              stats: { ...stats },
            });
            return enrichedItem;
          } catch (error) {
            stats.llmErrors += 1;
            options.onLlmError?.(error);
          }
        }
      } catch {
        // Fall back to the RSS summary if article parsing fails on malformed HTML.
      }
    }

    if (rssFallback) {
      stats.fromRssFallback += 1;
      enrichedItem = withArticleSummary(item, truncateAtWordBoundary(rssFallback, maxSummaryChars));
      completed += 1;
      await options.onItemProcessed?.({
        completed,
        total: items.length,
        index: item.rank - 1,
        item: enrichedItem,
        stats: { ...stats },
      });
      return enrichedItem;
    }

    stats.unavailable += 1;
    completed += 1;
    await options.onItemProcessed?.({
      completed,
      total: items.length,
      index: item.rank - 1,
      item,
      stats: { ...stats },
    });
    return item;
  });

  return {
    topArticlesToRead: {
      ...input.topArticlesToRead,
      items: enrichedItems,
    },
    stats,
  };
}
