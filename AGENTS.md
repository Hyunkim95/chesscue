# ChessCue Agent Instructions

These rules apply to the entire repository. See `docs/ENGINEERING.md` for the architecture, folder ownership, coding standards, and deployment model.

## Product invariants

- Gameplay must work offline after initial asset installation.
- The active-game path must never depend on Firebase or Gemini.
- Stockfish and the chess rules library are authoritative for chess facts.
- Gemini may explain validated facts but may not create moves, evaluations, or mastery evidence.
- Keep rated games unassisted. Only explicitly unrated coached games may show optional, collapsed notes about moves already played. They may also offer on-demand local hints and move previews. The player still commits every move.
- Completed games are immutable. Derived profiles must be reproducible from versioned evidence.
- Imported PGNs may affect theme mastery and curriculum focus, but imported results and ratings must not directly adjust CPU Elo.
- Lesson agents execute versioned teaching playbooks. Deterministic code selects the playbook and validates every transition.
- Gemini may fill bounded explanation and question slots but may not choose lesson objectives, mastery outcomes, or progression.
- Use the [AI routing guide](docs/AI_ROUTING.md) when choosing between deterministic code, Gemini Nano, and Gemini Cloud.

## Interface design

Use the [ChessCue UI design skill](.agents/skills/chesscue-ui-design/SKILL.md) for player-facing changes, including individual controls and feedback states. Verify the change in the surrounding journey. Use the [ChessCue feedback loop skill](.agents/skills/chesscue-feedback-loop/SKILL.md) for coaching, reported missed tactics, curriculum motif logic, and skill-transfer measurement. Check equivalent move evidence and board feedback in Coached Play, Practice, and Review.

- Design each screen for the Chrome extension side panel first. Start with a single-column layout at 320 px and keep the main action easy to reach.
- Check the actual extension at 320 px and a wider panel before adapting the layout for the web. Avoid horizontal scrolling and keep interactive targets at least 44 px where space allows.

## Board-first redesign

The product is being rebuilt around a board-first, game-like loop. Before working on any screen, Rook behaviour, progress mechanic or navigation, read [docs/design/board-first-redesign.md](docs/design/board-first-redesign.md) and [ENGINEERING.md §17](docs/ENGINEERING.md#17-board-first-redesign-structure-and-parallel-work). The prototype in `demo/prototypes/board-first/` is the visual reference.

- Not drilling: positions come from the player's own games, unlabeled. Name the idea only after the player finds it.
- The board wins every screen. Rook answers through the board and one bubble, with no chat history.
- Show, don't tell: every claim Rook makes about the board is drawn on it (moves, arrows, outlines), with a one-sentence caption per frame. Never put a paragraph where the board could show it, and always offer ↺ Reset back to the start.
- Chips are chosen by code and never name the best move before it is found. AI only routes questions; offline typed text is confirmed before Rook acts.
- Progress is derived from immutable attempt records, never stored as totals.
- In a parallel workstream, write only inside the paths that workstream owns (§17.5) and treat the §17.2 contracts as frozen.

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
