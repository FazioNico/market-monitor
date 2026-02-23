# Report Output Format Contract (V1)

## File Naming

Reports MUST be written as Markdown files named:

```text
YYYY-MM-DD-hh-mm_market-report.md
```

Regex:

```regex
^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}_market-report\.md$
```

Notes:
- Date/time values are derived from the local system timezone.
- `hh-mm` uses zero-padded 24-hour time.

## File Location

- Default directory: `reports/`

## Required Sections (Ordered)

1. Report Metadata
2. News Summary / RSS Ingestion Summary
3. Market Snapshot
4. Regime Detection
5. Sentiment Scoring
6. Probabilistic Outlook
7. Risk & Invalidation
8. Position Wording
9. Run Notes / Diagnostics (optional but recommended)

## Required Metadata Fields (Markdown)

The report metadata section must include:
- generation timestamp
- report status (`complete` or `incomplete`)
- trigger type (`manual` or `scheduled`)
- data source summary (at minimum RSS + market provider names)

## Incomplete Report Rules (LLM Failure / Timeout)

If the report is incomplete due to LLM failure:

- File is still written using the standard filename format
- Metadata must mark `status: incomplete`
- Omitted sections must be explicitly labeled as omitted
- Omission reason must be included (for example: `LLM timeout`)

## Probabilistic Outlook Constraints

The rendered report must reflect validated values only:
- `Bull + Base + Bear = 100`
- No scenario percentage exceeds `70`
- Narrative justification is present

## Position Wording Constraints

When present, Position Wording must include:
- Current bias
- Conditions to increase exposure
- Conditions to reduce exposure
- No-trade zones
- Time horizon

If omitted in an incomplete report, the section heading still exists and states the omission reason.

## Readability Proxy (V1)

To support the 3-5 minute reading goal, the renderer should enforce a simple measurable proxy:

- Complete report rendered body word count MUST be `<= 1,200` words in default V1 rendering mode

This proxy is used for automated validation and may be refined later if report structure changes materially.
