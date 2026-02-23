# Quickstart - Morning Market Review Agent (V1)

Date: 2026-02-23  
Branch: `001-morning-market-review-agent`

## Purpose

This quickstart describes the intended local development and execution workflow for the V1 implementation planned in this feature branch.

## Prerequisites

- Bun 1.x installed
- TypeScript 5.x
- Internet access for RSS feeds, CoinGecko API requests, and FRED API requests
- LLM provider credentials (for LLM-assisted sentiment/position wording bindings)

## Planned Project Setup

1. Install dependencies (runtime + test stack):

```bash
bun install
bun add fast-xml-parser gray-matter
bun add -d vitest @vitest/coverage-v8
```

2. Create runtime directories (if missing):

```bash
mkdir -p config skills/sentiment skills/outlook skills/positioning reports logs
```

3. Create the feed catalog file:

```text
config/rss-feeds.md
```

Use the contract in `specs/001-morning-market-review-agent/contracts/rss-feed-catalog-format.md`.

4. Create the watchlist file:

```text
config/watchlist.json
```

Start with CoinGecko-supported instruments only in the first implementation slice.

5. Create skill files:

```text
skills/sentiment/*.md
skills/outlook/*.md
skills/positioning/*.md
```

Use the contract in `specs/001-morning-market-review-agent/contracts/skill-file-format.md`.

6. Configure environment variables in `.env`:

```dotenv
LLM_API_KEY=...
LLM_BASE_URL=https://...
LLM_MODEL=...
REPORTS_DIR=reports
RUN_LOG_PATH=logs/runs.jsonl
FRED_API_KEY=...
```

Optional (if CoinGecko plan/tier requires key):

```dotenv
COINGECKO_API_KEY=...
```

V1 macro indicator context uses FRED series for CPI, PCE, unemployment, and M2.

## Planned Development Commands

Run the CLI entry point (manual review):

```bash
bun run dev -- review run
```

Start scheduler:

```bash
bun run dev -- scheduler start
```

Validate config/contracts before execution:

```bash
bun run dev -- config validate
```

## Planned Test Commands (Vitest)

Unit tests:

```bash
bunx vitest run tests/unit
```

Functional tests:

```bash
bunx vitest run tests/functional
```

Coverage gate:

```bash
bunx vitest run --coverage
```

## Expected Output

Reports are written as Markdown files using this filename format:

```text
YYYY-MM-DD-hh-mm_market-report.md
```

Example:

```text
reports/2026-02-23-08-15_market-report.md
```

Run logs are appended to:

```text
logs/runs.jsonl
```

## Incomplete Report Behavior (LLM Failure)

If the LLM binding fails or times out:

- The report is still written
- LLM-dependent sections are omitted
- The report is marked incomplete
- The run log records `partial_success` with LLM failure status
