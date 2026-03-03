# Phase 0 Research - Morning Market Review Agent (V1)

Date: 2026-02-23  
Branch: `001-morning-market-review-agent`

## Decision 1: Runtime and Build Tooling

- **Decision**: Use Bun + TypeScript (ESM) as the only runtime/tooling target for V1.
- **Rationale**: Matches user constraint, keeps local setup simple, and avoids dual-runtime drift (`node` vs `bun`) during MVP development.
- **Alternatives considered**:
  - Node.js + tsx: compatible but adds runtime split and reduces clarity for a Bun-first project.
  - Bun + Node compatibility mode in parallel: unnecessary complexity for V1.

## Decision 2: Test Strategy and Coverage Enforcement

- **Decision**: Use Vitest for both unit and functional tests with V8 coverage (`>=75%` minimum, `80%` target).
- **Rationale**: Vitest is fast, works well in TypeScript projects, supports functional test organization, and can enforce coverage gates consistently.
- **Alternatives considered**:
  - Bun test only: simpler runtime alignment, but weaker ecosystem and less familiar coverage workflows for the requested setup.
  - Jest: heavier setup and slower feedback loop for a Bun/TypeScript MVP.

## Decision 3: External Dependency Testing Policy

- **Decision**: Prefer deterministic tests with real captured fixtures (RSS XML, CoinGecko JSON, FRED JSON, skill files) plus selective live integration checks; avoid synthetic mocks unless unavoidable and documented.
- **Rationale**: Aligns with the constitution's "real tests" rule while preserving deterministic CI/local runs and avoiding flaky network dependence in most tests.
- **Alternatives considered**:
  - Live-only tests for everything: too flaky and slow due to rate limits/network variability.
  - Mock-heavy HTTP tests: conflicts with constitution and reduces behavioral confidence.

## Decision 4: Market Data Provider (Initial Implementation)

- **Decision**: Use a fixed V1 provider mapping with CoinGecko for crypto market snapshot instruments and FRED for macro indicator context (CPI, PCE, unemployment, M2), behind a minimal provider registry interface.
- **Rationale**: Resolves spec/plan coverage for macro context while staying simple and deterministic. CoinGecko remains the primary market snapshot provider, and FRED adds a small, explicit macro series set for regime inputs.
- **Alternatives considered**:
  - Full multi-provider implementation immediately: better spec coverage but too much V1 complexity.
  - Direct CoinGecko + FRED calls without registry: simpler short-term, but makes future expansion harder and increases refactor cost.

## Decision 5: RSS Feed Catalog Source Format

- **Decision**: Store feed addresses in a user-maintained Markdown catalog file (`config/rss-feeds.md`) with category organization and a strict Markdown table contract.
- **Rationale**: Matches user workflow (feeds provided in Markdown with categories), remains readable/editable, and is deterministic to parse with a narrow contract.
- **Alternatives considered**:
  - JSON/YAML-only config: easier parsing but does not match the requested user-maintained Markdown input.
  - Free-form Markdown sections without contract: too ambiguous for reliable parsing/tests.

## Decision 6: Skill File Format

- **Decision**: Skill definitions are Markdown files with required YAML front matter and required sections: Description, Input, Output, Usage Rules.
- **Rationale**: Matches user requirement and keeps skills readable, versionable, and testable as plain text artifacts.
- **Alternatives considered**:
  - JSON-only skill schema: easier parsing but less author-friendly and not requested.
  - Markdown body only without YAML: weak metadata validation and unreliable binding/type resolution.

## Decision 7: Skill Runtime Execution Model

- **Decision**: Runtime loads skill metadata/body, exposes skill descriptions to the agent layer, and executes only deterministic binding handlers selected by `binding.type`.
- **Rationale**: Preserves control and determinism; prevents arbitrary execution from skill files while still enabling LLM-assisted or deterministic behaviors via bound handlers.
- **Alternatives considered**:
  - Executable scripts embedded in skill files: higher risk, harder to validate/test.
  - Fully dynamic plugin loading: overkill for a personal MVP.

## Decision 8: LLM Integration Boundary

- **Decision**: Use LLM assistance only through explicit bindings for sentiment and position wording; enforce output structure and constraints in program logic; on failure, write an incomplete report and log the reason.
- **Rationale**: Matches clarified spec behavior and keeps business rules deterministic (percent totals, caps, required sections).
- **Alternatives considered**:
  - LLM as primary orchestrator: too opaque and harder to test.
  - Rule-based wording only: simpler, but user explicitly requested LLM-assisted generation.

## Decision 9: Storage and File Naming

- **Decision**: Filesystem-only storage with append-only JSONL run logs and Markdown reports named `YYYY-MM-DD-hh-mm_market-report.md`.
- **Rationale**: Transparent local operation, easy debugging, easy backup/history review, consistent with MVP simplicity.
- **Alternatives considered**:
  - SQLite for logs/history: more query power but unnecessary complexity in V1.
  - Timestamp-only filenames without fixed format: harder manual scanning and validation.

## Decision 10: Readability and Performance Validation Proxies

- **Decision**: Validate non-functional goals with explicit testable proxies: report word-count budget for readability and fixture-backed runtime duration checks for performance.
- **Rationale**: Converts soft goals into executable tasks without overfitting to unstable live-network timings.
- **Alternatives considered**:
  - Manual-only review of readability/performance: too easy to regress.
  - Strict live-network SLA tests: too flaky for local MVP development.

## Decision 11: CLI Surface for V1

- **Decision**: Expose a small CLI with commands for manual review run, scheduler start, and config validation.
- **Rationale**: Supports local use, testing, and automation without introducing a UI/dashboard.
- **Alternatives considered**:
  - Scheduler-only daemon without CLI: harder to test and debug.
  - Full TUI/dashboard: outside V1 scope.
