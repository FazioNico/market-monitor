import { XMLParser } from "fast-xml-parser";

import { ValidationError } from "../shared/errors";
import type { NormalizedNewsItem } from "../shared/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function toIsoDate(value: string | undefined): string {
  if (!value) {
    throw new ValidationError("RSS entry missing publication date", ["publishedAt/pubDate is required"]);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError("Invalid RSS publication date", [`Unable to parse date: ${value}`]);
  }
  return date.toISOString();
}

function stripHtml(input: string | undefined): string {
  return (input ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(input: string, max = 280): string {
  if (input.length <= max) {
    return input;
  }
  return `${input.slice(0, max - 1).trimEnd()}…`;
}

function normalizeRssItems(input: unknown, meta: { source: string; category: string; ingestedAt: string }) {
  const items = asArray<any>((input as any)?.rss?.channel?.item);
  return items.map((item) => {
    const title = String(item?.title ?? "").trim();
    const link = String(item?.link ?? "").trim();
    const summary = truncate(stripHtml(item?.description ?? item?.["content:encoded"] ?? ""));
    const publishedAt = toIsoDate(String(item?.pubDate ?? item?.published ?? ""));

    if (!title || !link) {
      throw new ValidationError("RSS item missing required fields", ["title and link are required"]);
    }

    return {
      title,
      link,
      summary,
      publishedAt,
      source: meta.source,
      category: meta.category,
      ingestedAt: meta.ingestedAt,
    } satisfies NormalizedNewsItem;
  });
}

function normalizeAtomEntries(input: unknown, meta: { source: string; category: string; ingestedAt: string }) {
  const entries = asArray<any>((input as any)?.feed?.entry);
  return entries.map((entry) => {
    const title = String(entry?.title?.["#text"] ?? entry?.title ?? "").trim();
    const linkValue = Array.isArray(entry?.link)
      ? entry.link.find((x: any) => x?.["@_rel"] === "alternate")?.["@_href"] ?? entry.link[0]?.["@_href"]
      : entry?.link?.["@_href"] ?? entry?.link;
    const link = String(linkValue ?? "").trim();
    const summary = truncate(
      stripHtml(String(entry?.summary?.["#text"] ?? entry?.summary ?? entry?.content?.["#text"] ?? entry?.content ?? "")),
    );
    const publishedAt = toIsoDate(String(entry?.updated ?? entry?.published ?? ""));

    if (!title || !link) {
      throw new ValidationError("Atom entry missing required fields", ["title and link are required"]);
    }

    return {
      title,
      link,
      summary,
      publishedAt,
      source: meta.source,
      category: meta.category,
      ingestedAt: meta.ingestedAt,
    } satisfies NormalizedNewsItem;
  });
}

export function parseRssEntries(xml: string, meta: { source: string; category: string; ingestedAt: string }) {
  const parsed = parser.parse(xml);

  if ((parsed as any)?.rss?.channel) {
    return normalizeRssItems(parsed, meta);
  }

  if ((parsed as any)?.feed) {
    return normalizeAtomEntries(parsed, meta);
  }

  throw new ValidationError("Unsupported feed format", ["Expected RSS or Atom XML"]);
}
