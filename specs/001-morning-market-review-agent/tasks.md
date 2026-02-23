---

description: "Task list for Morning Market Review Agent (V1)"

---

# Tasks: Morning Market Review Agent (V1)

**Input**: Design documents from `/specs/001-morning-market-review-agent/`
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/`

**Tests**: Tests are mandatory for this feature (constitution + spec require TDD). Write tests first, ensure they fail, then implement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (`[US1]`, `[US2]`, `[US3]`, `[US4]`)
- Every task includes exact file path(s)

## Path Conventions

- Single Bun/TypeScript project at repository root
- Source code in `src/`
- Tests in `tests/`
- Runtime config/data in `config/`, `skills/`, `reports/`, `logs/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the Bun/TypeScript project for TDD implementation with Vitest and planned directory structure.

- [x] T001 Update Bun scripts and test commands in `package.json` for `dev`, `build`, `test`, `test:unit`, `test:functional`, and `test:coverage`
- [x] T002 Add Vitest coverage configuration in `vitest.config.ts`
- [x] T003 [P] Create runtime directories with tracked placeholders in `config/.gitkeep`, `skills/sentiment/.gitkeep`, `skills/outlook/.gitkeep`, `skills/positioning/.gitkeep`, `reports/.gitkeep`, and `logs/.gitkeep`
- [x] T004 [P] Create test directory placeholders in `tests/unit/.gitkeep`, `tests/functional/.gitkeep`, `tests/fixtures/rss/.gitkeep`, `tests/fixtures/coingecko/.gitkeep`, `tests/fixtures/fred/.gitkeep`, `tests/fixtures/skills/.gitkeep`, and `tests/helpers/.gitkeep`
- [x] T005 [P] Create local workspace helper for filesystem-based tests in `tests/helpers/temp-workspace.ts`
- [x] T006 [P] Create starter fixture files in `tests/fixtures/rss/sample-feed.xml`, `tests/fixtures/coingecko/simple-price.json`, `tests/fixtures/fred/series-observations.json`, and `tests/fixtures/skills/valid-skill.md`
- [x] T007 Replace Bun hello-world entry with CLI bootstrap in `src/index.ts`
- [x] T008 [P] Create local config templates in `config/rss-feeds.md` and `config/watchlist.json` (contract-valid examples, no personal feed list)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core shared infrastructure that all user stories depend on.

**⚠️ CRITICAL**: Complete this phase before starting any user story implementation.

### Tests for Foundational Infrastructure (TDD First)

- [x] T009 [P] Add filename format tests for `YYYY-MM-DD-hh-mm_market-report.md` in `tests/unit/report/file-naming.spec.ts`
- [x] T010 [P] Add local-time utility tests (local date labels and zero-padded time) in `tests/unit/shared/time.spec.ts`
- [x] T011 [P] Add environment and path resolution tests in `tests/unit/config/env-paths.spec.ts`
- [x] T012 [P] Add append-only JSONL run-log tests in `tests/unit/runtime/run-log.spec.ts`

### Implementation for Foundational Infrastructure

- [x] T013 Create shared domain types and enums in `src/shared/types.ts`
- [x] T014 [P] Create shared error classes in `src/shared/errors.ts`
- [x] T015 [P] Create shared validation helpers in `src/shared/validation.ts`
- [x] T016 Implement local-time formatting helpers in `src/shared/time.ts`
- [x] T017 Implement runtime path configuration in `src/config/paths.ts`
- [x] T018 Implement environment parsing and validation in `src/config/env.ts`
- [x] T019 Implement report filename generation and validation in `src/report/file-naming.ts`
- [x] T020 Implement report model types and constructors in `src/report/report-model.ts`
- [x] T021 Implement append-only JSONL run logging in `src/runtime/run-log.ts`
- [x] T022 Implement app context assembly (env + paths + clock utilities) in `src/runtime/app-context.ts`
- [x] T023 Implement CLI command dispatch and argument parsing in `src/cli/main.ts`
- [x] T024 Implement base `config validate` command wiring in `src/cli/commands/validate-config.ts`

**Checkpoint**: Foundation ready for user story implementation.

---

## Phase 3: User Story 1 - Generate Daily Market Review (Priority: P1) 🎯 MVP

**Goal**: Generate one Markdown morning market review locally from RSS feeds + CoinGecko crypto data + FRED macro indicator context, with all required sections and validated outlook constraints.

**Independent Test**: Run `review run` with fixture-backed RSS/catalog/watchlist inputs plus FRED macro fixtures and verify one Markdown report is written with required section headings, constrained probabilistic outlook totals, macro-context-driven regime output, and a run-log entry.

### Tests for User Story 1 (Write First) ⚠️

- [x] T025 [P] [US1] Add RSS feed catalog Markdown parsing/validation tests (including `default_lookback_hours` parsing and precedence rules) in `tests/unit/config/feed-catalog.spec.ts`
- [x] T026 [P] [US1] Add watchlist file parsing/validation tests in `tests/unit/config/watchlist.spec.ts`
- [x] T027 [P] [US1] Add RSS XML normalization tests in `tests/unit/ingest/rss-parse.spec.ts`
- [x] T028 [P] [US1] Add news deduplication fingerprint tests in `tests/unit/ingest/deduplicate-news.spec.ts`
- [x] T029 [P] [US1] Add CoinGecko and FRED response parsing/mapping tests in `tests/unit/market/coingecko-client.spec.ts` and `tests/unit/market/fred-client.spec.ts`
- [x] T030 [P] [US1] Add crypto snapshot and macro-series aggregation tests in `tests/unit/market/snapshot-service.spec.ts` and `tests/unit/market/macro-series-service.spec.ts`
- [x] T031 [P] [US1] Add regime detection classification tests with macro-context inputs in `tests/unit/analysis/regime-detector.spec.ts`
- [x] T032 [P] [US1] Add probabilistic outlook constraint tests (sum=100, cap<=70) in `tests/unit/analysis/outlook-service.spec.ts`
- [x] T033 [P] [US1] Add risk/invalidation block generation tests in `tests/unit/analysis/risk-invalidation.spec.ts`
- [x] T034 [P] [US1] Add deterministic baseline sentiment output tests in `tests/unit/analysis/sentiment-service.spec.ts`
- [x] T035 [P] [US1] Add deterministic baseline position wording structure tests in `tests/unit/analysis/position-wording.spec.ts`
- [x] T036 [P] [US1] Add Markdown report renderer section-order and metadata tests in `tests/unit/report/markdown-renderer.spec.ts`
- [x] T037 [US1] Add end-to-end manual review generation functional test (including FRED macro context ingestion) in `tests/functional/review-run.spec.ts`

### Implementation for User Story 1

- [x] T038 [P] [US1] Implement RSS feed catalog parser for Markdown table contract with `default_lookback_hours` support and precedence handling in `src/config/feed-catalog.ts`
- [x] T039 [P] [US1] Implement watchlist parser/validator for market snapshot instruments in `src/config/watchlist.ts`
- [x] T040 [P] [US1] Implement RSS HTTP fetcher with lookback filtering inputs in `src/ingest/rss-fetch.ts`
- [x] T041 [P] [US1] Implement RSS/Atom entry normalization in `src/ingest/rss-parse.ts`
- [x] T042 [P] [US1] Implement article deduplication by fingerprint in `src/ingest/deduplicate-news.ts`
- [x] T043 [P] [US1] Implement CoinGecko API client for current price/24h/7d/volume data in `src/market/coingecko-client.ts`
- [x] T044 [P] [US1] Implement FRED API client for CPI/PCE/unemployment/M2 observations in `src/market/fred-client.ts`
- [x] T045 [US1] Implement provider registry plus crypto snapshot and macro-series services in `src/market/provider-registry.ts`, `src/market/snapshot-service.ts`, and `src/market/macro-series-service.ts`
- [x] T046 [P] [US1] Implement regime classification logic using FRED-backed macro context in `src/analysis/regime-detector.ts`
- [x] T047 [P] [US1] Implement probabilistic outlook generation and constraint normalization in `src/analysis/outlook-service.ts`
- [x] T048 [P] [US1] Implement risk/invalidation section builder in `src/analysis/risk-invalidation.ts`
- [x] T049 [P] [US1] Implement deterministic baseline sentiment scoring service in `src/analysis/sentiment-service.ts`
- [x] T050 [P] [US1] Implement deterministic baseline position wording builder in `src/analysis/position-wording.ts`
- [x] T051 [US1] Implement Markdown rendering for required sections and metadata in `src/report/markdown-renderer.ts`
- [x] T052 [US1] Implement report file writer and run-report persistence in `src/report/report-writer.ts`
- [x] T053 [US1] Implement `review run` command orchestration (manual trigger) in `src/cli/commands/run-review.ts`
- [x] T054 [US1] Extend `config validate` command to validate `config/rss-feeds.md` (including lookback config) and `config/watchlist.json` in `src/cli/commands/validate-config.ts`

**Checkpoint**: User Story 1 should produce a usable local Markdown market report (MVP).

---

## Phase 4: User Story 2 - Run Automatically Every Morning (Priority: P2)

**Goal**: Add local scheduled daily execution with duplicate-run protection and scheduler logging using the local system timezone.

**Independent Test**: Configure a short interval/time in a functional test, trigger overlapping scheduler invocations, and verify only one run executes while duplicate attempts are logged as skipped.

### Tests for User Story 2 (Write First) ⚠️

- [x] T055 [P] [US2] Add duplicate-run lock acquisition/release tests in `tests/unit/runtime/run-lock.spec.ts`
- [x] T056 [P] [US2] Add scheduler local-time slot evaluation tests in `tests/unit/runtime/scheduler.spec.ts`
- [x] T057 [US2] Add scheduler duplicate-guard functional test in `tests/functional/scheduler-duplicate-guard.spec.ts`

### Implementation for User Story 2

- [x] T058 [US2] Implement filesystem-based duplicate-run lock management in `src/runtime/run-lock.ts`
- [x] T059 [US2] Implement local-timezone scheduler loop and trigger execution in `src/runtime/scheduler.ts`
- [x] T060 [US2] Implement `scheduler start` command and schedule override parsing in `src/cli/commands/run-scheduler.ts`
- [x] T061 [US2] Extend `review run` trigger handling for `manual|scheduled` and duplicate window semantics in `src/cli/commands/run-review.ts`
- [x] T062 [US2] Add duplicate skip logging fields and messages for scheduler attempts in `src/runtime/run-log.ts`

**Checkpoint**: Scheduler can run daily and prevent duplicate executions reliably.

---

## Phase 5: User Story 3 - Build Usable Historical Record (Priority: P3)

**Goal**: Ensure reports and run logs form a consistent, analyzable local history across repeated runs and partial/failure scenarios.

**Independent Test**: Generate multiple runs (including at least one partial/failure path) and verify consistent report filenames/metadata, no overwrite of prior reports, and append-only JSONL log history.

### Tests for User Story 3 (Write First) ⚠️

- [x] T063 [P] [US3] Add report writer no-overwrite and collision handling tests in `tests/unit/report/report-writer.spec.ts`
- [x] T064 [P] [US3] Add run-log history append/read consistency tests in `tests/unit/runtime/run-log-history.spec.ts`
- [x] T065 [US3] Add 30-run history persistence functional test (sequential local-date simulations) in `tests/functional/history-persistence.spec.ts`
- [x] T066 [US3] Add partial/failure log preservation functional test in `tests/functional/history-failure-preservation.spec.ts`

### Implementation for User Story 3

- [x] T067 [US3] Enhance report writer to prevent overwriting existing report files and preserve metadata consistency in `src/report/report-writer.ts`
- [x] T068 [US3] Add run-log history reading/query helpers for functional validation in `src/runtime/run-log.ts`
- [x] T069 [US3] Add explicit report status metadata rendering (`complete|incomplete`) and omission reason output in `src/report/markdown-renderer.ts`
- [x] T070 [US3] Extend `review run` lifecycle status transitions (`success|partial_success|failed`) in `src/cli/commands/run-review.ts`
- [x] T071 [US3] Add local-date labeling helpers used by report organization/history checks in `src/shared/time.ts`

**Checkpoint**: Historical reports and run logs are stable and analyzable over time.

---

## Phase 6: User Story 4 - Actionable Position Wording (Priority: P4)

**Goal**: Introduce the Markdown+YAML skill system and deterministic binding runtime for LLM-assisted sentiment and position wording, while preserving structural constraints and incomplete-report behavior on LLM failure.

**Independent Test**: Validate skill loading/validation, run a review with valid skills to produce structured non-emotional position wording, and verify incomplete report behavior when LLM binding fails or times out.

### Tests for User Story 4 (Write First) ⚠️

- [x] T072 [P] [US4] Add skill file YAML front matter and required-section parsing tests in `tests/unit/skills/skill-parser.spec.ts`
- [x] T073 [P] [US4] Add skill loader duplicate-id and unknown-binding validation tests in `tests/unit/skills/skill-loader.spec.ts`
- [x] T074 [P] [US4] Add binding registry dispatch and deterministic outlook-validation binding tests in `tests/unit/skills/binding-registry.spec.ts` and `tests/unit/skills/bindings/deterministic-outlook-validation.spec.ts`
- [x] T075 [P] [US4] Add LLM-assisted sentiment constraint enforcement tests in `tests/unit/analysis/sentiment-service.llm.spec.ts`
- [x] T076 [P] [US4] Add LLM-assisted position wording structure/non-emotional rule tests in `tests/unit/analysis/position-wording.llm.spec.ts`
- [x] T077 [US4] Add incomplete-report-on-LLM-failure functional test in `tests/functional/incomplete-report-llm-failure.spec.ts`
- [x] T078 [US4] Add config validation tests for `skills/**/*.md` contract files in `tests/functional/skill-config-validate.spec.ts`

### Implementation for User Story 4

- [x] T079 [P] [US4] Implement Markdown+YAML skill parser in `src/skills/skill-parser.ts`
- [x] T080 [P] [US4] Implement recursive skill loader and validation in `src/skills/skill-loader.ts`
- [x] T081 [P] [US4] Implement deterministic binding registry and deterministic outlook-validation binding handler in `src/skills/binding-registry.ts` and `src/skills/bindings/deterministic-outlook-validation.ts`
- [x] T082 [P] [US4] Implement deterministic report-format binding helper in `src/skills/bindings/deterministic-report-format.ts`
- [x] T083 [P] [US4] Implement LLM sentiment binding handler in `src/skills/bindings/llm-sentiment.ts`
- [x] T084 [P] [US4] Implement LLM position-wording binding handler in `src/skills/bindings/llm-position-wording.ts`
- [x] T085 [US4] Upgrade sentiment service to use skill metadata + binding execution with LLM failure omission handling in `src/analysis/sentiment-service.ts`
- [x] T086 [US4] Upgrade position wording service to use skill metadata + binding execution with structured output enforcement in `src/analysis/position-wording.ts`
- [x] T087 [US4] Integrate skill loading/exposure and binding execution into `review run` orchestration in `src/cli/commands/run-review.ts`
- [x] T088 [US4] Extend `config validate` to validate `skills/**/*.md` against the skill contract in `src/cli/commands/validate-config.ts`
- [x] T089 [US4] Render omitted LLM-dependent sections with explicit reasons in incomplete reports in `src/report/markdown-renderer.ts`
- [x] T090 [P] [US4] Add default sentiment skill file in `skills/sentiment/sentiment-news-price-coherence-v1.md`
- [x] T091 [P] [US4] Add default outlook validation skill file in `skills/outlook/outlook-validation-v1.md`
- [x] T092 [P] [US4] Add default position wording skill file in `skills/positioning/position-wording-v1.md`

**Checkpoint**: Skills are loaded from Markdown files, descriptions are exposed to the agent/runtime, and LLM-assisted outputs remain deterministic at the binding boundary.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, documentation sync, and coverage/performance checks across completed stories.

- [x] T093 [P] Add CLI quickstart and runtime configuration usage notes in `README.md`
- [x] T094 [P] Add additional edge-case tests for malformed RSS entries and missing CoinGecko/FRED fields in `tests/unit/ingest/rss-parse.edge.spec.ts`, `tests/unit/market/coingecko-client.edge.spec.ts`, and `tests/unit/market/fred-client.edge.spec.ts`
- [x] T095 Enforce coverage thresholds (`>=75%`, target `80%`) in `vitest.config.ts` and `package.json`
- [x] T096 Add fixture-backed manual review performance budget test (<=60s target proxy) in `tests/functional/review-run-performance.spec.ts`
- [x] T097 Validate report output contract (section order + filename regex + readability proxy <=1,200 words) against generated reports in `tests/functional/report-output-contract.spec.ts`
- [x] T098 [P] Remove dead code and simplify duplicated logic across `src/analysis/`, `src/report/`, and `src/runtime/`
- [x] T099 Run quickstart verification and update command examples in `specs/001-morning-market-review-agent/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories
- **Phase 3 (US1 / MVP)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 2 and reuses `review run` command from US1 for scheduled execution
- **Phase 5 (US3)**: Depends on Phase 2 and builds on report/log persistence introduced in US1
- **Phase 6 (US4)**: Depends on Phase 2 and extends US1 analysis/report pipeline with skills + LLM-assisted bindings
- **Phase 7 (Polish)**: Depends on all selected user stories

### User Story Dependencies

- **US1 (P1)**: No user-story dependency after Foundation; this is the MVP slice
- **US2 (P2)**: Independent business value after Foundation, but operationally reuses US1 `review run` execution path
- **US3 (P3)**: Independent validation focus on historical persistence, but relies on US1 baseline report/log generation
- **US4 (P4)**: Depends on US1 analysis/report pipeline and upgrades sentiment/position wording with skill runtime + LLM bindings

### Within Each User Story

- Write tests first and confirm they fail before implementation
- Implement parsing/models/helpers before orchestration commands
- Implement core services before end-to-end/functional wiring
- Re-run unit + functional tests for the story before moving on

### Parallel Opportunities

- Setup tasks marked `[P]` can run in parallel after `T001-T002`
- Foundational unit tests `T009-T012` can be written in parallel
- Many US1 service/module tasks (`T038-T044`, `T046-T050`) can be implemented in parallel after test files exist
- US2 unit tests and scheduler command implementation can be split after `T058-T059`
- US4 parser/loader/bindings and default skill files (`T079-T084`, `T090-T092`) have strong parallelism

---

## Parallel Example: User Story 1

```bash
# Parallel test authoring (US1)
Task: "T025 [US1] Add RSS feed catalog Markdown parsing/validation tests in tests/unit/config/feed-catalog.spec.ts"
Task: "T026 [US1] Add watchlist file parsing/validation tests in tests/unit/config/watchlist.spec.ts"
Task: "T027 [US1] Add RSS XML normalization tests in tests/unit/ingest/rss-parse.spec.ts"
Task: "T029 [US1] Add CoinGecko response parsing/mapping tests in tests/unit/market/coingecko-client.spec.ts"

# Parallel implementation after tests exist (US1)
Task: "T038 [US1] Implement RSS feed catalog parser in src/config/feed-catalog.ts"
Task: "T039 [US1] Implement watchlist parser in src/config/watchlist.ts"
Task: "T041 [US1] Implement RSS normalization in src/ingest/rss-parse.ts"
Task: "T043 [US1] Implement CoinGecko client in src/market/coingecko-client.ts"
```

---

## Parallel Example: User Story 2

```bash
# Parallel test authoring (US2)
Task: "T055 [US2] Add duplicate-run lock tests in tests/unit/runtime/run-lock.spec.ts"
Task: "T056 [US2] Add scheduler local-time slot tests in tests/unit/runtime/scheduler.spec.ts"

# Parallel implementation split (US2)
Task: "T058 [US2] Implement filesystem duplicate-run lock in src/runtime/run-lock.ts"
Task: "T060 [US2] Implement scheduler CLI command in src/cli/commands/run-scheduler.ts"
```

---

## Parallel Example: User Story 3

```bash
# Parallel test authoring (US3)
Task: "T063 [US3] Add report writer no-overwrite tests in tests/unit/report/report-writer.spec.ts"
Task: "T064 [US3] Add run-log history consistency tests in tests/unit/runtime/run-log-history.spec.ts"

# Parallel implementation split (US3)
Task: "T067 [US3] Enhance report writer in src/report/report-writer.ts"
Task: "T068 [US3] Add run-log history helpers in src/runtime/run-log.ts"
```

---

## Parallel Example: User Story 4

```bash
# Parallel test authoring (US4)
Task: "T072 [US4] Add skill parser tests in tests/unit/skills/skill-parser.spec.ts"
Task: "T073 [US4] Add skill loader tests in tests/unit/skills/skill-loader.spec.ts"
Task: "T074 [US4] Add binding registry tests in tests/unit/skills/binding-registry.spec.ts"

# Parallel implementation after tests exist (US4)
Task: "T079 [US4] Implement skill parser in src/skills/skill-parser.ts"
Task: "T080 [US4] Implement skill loader in src/skills/skill-loader.ts"
Task: "T081 [US4] Implement binding registry in src/skills/binding-registry.ts"
Task: "T090 [US4] Add default sentiment skill file in skills/sentiment/sentiment-news-price-coherence-v1.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational)
3. Complete Phase 3 (US1 / MVP report generation)
4. Validate US1 independently with `tests/functional/review-run.spec.ts`
5. Stop and review output quality before adding scheduler/history/skills

### Incremental Delivery

1. Foundation -> stable CLI/test infrastructure
2. US1 -> manual daily review generation (MVP)
3. US2 -> automated morning scheduler + duplicate protection
4. US3 -> reliable historical record and no-overwrite persistence
5. US4 -> skill runtime + LLM-assisted sentiment/position wording
6. Polish -> coverage, edge cases, quickstart verification

### Suggested MVP Scope

- **Implement through Phase 3 (US1) only** for the first shippable personal MVP
- Add US2/US3 next for daily operational reliability
- Add US4 once the deterministic pipeline is stable and test coverage is already healthy

---

## Notes

- The spec and constitution require TDD; do not skip test-first ordering
- Keep implementation simple and explicit (no premature abstractions)
- Use real fixtures and deterministic validations; avoid mock-heavy test design
- Maintain English-only code/comments/docs/output strings
- Preserve report filename format exactly: `YYYY-MM-DD-hh-mm_market-report.md`
