import { describe, expect, it } from "vitest";

import { ValidationError } from "../../../src/shared/errors";
import { parseFeedCatalogMarkdown } from "../../../src/config/feed-catalog";

describe("feed catalog parser", () => {
  it("parses front matter lookback and filters disabled rows", () => {
    const markdown = `---
version: "1.0"
default_lookback_hours: 36
---

| Category | Source | URL | Enabled | Notes |
|---|---|---|---|---|
| crypto | CoinDesk | https://www.coindesk.com/arc/outboundfeeds/rss/ | true | main |
| macro | Fed | https://www.federalreserve.gov/feeds/press_all.xml | false | disabled |
`;

    const result = parseFeedCatalogMarkdown(markdown);

    expect(result.defaultLookbackHours).toBe(36);
    expect(result.effectiveLookbackHours).toBe(36);
    expect(result.entries).toHaveLength(1);
    expect(result.allEntries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      category: "crypto",
      source: "CoinDesk",
      enabled: true,
    });
  });

  it("applies precedence for lookback: override > front matter > default 24", () => {
    const withFrontMatter = `---
default_lookback_hours: 48
---

| category | source | url | enabled | notes |
|---|---|---|---|---|
| crypto | A | https://example.com/a.xml | true | x |
`;

    const withoutFrontMatter = `
| category | source | url | enabled | notes |
|---|---|---|---|---|
| crypto | A | https://example.com/a.xml | true | x |
`;

    expect(parseFeedCatalogMarkdown(withFrontMatter).effectiveLookbackHours).toBe(48);
    expect(
      parseFeedCatalogMarkdown(withFrontMatter, {
        lookbackHoursOverride: 12,
      }).effectiveLookbackHours,
    ).toBe(12);
    expect(parseFeedCatalogMarkdown(withoutFrontMatter).effectiveLookbackHours).toBe(24);
  });

  it("rejects invalid enabled values, duplicates, and missing required columns", () => {
    const invalidEnabled = `
| category | source | url | enabled | notes |
|---|---|---|---|---|
| crypto | A | https://example.com/a.xml | yes | x |
`;

    const duplicateUrl = `
| category | source | url | enabled | notes |
|---|---|---|---|---|
| crypto | A | https://example.com/a.xml | true | x |
| macro | B | https://example.com/a.xml | true | y |
`;

    const missingColumn = `
| category | source | url | enabled |
|---|---|---|---|
| crypto | A | https://example.com/a.xml | true |
`;

    expect(() => parseFeedCatalogMarkdown(invalidEnabled)).toThrowError(ValidationError);
    expect(() => parseFeedCatalogMarkdown(duplicateUrl)).toThrowError(ValidationError);
    expect(() => parseFeedCatalogMarkdown(missingColumn)).toThrowError(ValidationError);
  });
});
