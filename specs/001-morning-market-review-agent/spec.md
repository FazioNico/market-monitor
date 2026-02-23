# Feature Specification: Morning Market Review Agent (V1)

**Feature Branch**: `001-morning-market-review-agent`  
**Created**: 2026-02-23  
**Status**: Draft  
**Input**: User description: "Local automated morning market review agent that generates a structured daily market report from RSS feeds and reliable market data."

## Clarifications

### Session 2026-02-23

- Q: What is the V1 market data provider strategy? → A: Fixed multi-provider by asset class (e.g., one provider for crypto, one for macro/indices/rates/commodities).
- Q: How should V1 generate narratives/sentiment wording and position wording? → A: LLM-assisted sentiment and wording (scores may use model output).
- Q: What should V1 do if the LLM call fails or times out during report generation? → A: Generate a partial report without sentiment/position sections and mark it incomplete.
- Q: Which timezone should define the daily schedule and report date in V1? → A: Local system timezone only.
- Q: What storage format should V1 use for report history and run logs? → A: Filesystem only: Markdown reports + JSONL run logs.
- Q: Which macro provider should V1 use for core macro indicators? → A: FRED API for CPI, PCE, unemployment, and M2 (in addition to CoinGecko for market data).

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Generate Daily Market Review (Priority: P1)

As the user, I want a single generated morning report in Markdown so I can review the market regime, sentiment, outlook, risks, and positioning guidance in 3 to 5 minutes.

**Why this priority**: This is the core product value. Without a reliable daily report, the product does not deliver the MVP outcome.

**Independent Test**: Can be fully tested by running one report generation with configured RSS feeds and watchlist inputs and verifying the Markdown output contains all required sections and constraints.

**Acceptance Scenarios**:

1. **Given** configured RSS feeds and a configured watchlist, **When** the user runs the morning review generation, **Then** the system produces one Markdown report containing market snapshot, regime detection, sentiment scoring, probabilistic outlook, risk/invalidation, and position wording sections.
2. **Given** recent articles exist in the last 24 hours, **When** the report is generated, **Then** the RSS section includes de-duplicated structured article entries with title, date, source, summary, and link.
3. **Given** market data is available for the configured watchlist, **When** the report is generated, **Then** each instrument includes current price and 24h/7d returns, and volume when relevant.
4. **Given** the probabilistic outlook is generated, **When** the report is finalized, **Then** bull/base/bear percentages sum to 100, no single scenario exceeds 70% in V1, and a narrative justification is included.

---

### User Story 2 - Run Automatically Every Morning (Priority: P2)

As the user, I want the report to run automatically at a configurable daily time so I do not need to manually trigger the workflow every day.

**Why this priority**: Automation is a stated primary objective and directly reduces operational friction for daily usage.

**Independent Test**: Can be tested independently by configuring a short test schedule, observing a scheduled run, and validating single-run protection and run logging behavior.

**Acceptance Scenarios**:

1. **Given** a configured daily execution time, **When** the scheduled time is reached, **Then** the system starts one report generation run automatically.
2. **Given** a run is already in progress or already completed for the protected run window, **When** another trigger occurs, **Then** the system prevents a duplicate execution and records the skipped attempt in logs.
3. **Given** a scheduled run completes, **When** the user checks run history/logs, **Then** the system records run timestamp, status, and output location.

---

### User Story 3 - Build Usable Historical Record (Priority: P3)

As the user, I want each daily report to be stored in a consistent format so I can review and analyze market assessments over time.

**Why this priority**: Historical continuity is a secondary objective and increases long-term value without expanding into a complex dashboard.

**Independent Test**: Can be tested independently by generating multiple runs and verifying reports are persisted with consistent structure and retrievable timestamps.

**Acceptance Scenarios**:

1. **Given** multiple successful runs across different days, **When** the user inspects stored reports, **Then** each report is preserved as Markdown with a consistent section structure and date-associated metadata.
2. **Given** a failed or partial run, **When** the system records the outcome, **Then** the run log indicates failure status and reason without overwriting a prior successful report.

---

### User Story 4 - Actionable Position Wording (Priority: P4)

As the user, I want non-emotional, structured positioning wording so I can quickly translate the analysis into a practical execution framework.

**Why this priority**: This section is a key product output, but it depends on the upstream data and analysis produced in P1.

**Independent Test**: Can be tested independently by validating the final report contains all required position wording fields and that wording remains structured and non-emotional.

**Acceptance Scenarios**:

1. **Given** a completed regime, sentiment, and outlook assessment, **When** the position wording section is generated, **Then** it includes current bias, add exposure conditions, reduce exposure conditions, no-trade zones, and time horizon.
2. **Given** conflicting signals or transition regime conditions, **When** the wording is generated, **Then** it remains explicit, non-emotional, and operationally clear rather than forcing certainty.

### Edge Cases

- No RSS articles are published within the lookback window (default 24h).
- The same article appears in multiple feeds with minor title variations or tracking parameters in URLs.
- A feed is reachable but returns malformed entries (missing publish date or link).
- Market data is available for some instruments but missing for others in the configured watchlist.
- Volume is not applicable or not provided for a tracked instrument.
- A scheduled run starts near a local system timezone date boundary and article filtering spans the wrong day if not normalized.
- The LLM call fails or times out during report generation after market/news data has already been collected.
- Regime signals are mixed and do not strongly support risk-on or risk-off.
- Sentiment inferred from news conflicts with price action direction.
- Calculated bull/base/bear percentages do not sum to 100 before normalization.
- A single scenario score exceeds the V1 cap (70%) and must be constrained/rebalanced.
- A run is triggered while another run is active.
- Output file path for the daily report already exists for the same run date.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST run locally and generate a daily market review report intended for a single personal user in V1.
- **FR-002**: System MUST output the generated report in Markdown format compatible with Obsidian-style note usage.
- **FR-003**: System MUST support automatic daily execution at a user-configurable time.
- **FR-003a**: In V1, the daily schedule MUST be evaluated using the local system timezone only (no user-configurable timezone setting).
- **FR-004**: System MUST include protection against duplicate execution for the same scheduled run window.
- **FR-005**: System MUST log each run attempt with timestamp, status, and outcome details.
- **FR-006**: System MUST allow configuration of a list of RSS feeds.
- **FR-007**: System MUST fetch recent RSS articles using a configurable lookback window, with a default of 24 hours.
- **FR-008**: System MUST de-duplicate articles across feeds before analysis/reporting.
- **FR-009**: System MUST extract and retain structured article fields: title, publish date, source, summary, and link.
- **FR-010**: System MUST support a configurable market watchlist that can include crypto, equity indices, FX/macro proxies, rates, and commodities.
- **FR-011**: System MUST retrieve market data from a deterministic and stable API provider set covering all configured instruments.
- **FR-011a**: V1 market data provider selection MUST use a fixed provider mapping by asset class (for example, one provider for crypto and one provider for macro/indices/rates/commodities), rather than user-configurable per-instrument providers.
- **FR-011b**: In V1, the implemented fixed provider mapping MUST include CoinGecko for crypto market snapshot instruments and FRED for core macro indicators (CPI, PCE, unemployment, M2) used in analysis context.
- **FR-012**: System MUST include for each watchlist instrument the current price, 24h return, and 7d return in the market snapshot.
- **FR-013**: System MUST include volume in the market snapshot when volume is relevant and available for an instrument.
- **FR-014**: System MUST classify the market regime as one of: Risk-on, Risk-off, or Transition.
- **FR-015**: Regime classification MUST be based on short-term momentum, return dispersion, simple correlations, and key macro indicators (including DXY and rates inputs when present in the watchlist/data set).
- **FR-015a**: V1 regime input MUST include a macro indicator context sourced from FRED for CPI, PCE, unemployment, and M2 (latest available observations).
- **FR-016**: System MUST produce a normalized sentiment score in the range -2 to +2.
- **FR-017**: Sentiment scoring MUST incorporate extracted news narratives, coherence between price action and news, and detected regime context.
- **FR-017a**: V1 MAY use an LLM to assist sentiment analysis and sentiment score derivation, provided the final sentiment output remains normalized to the required -2 to +2 range.
- **FR-017b**: If LLM-assisted sentiment generation fails or times out in V1, the system MUST mark the report as incomplete and omit LLM-dependent sentiment output rather than fabricating fallback sentiment content.
- **FR-018**: System MUST produce a probabilistic outlook with Bull case %, Base case %, and Bear case %.
- **FR-019**: Probabilistic outlook percentages MUST sum to exactly 100 in the final output.
- **FR-020**: No single outlook scenario probability MUST exceed 70% in V1.
- **FR-021**: System MUST include a narrative justification for the probabilistic outlook.
- **FR-022**: System MUST include a mandatory Risk & Invalidation section in every report.
- **FR-023**: The Risk & Invalidation section MUST include conditions that invalidate the primary scenario, key price thresholds, and critical macro events.
- **FR-024**: System MUST include a mandatory Position Wording section in every report.
- **FR-025**: The Position Wording section MUST include: current bias, conditions to increase exposure, conditions to reduce exposure, no-trade zones, and time horizon.
- **FR-026**: Position wording MUST be structured, non-emotional, and immediately actionable.
- **FR-026a**: V1 MAY use an LLM to generate or refine narrative wording for sentiment and position sections, but required output fields and formatting constraints MUST be enforced by program logic.
- **FR-026b**: If LLM-assisted position wording generation fails or times out in V1, the system MUST mark the report as incomplete and omit the affected LLM-dependent sections.
- **FR-027**: System MUST persist generated reports so the user can review historical outputs over time.
- **FR-027a**: Report date labeling and daily file organization MUST use the local system timezone in V1.
- **FR-027b**: V1 report history storage MUST use filesystem Markdown files (not a database) for persisted daily reports.
- **FR-028**: Stored reports MUST use a consistent structure across runs to support later historical analysis.
- **FR-029**: System MUST preserve run logs even when a run fails or partially completes.
- **FR-029a**: Run logs MUST record LLM timeout/failure status and whether the generated report is complete or incomplete.
- **FR-029b**: V1 run logs MUST be stored as append-only JSONL files on the filesystem.
- **FR-030**: System MUST not perform automatic trade execution in V1.
- **FR-031**: System MUST not require a complex dashboard UI in V1.
- **FR-032**: System MUST not implement an autonomous planning agent in V1.
- **FR-033**: System MUST not include multi-user workflows in V1.
- **FR-034**: System MUST not implement a marketplace for skills/plugins in V1.

### Product Constraints (V1)

- Local execution environment is TypeScript/Bun.
- The system is designed for personal use in V1, but architecture should remain modular enough to support future productization.
- The feature scope is report generation and storage, not trade automation.
- V1 uses a fixed market data provider mapping by asset class to minimize configuration complexity while preserving deterministic coverage.
- V1 implemented provider coverage uses CoinGecko for crypto market snapshots and FRED for core macro indicator context (CPI, PCE, unemployment, M2).
- V1 allows LLM-assisted narrative generation and analysis for sentiment and position outputs, with programmatic validation of required constraints.
- V1 scheduling and report date boundaries use the local system timezone only.
- V1 persistence uses filesystem storage only: Markdown files for reports and JSONL files for run logs.

### Key Entities *(include if feature involves data)*

- **FeedSource**: A configured RSS feed definition (name, URL, enabled status, parsing metadata).
- **NewsItem**: A normalized article record (title, source, published_at, summary, link, deduplication fingerprint).
- **WatchlistInstrument**: A configured market instrument (symbol, display name, asset class, volume applicability).
- **MarketSnapshotItem**: A per-instrument snapshot for a run (current price, return_24h, return_7d, volume if applicable, timestamp).
- **RegimeAssessment**: The market regime output for a run (label: Risk-on/Risk-off/Transition, supporting signal summaries, confidence notes).
- **SentimentAssessment**: The normalized sentiment score and supporting rationale for a run.
- **OutlookDistribution**: Bull/Base/Bear probabilities plus narrative justification and constraint-validation metadata.
- **RiskInvalidationBlock**: Invalidation conditions, key thresholds, and critical macro event risks tied to the primary scenario.
- **PositionWordingBlock**: Structured positioning guidance (bias, add/reduce conditions, no-trade zones, time horizon).
- **MorningMarketReport**: The full report artifact composed of metadata, inputs summary, analysis sections, completion status (complete/incomplete), omission reasons if any, and Markdown output path.
- **RunLogEntry**: A record of each scheduled/manual run attempt (trigger type, started_at, ended_at, status, messages, report reference) persisted as a JSONL line entry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A generated V1 report contains all mandatory sections (Market Snapshot, Regime Detection, Sentiment Scoring, Probabilistic Outlook, Risk & Invalidation, Position Wording) in 100% of successful runs.
- **SC-002**: The probabilistic outlook satisfies V1 constraints in 100% of successful runs: Bull/Base/Bear total equals 100 and no scenario exceeds 70%.
- **SC-003**: The user can read one complete report in approximately 3 to 5 minutes under normal output length, with a V1 readability proxy of <= 1,200 words for the rendered report body.
- **SC-004**: Duplicate scheduled execution is prevented for the protected run window in 100% of tested overlap cases.
- **SC-005**: Each run attempt (success, skip, or failure) produces a corresponding log entry with timestamp and status in 100% of runs.
- **SC-006**: Historical reports remain retrievable and consistently structured across at least 30 consecutive daily runs in local usage.
