import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseRssEntries } from "../../../src/ingest/rss-parse";

describe("rss parse", () => {
  it("normalizes RSS entries from fixture XML", async () => {
    const fixture = await readFile(
      join(process.cwd(), "tests", "fixtures", "rss", "sample-feed.xml"),
      "utf8",
    );

    const items = parseRssEntries(fixture, {
      source: "Sample",
      category: "crypto",
      ingestedAt: "2026-02-23T08:20:00.000Z",
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "Sample",
      category: "crypto",
      title: "Bitcoin rebounds after overnight selloff",
    });
    expect(items[0]?.publishedAt).toMatch(/^2026-02-23T08:15:00/);
  });

  it("normalizes Atom entries", () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <entry>
    <title>Macro policy update</title>
    <link href="https://example.com/macro-policy" />
    <updated>2026-02-23T09:00:00Z</updated>
    <summary>Policy statement and market implications</summary>
  </entry>
</feed>`;

    const items = parseRssEntries(atom, {
      source: "AtomSource",
      category: "macro",
      ingestedAt: "2026-02-23T09:10:00.000Z",
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.link).toBe("https://example.com/macro-policy");
  });
});
