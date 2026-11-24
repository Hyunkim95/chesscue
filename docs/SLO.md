# Adaptive Chess Tutor Service Level Objectives

Status: MVP reliability baseline  
Related documents: `docs/PRD.md`, `docs/ARD.md`

## 1. Scope

These objectives protect the playable learning loop. Gameplay has stricter availability requirements than analysis, coaching, or cloud synchronization.

The reference environment is current supported Chrome desktop with at least four logical CPU cores, 8 GB RAM, and a warm application cache. On-device and cloud inference are measured and reported separately. Cold first installation and on-device model download are reported but excluded from the gameplay objectives.

## 2. Service level indicators and objectives

| ID | Journey | Indicator | Objective | Failure behavior |
| --- | --- | --- | --- | --- |
| SLO-001 | Player move | Time from accepted pointer or keyboard action to rendered board and successful local transaction | 99% within 100 ms over a rolling 1,000-move window | Never wait for Stockfish, Firebase, or Gemini before rendering and saving. |
| SLO-002 | CPU reply | Time from durable player move to visible CPU move | 95% within 2 seconds; every bounded search ends within 5 seconds on the reference environment | Stop at the search budget and play the best result from the last completed iteration. |
| SLO-003 | First diagnosis | Time from local game completion to the first verified learning moment | 95% within 10 seconds | Show deterministic Stockfish findings as soon as available; coaching may continue independently. |
| SLO-004 | Coach result | Time from coaching request to validated coaching or deterministic fallback | 99% within 20 seconds | Reject timeout, invalid schema, or unsupported claims and render deterministic copy. |
| SLO-005 | Progress durability | Proportion of locally confirmed completed games restored after reload | 99.9% over a rolling 1,000-game test and production-event window | Keep the game locally queued for sync and show unsynced state without blocking play. |
| SLO-006 | Cached play availability | Successful game starts when mandatory release assets are cached and the network is unavailable | 99.9% over a rolling 1,000-start window | Retain the previous complete release if an update or cache activation fails. |
| SLO-007 | Cloud synchronization | Locally queued completed games uploaded and acknowledged while authenticated and continuously online | 99% within 60 seconds | Retry in the background and preserve the immutable local record. |
| SLO-008 | PGN import intake | Time to validate, fingerprint, deduplicate, and durably store one standard game of at most 200 plies | 99% within 1 second | Report the per-game error without modifying existing records; analysis remains asynchronous. |
| SLO-009 | Lesson readiness | Time from eligible verified evidence to selected playbook and first deterministic step | 99% within 500 ms | Start the versioned playbook with deterministic content while optional generated wording remains independent. |

## 3. Correctness invariants

Correctness has no error budget. A failing claim is suppressed rather than displayed.

- 100% of accepted player and CPU moves are legal in the recorded position.
- 100% of displayed move claims reference a legal move present in the validated fact packet.
- 100% of displayed numeric chess claims match an allowed fact value and perspective.
- 100% of mastery updates derive from complete, validated analysis records.
- 100% of completed-game sync conflicts are detected by ID and content hash rather than silently overwritten.
- 100% of accepted imported games pass legality validation and canonical-fingerprint deduplication.
- Imported results and ratings never directly change adaptive CPU Elo.
- Identical evidence and configuration always select the same playbook version.
- Generated output never changes lesson steps, scoring, transitions, mastery evidence, or reinforcement.
- No live evaluation, hint, suggested move, or learning moment is exposed before game completion.

## 4. Availability boundary

Once the application shell, Stockfish build, and curriculum pack are cached, the user can start and finish CPU games without Firebase or Gemini. These dependencies degrade independently:

1. Firestore failure delays synchronization only.
2. Remote Config failure uses the last validated configuration.
3. Cloud Gemini failure routes to on-device Gemini when available, otherwise deterministic coaching.
4. On-device Gemini absence does not affect game, analysis, curriculum, or fallback coaching.
5. Stockfish or local persistence failure blocks new moves because continuing would violate chess truth or durability.

## 5. Measurement

### 5.1 Client instrumentation

The client records monotonic timestamps for move acceptance, local transaction completion, engine request and reply, game completion, first verified moment, coaching request, validated result, fallback, sync queue, and sync acknowledgement.

Each event includes release, engine, curriculum, configuration, browser capability, inference source, and coarse device-class versions. Events exclude PGN, FEN, prompt content, generated prose, and direct personal identifiers unless the user has explicitly opted into diagnostic data.

### 5.2 Test evidence

Before release, automated tests run at least:

- 1,000 legal move interactions for SLO-001
- 300 CPU searches across the three shipped levels for SLO-002
- 100 representative completed games for SLO-003
- 100 coaching requests per available inference route plus forced failures for SLO-004
- 1,000 save, close, reopen cycles for SLO-005
- 1,000 offline cached starts, including interrupted update cases, for SLO-006
- 300 authenticated sync cycles with injected disconnects for SLO-007
- 1,000 valid, malformed, illegal, and duplicate single-game imports for SLO-008
- 1,000 eligible evidence profiles across all enabled playbooks for SLO-009

P50, P95, P99, success count, and failure classification are reported. Averages alone are insufficient.

## 6. Error budgets and release policy

For objectives below 100%, the error budget is the complement of the target over its stated window. A release candidate must not ship if:

- any correctness invariant fails
- SLO-001, SLO-002, SLO-005, SLO-006, SLO-008, or SLO-009 misses its target in the reference test run
- a regression consumes more than half of an objective's error budget compared with the previous accepted build
- the deterministic coaching fallback is not independently proven
- the prior complete offline release cannot survive a failed update

SLO-003, SLO-004, and SLO-007 may degrade without blocking gameplay, but a missed target must be visible in the submission evidence and have a bounded failure mode.

## 7. Operational views

The MVP reliability dashboard or submission report shows:

- move-render and local-save latency
- CPU reply latency by opponent level
- analysis time and first-moment latency
- coaching latency, source, validation failures, and fallback rate
- completed-game save and restore success
- offline start success by release version
- sync queue age and acknowledgement latency
- PGN intake latency and accepted, rejected, and duplicate counts
- lesson selection latency, playbook version, fallback rate, and invalid agent-output count

No objective is claimed from a demo alone. Each claim requires the reference test sample or equivalent production telemetry.
