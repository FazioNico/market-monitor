---
id: outlook-validation-v1
name: Deterministic Outlook Validation
type: outlook
version: "1.0"
enabled: true
binding:
  type: deterministic_outlook_validation
  target: outlook_distribution
description: Validate probabilistic outlook distribution constraints before rendering.
input:
  schema: outlook_distribution_v1
output:
  schema: outlook_distribution_validated_v1
---

## Description

Validate that Bull/Base/Bear percentages sum to 100 and each scenario stays within configured caps.

## Input

- Outlook distribution object

## Output

- Validation result
- Confirmed outlook distribution

## Usage Rules

- Reject invalid distributions.
- Do not mutate values except through explicit normalization upstream.
