import { describe, expect, it } from "vitest";

import { ValidationError } from "../../../src/shared/errors";
import { parseRssEntries } from "../../../src/ingest/rss-parse";

describe("rss parse edge cases", () => {
  it("skips incomplete RSS entries but rejects unsupported feed formats", () => {
    const missingFields = `<?xml version="1.0"?>
<rss version="2.0"><channel><item><title>Missing link/date</title></item></channel></rss>`;

    expect(
      parseRssEntries(missingFields, {
        source: "x",
        category: "y",
        ingestedAt: "2026-02-23T00:00:00.000Z",
      }),
    ).toEqual([]);

    expect(() =>
      parseRssEntries("<xml>bad</xml>", {
        source: "x",
        category: "y",
        ingestedAt: "2026-02-23T00:00:00.000Z",
      }),
    ).toThrowError(ValidationError);
  });
});
