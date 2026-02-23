---
id: position-wording-v1
name: Position Wording Guidance
type: positioning
version: "1.0"
enabled: true
binding:
  type: llm_position_wording
  target: position_wording
description: Produce structured, non-emotional position wording from regime and outlook context.
input:
  schema: positioning_context_v1
output:
  schema: position_wording_v1
---

## Description

Produce structured position wording with conditions to add/reduce exposure, no-trade zones, and time horizon.

## Input

- Regime assessment
- Outlook distribution

## Output

- Current bias
- Add/reduce exposure conditions
- No-trade zones
- Time horizon

## Usage Rules

- Use non-emotional wording.
- Keep the structure explicit and actionable.
- Do not present certainty beyond the supplied evidence.
