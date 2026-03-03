# RSS Feed Catalog Format Contract (V1)

## File Location

- Default path: `config/rss-feeds.md`

## Purpose

User-maintained catalog of RSS/Atom feed URLs organized by category/theme.

## Format

The file is Markdown with:
- Optional YAML front matter (metadata only)
- One required Markdown table with strict columns

### Optional YAML Front Matter

Allowed keys:
- `version` (string)
- `updated_at` (string, ISO-8601)
- `default_lookback_hours` (number)

Example:

```md
---
version: "1.0"
updated_at: "2026-02-23T08:00:00Z"
default_lookback_hours: 24
---
```

### Required Markdown Table

Required header columns (case-insensitive, exact semantic mapping):

- `category`
- `source`
- `url`
- `enabled`
- `notes` (optional values, but column is required for deterministic parsing)

Example:

```md
| category | source | url | enabled | notes |
|---|---|---|---|---|
| crypto | CoinDesk | https://www.coindesk.com/arc/outboundfeeds/rss/ | true | General crypto news |
| macro | Fed News | https://www.federalreserve.gov/feeds/press_all.xml | true | Policy announcements |
```

## Parsing Rules

- Exactly one table is parsed as the feed catalog.
- Rows with `enabled=false` are ignored by runtime ingestion.
- `enabled` accepted values: `true`, `false` (case-insensitive).
- `url` must be absolute `http(s)`.
- Duplicate rows (same normalized URL) are rejected during validation.

## Validation Failures

The parser must fail validation when:
- Required columns are missing
- `enabled` has invalid values
- URL is invalid
- Table is absent or empty

Validation errors are surfaced by `config validate` and logged for runtime failures.
