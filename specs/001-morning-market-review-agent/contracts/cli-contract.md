# CLI Contract - Morning Market Review Agent (V1)

## Scope

Local CLI commands for manual execution, scheduler runtime, and configuration validation.

## Entry Point

- Planned executable entry: `bun src/index.ts` (dev) and compiled entry for production/local script later
- Root command namespace: `market-review` (logical name; implementation may expose direct subcommands)

## Commands

### `review run`

Runs one market review generation immediately.

Inputs:
- `--trigger <manual|scheduled>` (optional, default `manual`)
- `--date <YYYY-MM-DD>` (optional test/debug override; implementation may restrict in V1)

Behavior:
- Loads config (`rss-feeds.md`, `watchlist.json`, env)
- Loads skills
- Executes deterministic pipeline + bound LLM skills
- Writes report markdown and JSONL run log entry

Exit codes:
- `0`: success (complete or partial/incomplete report written)
- `1`: fatal error (no report written)
- `2`: config validation error

### `scheduler start`

Starts the local scheduler loop.

Inputs:
- `--time <HH:mm>` (optional override; otherwise config/env)

Behavior:
- Schedules daily execution using local system timezone
- Applies duplicate-run guard
- Logs each trigger attempt

Exit codes:
- `0`: scheduler started
- `1`: fatal startup error

### `config validate`

Validates runtime configuration and file contracts.

Validates:
- `.env` required keys (for enabled features)
- `config/rss-feeds.md` contract
- `config/watchlist.json` structure
- `skills/**/*.md` format contract

Exit codes:
- `0`: valid
- `2`: validation error

## Stability Rules (V1)

- Command names and required output contracts are considered stable for V1 implementation work.
- New flags may be added if they do not break existing command behavior.
