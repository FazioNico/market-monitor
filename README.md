# market-monitor

Local Bun/TypeScript CLI to generate a Markdown morning market review from:
- RSS feeds (`config/rss-feeds.md`)
- CoinGecko market snapshots (`config/watchlist.json`)
- FRED macro series context
- Optional Markdown skills (`skills/**/*.md`) with deterministic binding handlers

## Install

```bash
bun install
```

## Runtime Files

- `config/rss-feeds.md`: feed catalog (Markdown table contract)
- `config/watchlist.json`: watchlist instruments (V1 starts with CoinGecko crypto ids)
- `skills/**/*.md`: optional skill files (YAML front matter + required sections)
- `reports/*.md`: generated reports
- `logs/runs.jsonl`: append-only run history

## Commands

Validate config + skills:

```bash
bun run dev -- config validate
```

Run one review immediately:

```bash
bun run dev -- review run
```

Run one scheduled tick locally (useful for testing):

```bash
bun run dev -- scheduler start --time 08:15 --once
```

Start the scheduler loop:

```bash
bun run dev -- scheduler start --time 08:15
```

## Environment Variables

Common:

```dotenv
REPORTS_DIR=reports
RUN_LOG_PATH=logs/runs.jsonl
FRED_API_KEY=...
```

Optional:

```dotenv
COINGECKO_API_KEY=...
LLM_API_KEY=...
LLM_BASE_URL=...
LLM_MODEL=...
```

If LLM-backed skills fail, the app writes an `incomplete` report and logs `partial_success`.

## Tests

```bash
bun run test:unit
bun run test:functional
bun run test:coverage
```
