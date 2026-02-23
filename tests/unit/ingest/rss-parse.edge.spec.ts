import { describe, expect, it } from "vitest";

import { ValidationError } from "../../../src/shared/errors";
import { parseRssEntries } from "../../../src/ingest/rss-parse";

describe("rss parse edge cases", () => {
  it("rejects malformed or incomplete RSS entries", () => {
    const missingFields = `<?xml version="1.0"?>
<rss version="2.0"><channel><item><title>Missing link/date</title></item></channel></rss>`;

    expect(() =>
      parseRssEntries(missingFields, {
        source: "x",
        category: "y",
        ingestedAt: "2026-02-23T00:00:00.000Z",
      }),
    ).toThrowError(ValidationError);

    expect(() =>
      parseRssEntries("<xml>bad</xml>", {
        source: "x",
        category: "y",
        ingestedAt: "2026-02-23T00:00:00.000Z",
      }),
    ).toThrowError(ValidationError);
  });
});
