# Implementation Plan: Morning Market Review Agent (V1)

**Branch**: `001-morning-market-review-agent` | **Date**: 2026-02-23 | **Spec**: `/Users/0xfazio/Repositories/market-monitor/specs/001-morning-market-review-agent/spec.md`
**Input**: Feature specification from `/specs/001-morning-market-review-agent/spec.md` plus user plan constraints (TypeScript/Bun, Vitest, CoinGecko start, Markdown+YAML skills, deterministic bindings, Markdown report filename convention).

## Summary

Build a local Bun/TypeScript CLI + scheduler agent that generates a daily Markdown market review by combining RSS ingestion, CoinGecko crypto market snapshots, FRED macro indicator context (CPI/PCE/unemployment/M2), deterministic analysis pipeline, and LLM-assisted narrative generation.

The implementation will use filesystem-only persistence (`.md` reports + `.jsonl` run logs), a Markdown feed catalog grouped by category, and a Markdown skill system with YAML front matter. Skills are loaded at runtime, exposed to the agent via metadata/description, and executed through deterministic binding handlers (program logic controls execution and constraints).

## Technical Context

**Language/Version**: TypeScript 5.x on Bun 1.x (ESM)  
**Primary Dependencies**: Bun runtime APIs (`fetch`, file I/O), `zod`, `node-cron`, `dotenv`, `fast-xml-parser` (RSS parsing), `gray-matter` (Markdown + YAML front matter parsing), `vitest`, `@vitest/coverage-v8`, external HTTP APIs (CoinGecko + FRED)  
**Storage**: Filesystem only (`config/*.md`, `skills/**/*.md`, `reports/*.md`, `logs/*.jsonl`)  
**Testing**: Vitest for unit + functional tests, V8 coverage, TDD workflow, no mocks by default (real fixtures and live integration checks where appropriate)  
**Target Platform**: Local macOS/Linux shell environment running Bun CLI (single user)  
**Project Type**: Local CLI application with scheduled background execution behavior  
**Performance Goals**: Manual run completes in <=60s for ~20 RSS feeds, <=15 CoinGecko symbols, and 4 FRED macro series on normal network; duplicate-run guard is deterministic; report output remains readable in 3-5 minutes (validated with a word-count proxy and renderer budget tests)  
**Constraints**: Local system timezone only; filesystem persistence only; fixed V1 provider mapping uses CoinGecko (crypto snapshot) + FRED (macro CPI/PCE/unemployment/M2); LLM failures produce incomplete reports (not fabricated fallback); output filename format `YYYY-MM-DD-hh-mm_market-report.md`; English-only docs/code/comments/text  
**Scale/Scope**: 1 personal user; 1 scheduled run/day + manual reruns; ~10-50 RSS feeds; ~5-20 instruments initially; hundreds of report files/year

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Gate Review

- `PASS` Simplicity-first: single Bun project, filesystem storage, no database, no dashboard.
- `PASS` Clarity-first: explicit contracts for feed catalog, skill format, report output, and CLI commands.
- `PASS` TDD required: implementation plan assumes Vitest unit + functional tests written first for each module.
- `PASS` Real tests only: plan avoids synthetic mocks; uses real sample fixtures and live integration validation for external dependencies where feasible.
- `PASS` Coverage gate: plan enforces `>=75%` coverage minimum, target `>=80%`.
- `PASS` English-only requirement: all generated docs in this plan are in English.

### Post-Phase 1 Re-Check (Design Artifacts)

- `PASS` Design artifacts keep deterministic boundaries (skills -> bindings, LLM output constrained by program logic).
- `PASS` No unjustified complexity introduced (provider registry remains minimal; fixed CoinGecko + FRED mapping).
- `PASS` Data model and contracts remain compatible with incremental implementation and TDD.

## Project Structure

### Documentation (this feature)

```text
specs/001-morning-market-review-agent/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli-contract.md
│   ├── rss-feed-catalog-format.md
│   ├── skill-file-format.md
│   └── report-output-format.md
└── tasks.md
```

### Source Code (repository root)

```text
config/
├── rss-feeds.md                 # User-provided feed catalog (Markdown with categories)
└── watchlist.json               # V1 crypto market snapshot instrument list (CoinGecko-supported ids/symbols)

skills/
├── sentiment/
│   └── *.md                     # Markdown skill files with YAML front matter
├── outlook/
│   └── *.md
└── positioning/
    └── *.md

reports/
└── YYYY-MM-DD-hh-mm_market-report.md

logs/
└── runs.jsonl

src/
├── index.ts
├── cli/
│   ├── main.ts
│   └── commands/
│       ├── run-review.ts
│       ├── run-scheduler.ts
│       └── validate-config.ts
├── config/
│   ├── env.ts
│   ├── feed-catalog.ts
│   ├── watchlist.ts
│   └── paths.ts
├── runtime/
│   ├── app-context.ts
│   ├── scheduler.ts
│   ├── run-lock.ts
│   └── run-log.ts
├── ingest/
│   ├── rss-fetch.ts
│   ├── rss-parse.ts
│   └── deduplicate-news.ts
├── market/
│   ├── provider-registry.ts
│   ├── coingecko-client.ts
│   ├── fred-client.ts
│   ├── macro-series-service.ts
│   └── snapshot-service.ts
├── analysis/
│   ├── regime-detector.ts
│   ├── sentiment-service.ts
│   ├── outlook-service.ts
│   ├── risk-invalidation.ts
│   └── position-wording.ts
├── skills/
│   ├── skill-loader.ts
│   ├── skill-parser.ts
│   ├── binding-registry.ts
│   └── bindings/
│       ├── deterministic-outlook-validation.ts
│       ├── llm-sentiment.ts
│       ├── llm-position-wording.ts
│       └── deterministic-report-format.ts
├── report/
│   ├── report-model.ts
│   ├── markdown-renderer.ts
│   ├── file-naming.ts
│   └── report-writer.ts
└── shared/
    ├── types.ts
    ├── errors.ts
    ├── time.ts
    └── validation.ts

tests/
├── unit/
│   ├── ingest/
│   ├── market/
│   ├── analysis/
│   ├── report/
│   └── skills/
├── functional/
│   ├── review-run.spec.ts
│   ├── scheduler-duplicate-guard.spec.ts
│   └── incomplete-report-llm-failure.spec.ts
├── fixtures/
│   ├── rss/
│   ├── coingecko/
│   ├── fred/
│   └── skills/
└── helpers/
    └── temp-workspace.ts
```

**Structure Decision**: Single Bun/TypeScript project with filesystem-first runtime. Separate modules by responsibility (ingest, market, analysis, skills, report, runtime) to preserve clarity and testability. `skills/`, `config/`, `reports/`, and `logs/` are top-level runtime data directories to keep local operation transparent.

## Phase 0 Research Summary

Research decisions are recorded in `/Users/0xfazio/Repositories/market-monitor/specs/001-morning-market-review-agent/research.md`. Key outcomes:

- V1 market data provider mapping is fixed by asset class: CoinGecko for crypto market snapshots and FRED for macro indicator context (CPI/PCE/unemployment/M2), behind a minimal provider registry.
- Skill files are Markdown documents with YAML front matter + required Markdown sections; runtime execution is always routed through deterministic bindings.
- Feed catalog is a user-maintained Markdown file with category-based organization and strict parsing rules.
- Report storage and run logs remain filesystem-only with deterministic naming and JSONL append-only logs.

## Phase 1 Design Outputs

- `data-model.md`: Entity schema, validation rules, file-persistence mapping, and run/report lifecycle states
- `contracts/`: CLI and file format contracts (feeds, skills, report output)
- `quickstart.md`: Developer setup and local execution/testing workflow (Bun + Vitest)

## Phase 2 Implementation Strategy (Planning Only)

1. Foundation slice: types, path config, env loading, file naming, run log writer, run lock, CLI skeleton, Vitest setup.
2. Data ingestion slice: feed catalog parser, RSS fetch/parse, deduplication, CoinGecko client, FRED client, crypto snapshot + macro series services.
3. Analysis slice: regime detector with FRED macro context, probabilistic outlook constraints, risk/invalidation block, deterministic validation of totals and caps.
4. Skills + LLM slice: skill loader/parser, binding registry, deterministic outlook/report bindings, LLM-backed sentiment/position bindings, incomplete-report handling on failure.
5. Report + scheduler slice: Markdown renderer, report writer, scheduler, duplicate-run guard, end-to-end functional tests, readability/performance contract checks.

Each slice must follow TDD and maintain coverage threshold compliance throughout development.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitutional violations identified in the current plan.
