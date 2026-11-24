# ChessCue Product Requirements

Status: Approved for hackathon MVP  
Product: Chrome desktop web app  
Primary theme: The curriculum is the opponent  
Delivery constraint: Firebase #BuildHybridAI submission by December 1, 2026 at 2:00 AM Asia/Dubai

## 1. Product goal

Help a developing chess player improve by playing complete games against an adaptive CPU. Each completed game updates an evidence-backed model of the player's weaknesses. The next game changes opponent strength, color, and opening branch to exercise one priority weakness at an appropriate difficulty.

The product is not a general chess chatbot or an analysis board. Stockfish establishes chess facts. Deterministic rules identify learning moments and schedule the curriculum. Gemini turns verified facts into short, useful coaching.

## 2. Target user and outcome

The primary user is a developing player who prefers learning through games rather than choosing lessons from a library.

The core user question is: "Can I just play and have the training adapt to me?"

A successful session has these outcomes:

1. The player completes an uninterrupted game with no live assistance.
2. The tutor identifies one to three important learning moments.
3. The player receives a concise explanation grounded in engine facts.
4. The tutor updates the player's strength and theme mastery evidence.
5. The next game has one visible training focus and feels challenging for a specific reason.

## 3. Product principles

- Games are the curriculum. The next game is the main teaching intervention.
- No coaching during play. No hints, arrows, evaluations, or recommended moves appear before the game ends.
- Stockfish is the authority for legality, evaluation, and candidate lines.
- Gemini may explain supplied facts but may not invent or alter chess facts.
- Lesson agents execute versioned teaching playbooks instead of inventing lesson structure or progression.
- Adaptation is gradual and evidence-backed. One result cannot cause a large difficulty change.
- Gameplay is local-first. Network or Gemini failure must not prevent a user from playing.
- The product is "offline after setup," not fully offline. First installation and model download require a connection.

## 4. MVP scope

### 4.1 In scope

- A complete legal chess game against Stockfish running in a Web Worker
- Save and resume for an in-progress game
- Three calibrated opponent levels with gradual history-based adjustment
- Post-game Stockfish analysis of every move
- One to three deterministic learning moments per game
- A persistent mastery profile across six to eight canonical themes
- One visible focus, color, and opening branch for the next game
- Playbook-driven micro-lessons built from the player's verified game positions
- Upload or paste one or more completed standard-chess PGNs with the learner's color
- Local validation, deduplication, analysis, and source labeling for imported games
- Gemini coaching through Firebase AI Logic, preferring on-device inference
- Deterministic coaching when Gemini is unavailable or rejected
- IndexedDB as the local source of truth for gameplay
- Optional Firebase Authentication and Firestore cross-device synchronization
- A seeded judge profile that demonstrates adaptation within two completed games
- A versioned, compact curriculum pack derived from Lichess data at build time

### 4.2 Explicitly out of scope

- Multiplayer or real-time human opponents
- Automatic Lichess or Chess.com account synchronization
- Importing or analyzing an active external game
- Live hints or engine assistance during play
- Voice coaching
- Native mobile applications
- Custom model training
- Runtime access to the full Lichess database
- A complete opening repertoire or full lesson library
- Free-form agent-authored lessons, objectives, mastery decisions, or progression rules

## 5. Primary journey

### 5.1 Start a focus game

Before the board appears, the player sees one sentence explaining the focus, the opponent level, color, and opening family. The board, clocks, and move action dominate the play screen. Curriculum detail and engine configuration stay off this screen.

### 5.2 Play without coaching

The player makes legal moves and receives CPU replies. The interface may show clocks, move history, draw, resign, sound, and board controls. It must not expose engine evaluation or teaching prompts.

### 5.3 Review the result

After the result, review opens as its own focused screen at the board position immediately before the most important moment. Stockfish remains hidden while the player first identifies the position's demand and commits a legal move directly on the board.

The tutor then scores the attempt against verified alternatives, compares the consequence on the board, and asks for a transfer attempt in another validated position when available. The completed set records first-attempt score, the hard spot, the next review date, and an exact next-game reinforcement. Full-game replay and raw engine details remain collapsed as secondary references.

### 5.4 Continue the curriculum

The mastery profile records evidence, confidence, and recency. The scheduler selects one next focus and explains why. The next game begins with the chosen opponent settings and opening branch.

### 5.5 Bring completed games

The player may upload a PGN file or paste PGN text containing one or more completed standard-chess games. They identify whether they played White or Black for the batch; mixed-color batches are imported separately. The application validates each game, rejects unsupported or malformed records, detects duplicates, labels the source, and analyzes accepted games through the same Stockfish pipeline.

Imported moves contribute to weakness and mastery evidence. Imported ratings and results are low-confidence context only because opponent identity, rating system, time control, and playing conditions may be absent or unreliable. They must not directly change adaptive CPU Elo. Tutor-played games remain the primary difficulty-calibration evidence.

### 5.6 Complete a playbook-driven lesson

When evidence crosses a configured threshold, deterministic policy selects a versioned lesson playbook for one theme. The playbook defines the objective, prerequisites, sequence, permitted facts, response types, mastery checks, and the next-game reinforcement rule.

The lesson agent receives the selected playbook and verified Stockfish facts. It may personalize explanations and questions only inside the playbook's bounded slots. Deterministic validation controls every transition and mastery update. If generated content fails, the same playbook continues with deterministic wording.

## 6. Functional requirements

| ID     | Requirement                                                                   | Acceptance criterion                                                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-001 | The user can play a complete legal game against Stockfish.                    | Legal moves, all terminal results, resignation, and draw handling pass browser E2E tests.                                                                                                                    |
| FR-002 | Engine calculation must not block the interface.                              | Stockfish runs in a dedicated Web Worker and the board remains interactive during search.                                                                                                                    |
| FR-003 | In-progress games persist locally after every accepted move.                  | Reloading restores the exact position, clocks, move history, and active focus.                                                                                                                               |
| FR-004 | No coaching appears before a game ends.                                       | E2E tests find no evaluation, hint, suggested move, or learning moment in active-game UI or accessible text.                                                                                                 |
| FR-005 | Every completed game produces a versioned analysis fact packet.               | Reanalyzing a fixed PGN with fixed engine settings produces equivalent facts within documented evaluation tolerance.                                                                                         |
| FR-006 | The system identifies no more than three learning moments.                    | Each moment references a legal position and engine-supported candidate move from its fact packet.                                                                                                            |
| FR-007 | Coaching output is constrained and validated.                                 | Output matches the schema and every move, number, and theme is traceable to allowed input facts. Invalid output is suppressed.                                                                               |
| FR-008 | The player profile tracks strength and theme mastery with uncertainty.        | Each score includes evidence count, confidence, and last-observed time; low evidence is labeled as an emerging pattern.                                                                                      |
| FR-009 | Difficulty adapts only after a three-game window.                             | Scripted histories deterministically increase, hold, or reduce target Elo by at most 50 points per window.                                                                                                   |
| FR-010 | The scheduler chooses one focus for the next game.                            | The selection is deterministic from the same history and includes a user-facing reason.                                                                                                                      |
| FR-011 | Focus affects the next game conditions.                                       | Color, opening branch, or opponent style targets the focus; engine strength targets a 45 to 55 percent expected score.                                                                                       |
| FR-012 | Offline play remains available after setup.                                   | With the network disabled, a cached installation can start, complete, analyze, save, and schedule another game.                                                                                              |
| FR-013 | Cloud synchronization never overwrites local game history.                    | Immutable game records merge by stable ID, then the profile is recomputed from the merged set.                                                                                                               |
| FR-014 | Inference provenance is visible after the game.                               | Coaching identifies on-device, cloud, or deterministic fallback as its source.                                                                                                                               |
| FR-015 | The judge can observe adaptation quickly.                                     | A seeded profile and two scripted game outcomes visibly change focus or opponent settings.                                                                                                                   |
| FR-016 | The player can upload or paste completed PGNs.                                | Valid standard-chess games are stored and queued for analysis; malformed, incomplete, or unsupported games receive a specific non-destructive error.                                                         |
| FR-017 | Imported games are deduplicated and traceable.                                | Importing the same canonical game twice creates one record and reports the duplicate; every accepted game displays its import source.                                                                        |
| FR-018 | Imported evidence influences curriculum without directly controlling CPU Elo. | Scripted imported histories change theme mastery and focus while identical tutor-game histories retain the same difficulty adjustment.                                                                       |
| FR-019 | Every lesson run is bound to a versioned teaching playbook.                   | The stored lesson record identifies the playbook version, input evidence, step sequence, and transition results.                                                                                             |
| FR-020 | Lesson selection and progression are deterministic.                           | Identical evidence, profile, configuration, and time produce the same playbook, step order, mastery result, and next-game reinforcement.                                                                     |
| FR-021 | Generated lesson content is constrained to playbook slots.                    | Unknown steps, unsupported facts, altered objectives, and invalid transitions are rejected and replaced with deterministic content.                                                                          |
| FR-022 | Lessons use the player's verified positions when evidence is sufficient.      | Each personalized exercise references a legal stored position and fact packet; otherwise the playbook uses a validated canonical example.                                                                    |
| FR-023 | Post-game review is replay-first.                                             | The review auto-jumps to the position before each moment, replays the complete game, compares played and better lines on the board, explains the pattern plainly, and hides raw engine data by default.      |
| FR-024 | Review is an active teaching set on a dedicated screen.                       | Before any engine reveal, the player retrieves the position's demand and commits a legal board move; deterministic scoring, transfer, logging, and next-game reinforcement follow.                           |
| FR-025 | The adaptive profile is rebuilt from durable evidence.                        | Completed tutor games are analyzed automatically; analysis and review evidence survive reload; imported evidence may change mastery and focus but never CPU Elo; three tutor results move Elo by at most 50. |

## 7. Curriculum and adaptation policy

The player state contains:

- a playing-strength estimate and uncertainty
- mastery evidence by theme
- opening, middlegame, and endgame splits
- evidence counts and recency
- recent streak, resignation, and abandonment signals

Weakness priority is based on impact, recurrence, uncertainty, and recency decay. The scheduler alternates focus games with consolidation games. Difficulty changes only after a three-game window and by no more than 50 Elo. The initial target is a 45 to 55 percent expected player score.

The MVP theme vocabulary contains six to eight labels selected from Lichess puzzle themes. The exact set is versioned with the curriculum pack. Opening branches are precomputed by rating band, color, and resulting structure. The application does not query a large dataset at runtime.

## 8. Offline and online behavior

| Capability    | Offline after setup                                      | Online                                                          |
| ------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| CPU game      | Local Stockfish WASM                                     | Same local engine path                                          |
| Analysis      | Local Stockfish and deterministic moment selection       | Same local analysis                                             |
| Coaching      | Gemini Nano when installed, otherwise deterministic copy | Prefer Nano, then approved cloud fallback                       |
| Curriculum    | Recomputed from local tutor and imported game history    | Recomputed from merged cross-device history                     |
| Storage       | IndexedDB with visible unsynced state                    | IndexedDB plus Firestore synchronization                        |
| Configuration | Last validated configuration                             | Remote Config may update approved model, prompt, and thresholds |
| Game import   | Upload or paste PGN, then validate and analyze locally   | Same local import path; accepted records may synchronize        |

## 9. Success measures

The hackathon MVP succeeds when:

- a first-time judge can complete the core journey without instruction
- the seeded demo visibly adapts within two games
- a player can import a PGN and see its evidence change the next training focus
- a repeated weakness selects the expected playbook and completes with identical progression under repeated inputs
- all displayed chess claims pass legality and fact-trace validation
- network loss does not interrupt an active or subsequent cached game
- the SLOs in `docs/SLO.md` pass on the reference environment
- at least three opponent levels feel intentional in human playtesting, without obvious random blunders

Longer-term product signals are repeat games per player, completion rate, return rate, calibration of expected score, and whether players can correctly state the focus of the next game.

## 10. Risks and mitigations

| Risk                                                | Mitigation                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Limited-strength Stockfish makes implausible moves. | Benchmark all levels against human games, extend book play where useful, and constrain the adjustment range.        |
| The curriculum overclaims a weakness.               | Store evidence and uncertainty; require repeated evidence before declaring a stable pattern.                        |
| Gemini hallucinates chess facts.                    | Supply a compact fact packet, require structured output, validate every claim, and fall back to deterministic copy. |
| Lesson agents drift from the teaching method.       | Select and advance versioned playbooks deterministically; allow generation only inside validated content slots.     |
| On-device inference is unsupported or unavailable.  | Capability-detect at runtime and preserve a deterministic local coaching path.                                      |
| Cross-device state conflicts.                       | Sync immutable games and recompute derived profiles instead of syncing mutable profile totals.                      |
| Imported metadata distorts difficulty.              | Treat ratings and results as low-confidence context; adjust CPU Elo primarily from tutor-played games.              |
| The offline claim is misleading.                    | Consistently describe the product as offline after setup and show model/cache readiness.                            |

## 11. Release acceptance

The MVP is ready for submission when FR-001 through FR-025 have automated or recorded evidence, the three build gates below pass, and there are no known chess-correctness failures:

1. A human can finish a game while the browser remains responsive.
2. The same completed game produces a stable fact packet and learning moments.
3. Gemini explanations are useful, schema-valid, and factual, with fallback proven.
