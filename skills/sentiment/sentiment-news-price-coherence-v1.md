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
