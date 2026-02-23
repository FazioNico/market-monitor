# Skill File Format Contract (V1)

## File Location

- Default root: `skills/`
- Recommended grouping: `skills/<type>/*.md`

## Purpose

Define agent-readable skill instructions and metadata in Markdown while binding execution to deterministic runtime handlers.

## Security / Execution Rule (V1)

Skill files are declarative only.

- Skill files DO NOT execute code directly.
- Runtime loads metadata and text content.
- Runtime chooses a deterministic binding handler using `binding.type`.
- The binding handler is implemented in application code and validates inputs/outputs.

## Required Structure

Each skill file MUST contain:
- YAML front matter
- Required sections:
  - `## Description`
  - `## Input`
  - `## Output`
  - `## Usage Rules`

## YAML Front Matter Schema (Required Keys)

```yaml
id: string                # unique skill id
name: string              # human-readable name
type: string              # theme/domain (e.g., sentiment, outlook, positioning)
version: string           # semantic or project version label
enabled: true             # optional, defaults to true
binding:
  type: string            # deterministic binding handler id
  target: string          # logical target (e.g., sentiment_assessment)
description: string       # short summary exposed to agent
input:
  schema: string          # logical schema id
output:
  schema: string          # logical schema id
```

## Supported `binding.type` Values (V1)

- `llm_sentiment`
- `llm_position_wording`
- `deterministic_outlook_validation`
- `deterministic_report_format`

Additional values may be added if implemented in the runtime binding registry.

## Example Skill File

```md
---
id: sentiment-news-price-coherence-v1
name: Sentiment From News And Price Coherence
type: sentiment
version: "1.0"
enabled: true
binding:
  type: llm_sentiment
  target: sentiment_assessment
description: Generate a normalized sentiment assessment using news narratives and price-action coherence.
input:
  schema: sentiment_context_v1
output:
  schema: sentiment_assessment_v1
---

## Description

Generate a concise, non-emotional sentiment narrative and normalized score in the range -2 to +2.

## Input

- News items (deduplicated, recent)
- Market snapshot
- Regime assessment

## Output

- Sentiment score (-2 to +2)
- Narrative summary
- Coherence note

## Usage Rules

- Keep wording concise and non-emotional.
- Do not exceed the normalized score bounds.
- If input evidence is mixed, explicitly state uncertainty.
```

## Parsing Rules

- Missing front matter or required headings is a validation error.
- Duplicate `id` values across skill files is a validation error.
- Unknown `binding.type` is a validation error (unless runtime explicitly registers it).

## Runtime Binding Contract

- Runtime exposes `description` and structural metadata to the agent/orchestrator layer.
- Runtime executes only the code path associated with `binding.type`.
- Runtime validates the binding output against required constraints before persisting it into the report model.
