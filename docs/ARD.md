# ChessCue Architecture Requirements

Status: MVP architecture baseline  
Related documents: `docs/PRD.md`, `docs/SLO.md`

## 1. Architecture goals

The architecture must make a complete CPU game reliable without any network or language-model dependency. It must separate chess truth, curriculum policy, and natural-language presentation so each can be tested independently.

The system is a local-first progressive web application. IndexedDB is the gameplay source of truth. Stockfish runs locally in Web Workers. Firebase adds identity, synchronization, configuration, hosting, and hybrid Gemini inference without entering the real-time move path.

## 2. Required technology boundaries

| Component              | Owns                                                                                     | Must not own                                             |
| ---------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Chess rules library    | Position state, legal move application, PGN/FEN serialization, terminal result detection | Evaluation or pedagogy                                   |
| Stockfish WASM worker  | CPU moves, evaluations, principal variations, limited strength                           | UI state, prose, mastery decisions                       |
| Analysis pipeline      | Versioned fact packets and deterministic learning-moment candidates                      | Unverified generated facts                               |
| PGN import module      | Parse, normalize, validate, deduplicate, and label completed external games              | Live-game access or trusted-rating assumptions           |
| Curriculum engine      | Player model, evidence aggregation, focus selection, difficulty policy                   | Chess evaluation or prose generation                     |
| Lesson playbook engine | Playbook selection, ordered steps, allowed transitions, scoring, and reinforcement       | Free-form lesson planning or generated mastery decisions |
| Coaching adapter       | Prompt construction, structured inference, output validation, deterministic fallback     | Legal move or evaluation authority                       |
| Local repository       | Atomic persistence for games, analysis, profile inputs, and sync state                   | Cloud-specific behavior                                  |
| Sync adapter           | Authentication, immutable-record upload/download, merge coordination                     | Last-write-wins profile updates                          |
| Firebase services      | Hosting, Auth, Firestore, App Check, Remote Config, AI Logic                             | CPU move calculation or required gameplay state          |
| Lichess build pipeline | Reproducible compact opening and theme assets                                            | Runtime dependency on bulk exports                       |

## 3. Reference stack

- TypeScript web application
- React for UI composition
- Vite for local development and production builds
- A maintained chess rules library for move legality and PGN/FEN handling
- Stockfish WebAssembly in dedicated gameplay and analysis Web Workers
- IndexedDB behind a typed repository interface
- Service worker for application, engine, and curriculum-pack caching
- Firebase Hosting, Authentication, Firestore, App Check, Remote Config, and AI Logic
- Vitest for unit and integration tests
- Playwright for browser E2E, offline, reload, and worker-responsiveness tests

Package versions are locked in the repository. Domain code must not import Firebase or browser storage APIs directly.

## 4. Runtime topology

```text
React UI
  | commands and state
Application services
  |-- Game service ------------> Chess rules library
  |        |-------------------> Stockfish gameplay worker
  |        `-------------------> Local repository
  |-- Analysis service --------> Stockfish analysis worker
  |        `-------------------> Fact and moment validators
  |-- Import service ----------> PGN parser and canonical fingerprint
  |        `-------------------> Local repository and analysis queue
  |-- Curriculum service ------> Pure deterministic policy
  |-- Lesson service ----------> Versioned playbook registry and runner
  |        `-------------------> Deterministic transition and mastery validators
  |-- Coaching service --------> Firebase AI Logic adapter
  |        `-------------------> Deterministic template adapter
  `-- Sync service ------------> Firebase Auth and Firestore

Build-time data pipeline ------> Versioned curriculum pack ------> Local cache
Remote Config -----------------> Validated runtime configuration
```

The UI communicates with application services through typed commands and events. Worker messages use versioned schemas. All external results are validated before entering domain state.

## 5. Domain modules

### 5.1 Game module

The game module is authoritative for the current position and game lifecycle. It accepts a player move only after local legality validation, persists the resulting state atomically, then requests a CPU reply. Rendering and persistence never wait for CPU search, Firestore, or Gemini.

Required states are `setup`, `active_player_turn`, `active_cpu_thinking`, `completed`, and `abandoned`. Every transition is explicit and recoverable after reload.

### 5.2 Engine module

Two logical worker roles are required:

- Gameplay worker: one bounded search per CPU turn using the current opponent configuration.
- Analysis worker: post-game multipass analysis that may run longer without affecting board responsiveness.

The worker adapter must support initialization readiness, cancellation, bounded search time, crash recovery, and a request ID on every message. Late replies from cancelled or previous positions are ignored.

Opponent strength uses Stockfish's supported limited-strength controls when available. The opening branch may supply book moves before engine search. Every shipped level is validated through automated sampling and human playtesting for implausible blunders.

### 5.3 Analysis module

For each player decision, the analysis pipeline records:

- position FEN before the move
- played move in UCI and SAN
- engine score before and after the move, normalized to the player's perspective
- best supported candidate moves and principal variation
- evaluation delta and classification
- game phase
- engine identity, depth or time budget, and analysis version

Learning moments are chosen deterministically. Candidate priority combines evaluation impact, recurrence in recent games, curricular relevance, and diversity. The result contains no more than three moments and avoids presenting multiple instances of the same theme unless recurrence is itself the lesson.

The review projection is a pure function of the immutable game record and validated analysis. It reconstructs every saved position and builds separate legal frame sequences for the learner attempt and verified principal variation. The review-training state machine requires theme retrieval, a direct legal board move, deterministic scoring within the configured evaluation tolerance, feedback, same-theme transfer when available, and a parseable training log. Missing transfer evidence is explicitly scheduled for the next game rather than fabricated. Invalid saved moves or engine lines stop the affected set. Full replay, notation, evaluation, and version remain collapsed; the board and current learner action own the primary hierarchy on a dedicated review screen.

### 5.4 Curriculum module

The curriculum module is a pure deterministic function of ordered, completed game evidence plus a versioned policy configuration. It produces:

- strength estimate and uncertainty
- per-theme mastery, evidence count, confidence, and last observed time
- phase and opening-family splits
- next focus theme and explanation code
- target Elo, color, opening branch, and game type

Difficulty is recalculated after each completed game but may change only at the end of a three-game window. Target Elo changes by at most 50 points per window. The scheduler aims for a 45 to 55 percent expected score and alternates focus with consolidation games.

Derived profiles are disposable caches. They must be reproducible from immutable game and evidence records for a specified curriculum version.

### 5.5 Coaching module

The coaching request contains only verified fields required for explanation:

- FEN and move identifiers
- played and candidate moves
- evaluation delta
- game phase
- selected canonical theme
- relevant prior mastery evidence
- allowed numeric values and theme labels

The requested structured output contains `theme`, `evidence`, `explanation`, `reflectionQuestion`, `confidence`, and inference provenance. Validation rejects:

- malformed or extra fields
- an unknown theme
- a move not present in the request facts
- a changed numeric value
- an unsupported factual assertion
- content exceeding UI length limits

When inference is unavailable, times out, or fails validation, the module renders deterministic copy from the same fact packet. Generated prose is presentation data and never changes mastery scores.

### 5.6 PGN import module

The import module accepts `.pgn` files or pasted PGN text containing one or more completed standard-chess games. It must:

1. Parse with bounded input size and game count.
2. Reject malformed, incomplete, unsupported-variant, or illegal game records with per-game errors.
3. Normalize moves and relevant headers into a canonical representation.
4. Calculate a stable fingerprint from the initial position and canonical move sequence.
5. Detect existing local or synchronized records before insertion.
6. Store accepted games atomically with source type, optional source name, original metadata, and import time.
7. Queue accepted games through the normal local analysis pipeline.

Imported moves contribute to theme and phase evidence after full analysis validation. Imported results, opponent ratings, and time-control metadata are untrusted contextual signals. They do not enter the bounded CPU Elo adjustment calculation directly. A future calibrated source adapter may use verified ratings as a low-confidence prior, but that is outside the MVP.

The module must not connect to or inspect an active external game. Automatic account synchronization is outside the MVP.

### 5.7 Lesson playbook engine

Lesson agents are constrained executors, not autonomous curriculum designers. Deterministic application code selects a playbook from verified analysis evidence and the current player profile. The agent receives only the selected playbook, the current step, permitted fact packet, and bounded output schema.

A playbook defines:

- stable ID and semantic version
- theme, learner objective, and prerequisites
- evidence trigger and minimum confidence
- ordered step graph and allowed transitions
- input selector for player positions or canonical examples
- permitted Stockfish facts and generated content slots
- deterministic fallback content
- answer validator and scoring rubric
- mastery evidence emitted by each outcome
- repeat, advance, stop, and next-game reinforcement rules

The MVP step vocabulary is `recognize`, `predict`, `choose`, `explain`, `reflect`, and `apply`. A playbook uses only the steps required for its objective.

The runner validates every agent result before state transition. Gemini may fill explanation, hint-after-answer, reflection-question, and feedback slots. It may not select the objective, add steps, change scoring, emit mastery evidence, skip prerequisites, or choose the next playbook.

When generation is unavailable or invalid, the runner uses the playbook's deterministic content and preserves the same step graph. Lesson completion and mastery updates must therefore be identical for the same learner actions regardless of inference route.

## 6. Persistence model

### 6.1 Immutable records

`GameRecord`

- `id`: stable UUID generated before the first move
- `ownerId` or anonymous installation ID
- timestamps for creation and completion
- initial position, PGN, result, color, time control
- focus and opponent configuration snapshot
- origin: tutor, uploaded PGN, or pasted PGN
- canonical game fingerprint and optional imported headers
- curriculum and configuration versions
- sync status and content hash

`AnalysisRecord`

- game ID and analysis version
- engine build and search settings
- fact packet for each player decision
- selected learning moments
- validation status

`ReviewEvidenceRecord`

- stable review ID, game ID, analysis version, and theme
- first-attempt score and observed hard spot
- due-review date and transfer outcome
- exact next-game reinforcement and completion time

`CoachingRecord`

- game ID and learning-moment ID
- input fact hash
- validated structured output or fallback code
- inference source and latency
- model and prompt versions when applicable

`LessonRun`

- lesson run ID, player ID, and source game IDs
- playbook ID and exact semantic version
- selected position and fact-packet hashes
- ordered step attempts and validated learner answers
- generated content provenance and validation outcomes
- deterministic score, mastery evidence, and transition history
- final reinforcement prescription or stop reason

### 6.2 Derived records

`PlayerProfile` is keyed by the sorted input game IDs plus curriculum version. It contains strength, uncertainty, mastery evidence, recent signals, and the next-game prescription. It may be deleted and rebuilt at any time.

### 6.3 Local transaction rules

- Accepting a move and saving the new game state is one IndexedDB transaction.
- Completion is locally durable before analysis begins.
- Analysis, review evidence, and coaching append immutable records; none mutates the completed PGN.
- IndexedDB version 2 adds analysis and review-evidence stores while preserving version 1 game records.
- The UI shows local save confirmation separately from cloud sync status.

## 7. Synchronization

Completed games are immutable and merge by stable ID and content hash. A hash mismatch for the same ID is quarantined as a data-integrity conflict rather than overwritten. After merge, each device deterministically recomputes its profile from the same eligible records.

Imported records additionally deduplicate by canonical game fingerprint. Records with the same chess moves but different nonessential PGN headers remain one game, while source metadata may be merged without changing analysis evidence.

An in-progress game belongs to its originating device in the MVP. It is backed up but not concurrently editable across devices. Sync retries use bounded exponential backoff and never block local play.

Firestore security rules must restrict records to the authenticated owner. Anonymous local play remains possible without cloud synchronization. App Check protects Firebase endpoints used by the public web application.

## 8. Offline and cache behavior

The service worker caches the application shell, exact Stockfish build, curriculum pack, and static assets as a versioned release unit. An update is activated only when all mandatory assets are available. The previous complete release remains usable if an update fails.

At startup the application reports readiness for:

- application assets
- Stockfish worker
- curriculum pack
- on-device Gemini model
- cloud connection and sync

Only the first three are required to start an offline game. A missing Gemini model selects deterministic coaching. Network changes may alter sync and inference routing but never replace the active engine or game state.

## 9. Lichess data pipeline

Lichess exports are build-time inputs. A reproducible script produces a small, versioned pack containing:

- canonical theme vocabulary and metadata
- legal opening branches grouped by rating band and color
- opening-family and resulting-structure labels needed by the scheduler
- source version, license metadata, generation parameters, and checksums

The pipeline must be deterministic for the same inputs. Generated assets are schema-validated and legality-checked before release. The application never downloads or queries bulk Lichess data at runtime.

## 10. Configuration and versioning

Remote Config may select only values within locally enforced safe bounds, including approved model identifiers, prompt versions, search budgets, and curriculum thresholds. Invalid or unavailable remote values are ignored in favor of the last validated configuration.

Every game snapshots the relevant configuration version. Analysis, curriculum, and prompt changes are versioned independently. Reprocessing never silently changes previously shown coaching; a new result is stored as a new version.

Lesson playbooks are immutable after publication. A changed trigger, step, rubric, transition, or reinforcement rule requires a new semantic version. Active lesson runs finish against their original version. Remote Config may enable an approved version but may not define or mutate playbook logic.

## 11. Security, privacy, and fair play

- Do not transmit a full game history to Gemini when a compact fact packet is sufficient.
- Do not expose engine assistance during an active game.
- Do not provide integration that overlays coaching on third-party live games.
- Do not allow generated output to select a playbook, add or reorder steps, score an answer, or advance lesson state.
- Treat PGN text and headers as untrusted data, enforce size limits, escape displayed metadata, and never execute embedded content.
- Treat generated content, Remote Config, dataset files, and cloud records as untrusted input.
- Validate all worker and network messages at runtime.
- Never place privileged Firebase credentials in the client.
- Provide account data export and deletion before a public release beyond the hackathon.
- Preserve Lichess attribution and dataset metadata even when the source is CC0.
- Comply with Stockfish GPLv3 distribution obligations and publish corresponding source for the shipped build.

## 12. Failure behavior

| Failure                               | Required behavior                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Gameplay worker fails to initialize   | Block game start with a retry action; do not offer a fake opponent.                                      |
| Gameplay worker crashes midgame       | Preserve the position, restart the worker once, and allow retry, resignation, or later resume.           |
| Analysis fails                        | Keep the completed game and allow analysis retry; do not update mastery from partial facts.              |
| Gemini is unavailable or slow         | Show verified deterministic coaching within the SLO.                                                     |
| Gemini output is invalid              | Suppress it, record the validation code, and use deterministic coaching.                                 |
| IndexedDB write fails                 | Keep the board state visible, stop accepting further moves, and offer a recoverable retry or PGN export. |
| Firestore is unavailable              | Mark records unsynced and continue local play.                                                           |
| Remote Config is invalid              | Use the last validated local configuration.                                                              |
| Curriculum pack is corrupt            | Retain the previous valid pack and report update failure.                                                |
| PGN import is malformed or duplicated | Preserve existing data, report a per-game result, and continue processing independent valid games.       |

## 13. Verification requirements

### Unit tests

- curriculum output for scripted histories
- three-game and 50-Elo adjustment limits
- mastery evidence, confidence, and recency decay
- learning-moment selection and deduplication
- coaching schema and fact-trace validation
- playbook selection, step transitions, scoring, fallback equivalence, and version pinning
- merge and content-hash conflict behavior
- PGN normalization, legality validation, fingerprinting, source labeling, and deduplication
- imported evidence affects theme focus but not direct CPU Elo adjustment

### Integration tests

- worker initialization, cancellation, stale-response rejection, and restart
- fixed-PGN analysis stability
- full-game replay plus played-line and verified-alternative frame construction
- mixed valid, invalid, and duplicate multi-game PGN import
- IndexedDB atomic move persistence and migration
- offline cache activation and rollback
- Firestore merge followed by deterministic profile recomputation

### Browser E2E tests

- start, play, complete, review, and begin the prescribed next game
- scrub a completed game, switch between played and better lines, step each line, and move between learning moments
- reload after each game lifecycle state
- network loss before, during, and after a game
- unsupported on-device model and cloud failure fallback
- repeated playbook execution with identical inputs across on-device, cloud, and deterministic content paths
- upload and paste imports, including clear partial-success and duplicate states
- active-game accessibility tree contains no coaching or evaluation
- reference-environment SLO instrumentation

## 14. Build gates

1. Playable gate: a human finishes a game with legal moves, durable state, and a responsive board.
2. Truth gate: a fixed game produces a stable fact packet and validated learning moments.
3. Coaching gate: on-device or cloud output passes validation and fallback is always available.
4. Adaptation gate: scripted histories produce the intended focus and bounded opponent change.
5. Persistence gate: offline reload and online merge preserve every completed game.
6. Submission gate: the seeded judge journey and all SLO evidence run from a production build.

## 15. Reference documentation

- [Firebase AI Logic hybrid inference for web](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)
- [Chrome built-in AI Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Lichess open database](https://database.lichess.org/)
- [Stockfish limited-strength behavior](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html)
- [Lichess fair play policy](https://lichess.org/page/fair-play)
