# ChessCue Agent Instructions

These rules apply to the entire repository. See `docs/ENGINEERING.md` for the architecture, folder ownership, coding standards, and deployment model.

## Product invariants

- Gameplay must work offline after initial asset installation.
- The active-game path must never depend on Firebase or Gemini.
- Stockfish and the chess rules library are authoritative for chess facts.
- Gemini may explain validated facts but may not create moves, evaluations, or mastery evidence.
- Keep rated games unassisted. Only explicitly unrated coached games may show optional, collapsed notes about moves already played.
- Completed games are immutable. Derived profiles must be reproducible from versioned evidence.
- Imported PGNs may affect theme mastery and curriculum focus, but imported results and ratings must not directly adjust CPU Elo.
- Lesson agents execute versioned teaching playbooks. Deterministic code selects the playbook and validates every transition.
- Gemini may fill bounded explanation and question slots but may not choose lesson objectives, mastery outcomes, or progression.

## Engineering rules

- Keep domain modules pure. They must not import React, Firebase, IndexedDB, browser globals, or worker APIs.
- Access engines, storage, AI, configuration, and cloud services through typed interfaces and adapters.
- Validate every external boundary at runtime, including PGN input, worker messages, Firebase records, Remote Config, curriculum packs, and AI output.
- Use strict TypeScript. Do not use `any`, non-null assertions, or unchecked casts in product code.
- Represent lifecycle and failure states explicitly. Do not encode loading or error states as unrelated booleans.
- Keep changes small and cohesive. Do not create wrappers, frameworks, or generic abstractions without a second concrete use.
- Never manually edit generated curriculum assets, coverage output, build output, or CHANGELOG files.
- Never commit secrets, service-account credentials, emulator exports containing user data, or production diagnostic data.

## Verification

- Reproduce bugs through the closest user-facing Playwright journey before changing code.
- Add the smallest failing test that proves the defect, then implement the fix.
- Run formatting, lint, type checking, unit tests, integration tests, and relevant E2E tests before handoff.
- Treat test flakiness as a defect. Fix or quarantine it with an owner, expiry, and linked issue.
- Test offline behavior, reload recovery, worker cancellation, and deterministic fallback for changes that touch the core loop.
- Inspect affected UI at desktop and narrow mobile widths. Fix obvious layout, accessibility, or interaction defects found during the journey.

## Documentation

- Update `docs/PRD.md` when product behavior or acceptance criteria change.
- Update `docs/ARD.md` when boundaries, data models, failure behavior, or external services change.
- Update `docs/SLO.md` when an indicator, objective, measurement method, or availability boundary changes.
- Record decisions in the owning document rather than leaving contradictory alternatives or stale TODOs.
