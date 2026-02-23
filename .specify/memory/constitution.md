# Market Monitor Constitution

## Core Principles

### I. MVP Simplicity First (Non-Negotiable)
This project is a personal MVP. The default decision must be the simplest implementation that solves the current problem clearly and correctly.
Avoid unnecessary abstractions, premature optimization, framework complexity, and speculative architecture.
Every new layer, dependency, or pattern must be justified by a concrete current need.

### II. Clarity Over Cleverness
Code must be easy to read, easy to change, and easy to debug by one person returning later.
Prefer explicit names, small functions, straightforward control flow, and predictable data structures.
Clean code is required: remove dead code, avoid duplication when it improves clarity, and keep modules focused.

### III. Test-Driven Development (Non-Negotiable)
Development must follow TDD and spec-driven development:
1. Write or update the spec/expected behavior.
2. Write a failing test.
3. Implement the smallest change to pass the test.
4. Refactor while keeping tests green.
No feature is complete without tests that validate real behavior.

### IV. Real Tests Only
No mocks, no placeholders, no fake implementations, and no mockup behavior in production code or tests unless explicitly approved for an external system that cannot be exercised locally.
Tests must validate actual logic and real integration points whenever feasible for an MVP.
If a test double is unavoidable, it must be documented and minimized.

### V. Coverage and Quality Gates
Tests must be written, executed, and passing before considering work complete.
Minimum test coverage is 75%; target coverage is 80% or higher.
Coverage is a quality gate, not a substitute for meaningful assertions.
A change that reduces clarity or testability should be rejected unless there is a documented reason.

## Additional Constraints

- All documentation, code, comments, commit-facing text, and user-facing text produced for this project must be written in English.
- Prefer direct implementations over generic reusable systems until reuse is proven.
- Keep dependencies minimal; prefer built-in platform capabilities when reasonable.
- No placeholder features or partially implemented flows should be presented as complete.

## Development Workflow

1. Define behavior in a spec or task description in English.
2. Write failing tests first (unit/integration as appropriate).
3. Implement the simplest solution that passes.
4. Refactor for readability and maintainability.
5. Run the full relevant test suite and verify coverage threshold.
6. Update documentation/comments in English when behavior changes.

## Governance

This constitution overrides conflicting local development preferences for this repository.
All changes must be reviewed against simplicity, clarity, TDD compliance, and coverage thresholds.
Amendments must update this file with a clear reason and a new version/date entry.

**Version**: 1.0.0 | **Ratified**: 2026-02-23 | **Last Amended**: 2026-02-23
