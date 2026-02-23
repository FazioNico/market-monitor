import { createHash } from "node:crypto";

import type { NewsItem, NormalizedNewsItem } from "../shared/types";

function normalizeLink(link: string): string {
  try {
    const url = new URL(link);
    url.hash = "";
    const utmKeys = [...url.searchParams.keys()].filter((key) => key.toLowerCase().startsWith("utm_"));
    for (const key of utmKeys) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return link.trim().toLowerCase();
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildNewsFingerprint(item: NormalizedNewsItem): string {
  const basis = [
    normalizeLink(item.link),
    normalizeText(item.title),
    item.publishedAt.slice(0, 10),
  ].join("|");

  return createHash("sha1").update(basis).digest("hex");
}

export function deduplicateNews(items: NormalizedNewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const fingerprint = buildNewsFingerprint(item);
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    result.push({
      ...item,
      fingerprint,
    });
  }

  return result;
}
