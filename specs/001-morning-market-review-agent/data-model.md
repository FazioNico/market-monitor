# Data Model - Morning Market Review Agent (V1)

Date: 2026-02-23  
Branch: `001-morning-market-review-agent`

## Modeling Notes

- V1 persistence is filesystem-only.
- Entities below define runtime shapes, validation expectations, and file mappings.
- All timestamps are stored in ISO-8601 UTC in data/log records unless the field is explicitly a local-date label.
- Schedule evaluation and report date labeling use local system timezone (per clarified spec).

## Entity: FeedCatalogEntry

Represents one RSS feed configured in `config/rss-feeds.md`.

Fields:
- `category` (`string`, required): The theme bucket used to group feeds (for example `macro`, `crypto`, `policy`).
- `source` (`string`, required): Human-readable source name.
- `url` (`string`, required): Absolute `http(s)` RSS/Atom URL.
- `enabled` (`boolean`, required, default `true`): Whether the feed is active.
- `notes` (`string`, optional): Optional operator note for feed context.

Validation:
- `url` must be valid `http` or `https`.
- `(category, source, url)` combination must be unique within the catalog file.

## Entity: NewsItem

Normalized article record derived from RSS/Atom entries.

Fields:
- `title` (`string`, required)
- `publishedAt` (`string`, required, ISO-8601 timestamp)
- `source` (`string`, required)
- `summary` (`string`, required; may be truncated deterministically)
- `link` (`string`, required, absolute URL)
- `category` (`string`, required): Inherited from `FeedCatalogEntry`
- `fingerprint` (`string`, required): Deterministic deduplication key (normalized URL/title/date hash)
- `ingestedAt` (`string`, required, ISO-8601 timestamp)

Validation:
- `fingerprint` must be unique within a single run after deduplication.
- Missing `title`, `link`, or `publishedAt` entries are rejected and logged.

## Entity: WatchlistInstrument

Represents one configured instrument in `config/watchlist.json`.

Fields:
- `id` (`string`, required): Internal ID used in the app.
- `symbol` (`string`, required): Display symbol (for example `BTC`, `ETH`).
- `name` (`string`, required)
- `assetClass` (`enum`, required): `crypto` | `index` | `fx` | `rates` | `commodity`
- `provider` (`string`, required): V1 initially `coingecko` for implemented instruments
- `providerKey` (`string`, required): Provider-specific identifier (for CoinGecko, coin id)
- `volumeRelevant` (`boolean`, required)
- `enabled` (`boolean`, required, default `true`)

Validation:
- `providerKey` must be unique per provider among enabled instruments.

## Entity: MarketSnapshotItem

Per-instrument market data captured for a run.

Fields:
- `instrumentId` (`string`, required, FK -> `WatchlistInstrument.id`)
- `capturedAt` (`string`, required, ISO-8601 timestamp)
- `currentPrice` (`number`, required)
- `return24hPct` (`number`, required)
- `return7dPct` (`number`, required)
- `volume24h` (`number`, optional; required only if `volumeRelevant=true` and available`)
- `currency` (`string`, required; V1 default `usd`)
- `provider` (`string`, required)

Validation:
- Numeric values must be finite.
- Missing required prices/returns mark instrument snapshot as unavailable and must be logged.

## Entity: MacroSeriesObservation

Macro indicator observation pulled from FRED for regime analysis context.

Fields:
- `seriesId` (`string`, required): FRED series id (for example `CPIAUCSL`, `PCEPI`, `UNRATE`, `M2SL`)
- `label` (`string`, required): Human-readable metric name
- `observedAt` (`string`, required): Observation date (FRED series date)
- `value` (`number`, required)
- `fetchedAt` (`string`, required, ISO-8601 timestamp)
- `provider` (`string`, required): `fred`
- `units` (`string`, optional)

Validation:
- `provider` must be `fred`
- `value` must be finite
- V1 macro context expects observations for CPI, PCE, unemployment, and M2 unless explicitly marked unavailable and logged

## Entity: RegimeAssessment

Classification output for the current run.

Fields:
- `label` (`enum`, required): `risk_on` | `risk_off` | `transition`
- `dispersionSignal` (`string`, required)
- `correlationSignal` (`string`, required)
- `momentumSignal` (`string`, required)
- `macroSignal` (`string`, required)
- `macroContext` (`MacroSeriesObservation[]`, required): Latest available FRED observations used in regime reasoning
- `rationale` (`string`, required)

Validation:
- `label` must match one of the allowed values.

## Entity: SentimentAssessment

Normalized sentiment output for the current run.

Fields:
- `score` (`number`, required): normalized range `[-2, 2]`
- `method` (`enum`, required): `llm_assisted` | `deterministic`
- `narrativeSummary` (`string`, optional in incomplete reports)
- `priceActionCoherence` (`string`, required)
- `status` (`enum`, required): `complete` | `omitted_llm_failure`

Validation:
- `score` must be within `[-2, 2]` when `status=complete`.
- `score` may be omitted only when `status=omitted_llm_failure`.

## Entity: OutlookDistribution

Probabilistic outlook for the current run.

Fields:
- `bullPct` (`integer`, required)
- `basePct` (`integer`, required)
- `bearPct` (`integer`, required)
- `primaryScenario` (`enum`, required): `bull` | `base` | `bear`
- `justification` (`string`, required)
- `constraintValidated` (`boolean`, required)

Validation:
- `bullPct + basePct + bearPct = 100`
- Each scenario percentage `<= 70`
- All scenario percentages are integers `>= 0`

## Entity: RiskInvalidationBlock

Required report section defining invalidation logic and key risk triggers.

Fields:
- `invalidationConditions` (`string[]`, required, min 1)
- `keyPriceThresholds` (`string[]`, required, min 1)
- `criticalMacroEvents` (`string[]`, required, min 1)

## Entity: PositionWordingBlock

Required position wording output (LLM-assisted in V1, constrained by program logic).

Fields:
- `currentBias` (`string`, optional in incomplete reports)
- `addExposureConditions` (`string[]`, optional in incomplete reports)
- `reduceExposureConditions` (`string[]`, optional in incomplete reports)
- `noTradeZones` (`string[]`, optional in incomplete reports)
- `timeHorizon` (`string`, optional in incomplete reports)
- `status` (`enum`, required): `complete` | `omitted_llm_failure`

Validation:
- All fields must be present when `status=complete`.

## Entity: SkillDefinition

Loaded from a Markdown skill file under `skills/**`.

Fields:
- `id` (`string`, required): Stable unique skill identifier
- `name` (`string`, required)
- `type` (`string`, required): Domain grouping (for example `sentiment`, `outlook`, `positioning`)
- `version` (`string`, required)
- `bindingType` (`string`, required): Determines deterministic runtime handler
- `description` (`string`, required; YAML front matter summary)
- `inputSection` (`string`, required; Markdown section content)
- `outputSection` (`string`, required; Markdown section content)
- `usageRulesSection` (`string`, required; Markdown section content)
- `filePath` (`string`, required)
- `enabled` (`boolean`, required, default `true`)

Validation:
- `id` must be unique across loaded skills.
- Required headings must exist exactly once (`Description`, `Input`, `Output`, `Usage Rules`).

## Entity: SkillBindingExecution

Trace of one deterministic skill execution during a run.

Fields:
- `skillId` (`string`, required, FK -> `SkillDefinition.id`)
- `bindingType` (`string`, required)
- `startedAt` (`string`, required)
- `endedAt` (`string`, required)
- `status` (`enum`, required): `success` | `error` | `skipped`
- `errorCode` (`string`, optional)
- `outputRef` (`string`, optional): Reference to produced data block

## Entity: MorningMarketReport

Full report artifact for one run.

Fields:
- `reportId` (`string`, required)
- `runId` (`string`, required)
- `generatedAt` (`string`, required, ISO-8601 timestamp)
- `localReportDate` (`string`, required, `YYYY-MM-DD`)
- `fileName` (`string`, required, pattern `YYYY-MM-DD-hh-mm_market-report.md`)
- `filePath` (`string`, required)
- `status` (`enum`, required): `complete` | `incomplete`
- `omissionReasons` (`string[]`, optional)
- `newsItems` (`NewsItem[]`, required)
- `marketSnapshot` (`MarketSnapshotItem[]`, required)
- `macroSeriesContext` (`MacroSeriesObservation[]`, required)
- `regimeAssessment` (`RegimeAssessment`, required)
- `sentimentAssessment` (`SentimentAssessment`, required even if omitted status)
- `outlookDistribution` (`OutlookDistribution`, required)
- `riskInvalidation` (`RiskInvalidationBlock`, required)
- `positionWording` (`PositionWordingBlock`, required even if omitted status)

Validation:
- `fileName` must match the contract regex.
- `status=incomplete` requires at least one `omissionReasons` entry.

## Entity: RunLogEntry

Append-only JSONL record for each run attempt.

Fields:
- `runId` (`string`, required)
- `triggerType` (`enum`, required): `manual` | `scheduled`
- `startedAt` (`string`, required)
- `endedAt` (`string`, optional)
- `status` (`enum`, required): `started` | `success` | `failed` | `skipped_duplicate` | `partial_success`
- `reportStatus` (`enum`, optional): `complete` | `incomplete`
- `reportFilePath` (`string`, optional)
- `llmStatus` (`enum`, optional): `not_used` | `success` | `timeout` | `error`
- `messages` (`string[]`, required)

Validation:
- JSONL lines must be valid JSON objects.
- `status=partial_success` requires `reportStatus=incomplete`.

## Entity: RunLock

Used to prevent duplicate execution for the protected daily run window.

Fields:
- `lockKey` (`string`, required): Derived from local date + schedule slot
- `createdAt` (`string`, required)
- `expiresAt` (`string`, required)
- `runId` (`string`, required)

Persistence:
- Filesystem lock file under a runtime temp/work directory (`.tmp/` or configured path).

## Relationships (Summary)

- `FeedCatalogEntry` -> many `NewsItem`
- `WatchlistInstrument` -> many `MarketSnapshotItem`
- `MacroSeriesObservation` contributes to `RegimeAssessment`
- `MorningMarketReport` aggregates `NewsItem`, `MarketSnapshotItem`, `MacroSeriesObservation`, and all analysis blocks
- `MorningMarketReport` is linked to one `RunLogEntry` by `runId`
- `SkillDefinition` -> many `SkillBindingExecution`

## State Transitions

### Run Lifecycle

- `started` -> `success`
- `started` -> `partial_success` (LLM timeout/error, incomplete report written)
- `started` -> `failed`
- Trigger blocked -> `skipped_duplicate`

### Report Lifecycle

- `complete` (all required sections populated)
- `incomplete` (LLM-dependent sections omitted with explicit omission reasons)
