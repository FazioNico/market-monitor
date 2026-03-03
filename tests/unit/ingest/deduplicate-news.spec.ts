import { describe, expect, it } from "vitest";

import { buildNewsFingerprint, deduplicateNews } from "../../../src/ingest/deduplicate-news";

describe("news deduplication", () => {
  it("creates stable fingerprints and removes duplicates", () => {
    const base = {
      title: "Bitcoin rebounds after overnight selloff",
      publishedAt: "2026-02-23T08:15:00.000Z",
      source: "Sample",
      summary: "Risk assets stabilized.",
      category: "crypto",
      ingestedAt: "2026-02-23T08:20:00.000Z",
    };

    const items = [
      { ...base, link: "https://example.com/articles/bitcoin-rebounds?utm_source=rss" },
      { ...base, link: "https://example.com/articles/bitcoin-rebounds" },
    ];

    expect(buildNewsFingerprint(items[0]!)).toBe(buildNewsFingerprint(items[1]!));

    const deduped = deduplicateNews(items);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.fingerprint).toHaveLength(40);
  });
});
