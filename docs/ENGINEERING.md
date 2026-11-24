# ChessCue Engineering Handbook

Status: Repository baseline  
Applies to: application code, workers, data tooling, tests, Firebase configuration, and deployment

## 1. Engineering priorities

When tradeoffs conflict, use this order:

1. Chess correctness and user data durability
2. Offline play and graceful degradation
3. Deterministic, explainable curriculum behavior
4. Security and privacy
5. Accessibility and responsive interaction
6. Simplicity and maintainability
7. Performance beyond the documented SLOs
8. Delivery speed

The product must never trade a chess-correctness invariant for generated prose, visual polish, or cloud availability.

## 2. Architectural rules

### 2.1 Dependency direction

Dependencies point inward:

```text
UI features
  -> application use cases
      -> domain models and policies

infrastructure adapters
  -> application ports
      -> domain types
```

The domain does not know which UI framework, database, engine transport, or AI provider is used. Infrastructure implements interfaces defined by the application or domain layer.

### 2.2 Core boundaries

- `domain/` contains pure ChessCue policy and deterministic transformations.
- `application/` coordinates use cases and transactions.
- `features/` owns user-facing screens and feature-local presentation state.
- `infrastructure/` owns browser, worker, Firebase, and AI adapters.
- `workers/` owns isolated Stockfish worker entry points and message handling.
- `shared/` contains small cross-cutting utilities with no product policy.

Cross-feature imports are not allowed. Shared behavior moves to `application/`, `domain/`, or `shared/` only when at least two real consumers require it.

### 2.3 Local-first rule

IndexedDB is the source of truth for the active game and completed local records. Firestore is a synchronization target, not the primary game database. A move is accepted only after its local transaction succeeds.

The active game may call only local code:

- chess rules library
- gameplay Stockfish worker
- IndexedDB repository
- cached release assets

It must not wait for Firestore, Remote Config, analytics, App Check, or Gemini.

### 2.4 Chess truth rule

Only the chess rules library and Stockfish may establish legality, terminal state, evaluation, and candidate lines. AI output is untrusted presentation data. A generated statement is displayed only after schema and fact-trace validation.

### 2.5 Determinism rule

The same ordered evidence, curriculum version, and configuration must produce the same profile and next-game prescription. Time is passed explicitly to domain functions. Random choices use an injected seeded generator and store the seed with the resulting prescription.

### 2.6 Versioning rule

Version these independently:

- game record schema
- worker message protocol
- Stockfish build and analysis settings
- analysis fact schema
- curriculum pack and policy
- coaching schema, prompt, and model
- release configuration

Never silently reinterpret an existing record under a new version. Migrations are explicit, tested, and recoverable.

## 3. Folder hierarchy

Use a single application repository. Do not create a monorepo or publish internal packages until a concrete second application requires them.

```text
chess-tutor/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.js
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── .firebaserc
├── .env.example
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   └── offline.html
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   ├── providers.tsx
│   │   └── service-worker.ts
│   ├── domain/
│   │   ├── game/
│   │   ├── analysis/
│   │   ├── curriculum/
│   │   ├── lessons/
│   │   ├── coaching/
│   │   └── import/
│   ├── application/
│   │   ├── ports/
│   │   ├── play-game/
│   │   ├── analyze-game/
│   │   ├── import-games/
│   │   ├── build-profile/
│   │   ├── run-lesson/
│   │   └── sync-games/
│   ├── features/
│   │   ├── play/
│   │   ├── review/
│   │   ├── import-games/
│   │   ├── curriculum/
│   │   ├── lessons/
│   │   ├── profile/
│   │   └── settings/
│   ├── infrastructure/
│   │   ├── chess/
│   │   ├── engine/
│   │   ├── persistence/
│   │   ├── firebase/
│   │   ├── ai/
│   │   ├── config/
│   │   └── telemetry/
│   ├── workers/
│   │   ├── stockfish-game.worker.ts
│   │   ├── stockfish-analysis.worker.ts
│   │   └── protocol.ts
│   ├── generated/
│   │   ├── curriculum-pack.ts
│   │   └── lesson-playbook-registry.ts
│   ├── shared/
│   │   ├── errors/
│   │   ├── result/
│   │   ├── schema/
│   │   └── time/
│   └── test/
│       ├── builders/
│       ├── fixtures/
│       └── setup.ts
├── tests/
│   └── e2e/
│       ├── play/
│       ├── import/
│       ├── offline/
│       ├── recovery/
│       └── accessibility/
├── tools/
│   ├── curriculum/
│   │   ├── build-pack.ts
│   │   ├── schemas.ts
│   │   └── README.md
│   └── benchmarks/
│       ├── engine.ts
│       └── slo.ts
├── data/
│   ├── sources.lock.json
│   └── generated/
├── firebase/
│   ├── emulator/
│   ├── remote-config/
│   └── scripts/
├── docs/
│   ├── PRD.md
│   ├── ARD.md
│   ├── SLO.md
│   ├── ENGINEERING.md
│   └── BRAND.md
└── .github/
    └── workflows/
        ├── verify.yml
        ├── preview.yml
        └── deploy.yml
```

### 3.1 File ownership rules

- A feature owns its route, components, view models, and feature-specific styles.
- Domain folders expose a deliberate `index.ts`; internal files are not imported by path from outside the module.
- Infrastructure adapters do not leak Firebase snapshots, IndexedDB records, worker events, or model SDK objects into application code.
- Generated files live only under `src/generated/` or `data/generated/` and begin with a generated-file warning.
- Test fixtures are immutable and versioned. Large third-party datasets are never committed.

## 4. TypeScript guidelines

### 4.1 Compiler baseline

Enable strict mode and at least:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true
  }
}
```

### 4.2 Types

- Use `unknown` at untrusted boundaries and narrow it with runtime schemas.
- Do not use `any` in product code.
- Avoid `as` casts. Boundary adapters may use a narrowly scoped cast only after runtime validation and with a comment explaining why inference is insufficient.
- Avoid non-null assertions. Model absence explicitly.
- Use discriminated unions for lifecycle, request, and failure states.
- Brand identifiers such as `GameId`, `AnalysisId`, and `CurriculumVersion` to prevent accidental interchange.
- Use readonly inputs and return new domain values instead of mutating shared objects.
- Use ISO timestamps at persistence boundaries and `Temporal` or an injected clock internally when available.

### 4.3 Functions and errors

- Keep domain functions pure and small enough to test through their public behavior.
- Use named parameter objects when a function has more than three arguments or multiple arguments of the same primitive type.
- Use a typed `Result<T, E>` for expected domain and adapter failures.
- Throw only for programmer errors or irrecoverable invariant violations.
- Translate SDK errors into owned error codes at the adapter boundary.
- Error messages shown to users state what happened and what can be done next. Logs contain the technical code and correlation ID.

### 4.4 Async work

- Every cancellable operation accepts an `AbortSignal`.
- Every worker request carries a request ID, position ID, and protocol version.
- Ignore stale worker responses after position changes, cancellation, or reload.
- Do not leave unhandled promises or fire-and-forget work. Background work must be queued through an owned service with observable status.
- Apply timeouts at adapters, not inside pure domain code.

## 5. React and UI guidelines

- Components render state and emit user intent. Business decisions live in application or domain modules.
- Prefer local component state. Introduce shared state only for state that genuinely spans routes or long-lived workflows.
- Do not mirror durable records into a second mutable global store.
- Use explicit view states such as `loading`, `ready`, `empty`, `partial`, and `failed`.
- A route must remain meaningful with JavaScript loading slowly, a disconnected network, and Gemini unavailable.
- Use semantic HTML first. All board actions must be keyboard accessible and announced to assistive technology.
- Provide visible focus, sufficient contrast, reduced-motion support, and touch targets of at least 44 by 44 CSS pixels.
- The active game screen prioritizes board, clocks, and move action. Do not add curriculum detail or engine configuration to it.
- Do not expose coaching, evaluation, or candidate moves in DOM text, accessibility labels, or hidden UI during an active game.

## 6. Data and schema guidelines

- Define runtime schemas beside the owned contract and infer TypeScript types from those schemas.
- Persist only normalized records with explicit `schemaVersion`.
- Completed game records are append-only.
- Derived profiles are caches and must be rebuildable from immutable evidence.
- Store PGN import origin and canonical fingerprint. Treat headers as untrusted text.
- Deduplicate imported games by initial position plus canonical legal move sequence, not by filename or PGN headers.
- Imported ratings and results may be retained as metadata but do not directly enter CPU Elo adjustment.
- Firestore documents remain below conservative size limits. Large fact packets are split by game and analysis version.
- Migrations are idempotent and preserve the source record until the new record is verified.

## 7. Stockfish and worker guidelines

- Pin the exact Stockfish source and binary build. Record its license and checksum.
- Keep gameplay and post-game analysis in separate worker instances or separate bounded queues.
- Initialize and warm the gameplay worker before a game starts.
- Give each search a hard time budget and play the best result from the last completed iteration.
- Normalize engine scores to the player's perspective before domain use.
- Store search settings with every analysis record.
- Never parse ad hoc engine strings outside the engine adapter.
- Provide a single-thread fallback when cross-origin isolation or device capability prevents the preferred build.
- Validate limited-strength levels through automated sampling and human playtesting.

## 8. AI guidelines

- Send the smallest fact packet needed for one learning moment.
- Use structured output with a closed schema and length limits.
- Include only allowed themes, moves, and numeric facts in the request.
- Validate schema, legality, numeric equality, and factual support before display.
- Generated output cannot update mastery, difficulty, or game state.
- A lesson agent executes one deterministically selected, version-pinned playbook step at a time.
- Generated output cannot select the playbook, alter its objective, add or reorder steps, score answers, advance state, or choose reinforcement.
- The lesson runner validates every transition and must produce identical behavior with generated or deterministic wording.
- Record inference source, model version, prompt version, latency, validation result, and fallback code.
- Do not retry generated output indefinitely. One bounded retry is allowed only for transport or schema failure.
- Deterministic coaching must cover every supported learning-moment type.

## 9. Firebase guidelines

- Keep Firebase SDK calls inside `src/infrastructure/firebase/`.
- Use separate Firebase projects for development and production.
- Use the Emulator Suite for local Auth, Firestore, rules, and integration testing.
- Firestore rules default to deny and grant access only to the owning authenticated user.
- Anonymous offline play must not require Firebase initialization to succeed.
- App Check protects public Firebase endpoints in production.
- Remote Config values pass local schema and safe-range validation before activation.
- Client Firebase configuration is environment-specific but not treated as a server secret. Service-account credentials are secrets and never enter the client or repository.
- Cloud Functions are not introduced unless a concrete server-only responsibility appears. The MVP does not require them for game analysis or curriculum computation.

## 10. Testing rules

### 10.1 Test distribution

- Domain unit tests cover deterministic policies and edge cases.
- Adapter contract tests cover storage, workers, AI validation, and Firebase boundaries.
- Integration tests cover transactions, migrations, worker lifecycle, and synchronization.
- Playwright tests cover real user journeys, offline behavior, reload recovery, accessibility, and SLO instrumentation.

Avoid snapshot tests for domain behavior. Use explicit assertions that explain the expected chess or curriculum outcome.

### 10.2 Required journey coverage

At minimum, keep passing journeys for:

1. First launch, asset readiness, and starting a CPU game.
2. Move, reload, resume, complete, review, and start the prescribed next game.
3. Offline start and complete after initial installation.
4. Stockfish worker crash and recoverable resume.
5. Gemini unavailable, invalid, and slow with deterministic fallback.
6. Repeated lesson execution across on-device, cloud, and fallback wording with identical scoring and progression.
7. PGN paste and file upload with valid, malformed, illegal, partial-success, and duplicate inputs.
8. Authenticated merge without loss or profile conflict.
9. Service-worker update failure with the previous release still playable.

### 10.3 Quality gates

Every pull request must pass:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e --project=chromium
```

The exact scripts are created with the application scaffold. A documentation-only change may skip browser tests when CI confirms no executable or deployment file changed.

No merge is allowed with:

- a correctness-invariant failure
- a type, lint, or test failure
- an unexplained flaky test retry
- a decrease in critical domain or adapter coverage
- an unreviewed Firestore rule change
- a service-worker change without offline-update coverage

## 11. Git and review guidelines

- Use short-lived branches and cohesive commits.
- Commit messages use imperative mood and describe the outcome.
- Do not include agent co-author trailers.
- Keep generated build output and local emulator state out of Git.
- Review behavior, failure modes, data compatibility, accessibility, and observability, not only the happy path.
- A pull request that changes a persistent schema includes migration and rollback evidence.
- A pull request that changes the active game includes an E2E recording or reproducible sequence.
- Do not manually modify `CHANGELOG.md`; release tooling owns it if one is introduced.

## 12. Environment structure

| Environment | Purpose                                    | Firebase                                              | Data                           |
| ----------- | ------------------------------------------ | ----------------------------------------------------- | ------------------------------ |
| Local       | Development and automated integration      | Emulator Suite                                        | Disposable fixtures            |
| Preview     | Per-pull-request browser review            | Development project with isolated test user namespace | Seeded non-production data     |
| Staging     | Release-candidate E2E and SLO verification | Dedicated development or staging project              | Seeded and synthetic data only |
| Production  | Public application                         | Dedicated production project                          | Real user data                 |

Production credentials or data must never be used in local, preview, or CI runs. Preview deployments are visibly labeled and cannot write to production.

## 13. Deployment structure

### 13.1 Deployment topology

```text
GitHub repository
  | pull request
  v
Verify workflow
  | format, lint, types, tests, build, E2E
  v
Firebase Hosting preview channel
  | owner review and automated smoke test
  v
Staging release
  | full E2E, offline, migration, security-rules, and SLO checks
  v
Production release
  | Firestore rules/indexes, validated configuration, Hosting
  v
Post-deploy smoke test and release evidence
```

### 13.2 Release artifact

A release is one immutable, traceable unit containing:

- hashed application JavaScript and CSS
- service worker and web app manifest
- exact Stockfish WASM and worker assets
- exact curriculum pack and schema
- release metadata with Git commit, build time, and component versions
- Firebase Hosting configuration and security headers

The build must be reproducible from the lockfile and Git commit. CI builds the artifact once. Promotion reuses that artifact rather than rebuilding different bits for each environment.

### 13.3 Hosting and cache policy

- `index.html`: `Cache-Control: no-cache`
- service worker: `Cache-Control: no-cache`
- hashed application assets: `Cache-Control: public, max-age=31536000, immutable`
- versioned Stockfish and curriculum assets: immutable with content hashes
- manifest: short cache with revalidation
- offline fallback: bundled with the release

Use Content Security Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and restrictive permissions policy. When the preferred Stockfish build uses shared memory, serve compatible COOP and COEP headers and verify `crossOriginIsolated`; otherwise select the single-thread fallback.

### 13.4 PWA update policy

- Download a new release in the background.
- Activate only after all mandatory assets pass checksum and schema validation.
- Never replace an active game mid-session.
- Prompt the player to update after the game or on the next safe navigation.
- Retain the previous complete cache until the new release successfully activates.
- Roll back to the previous Hosting version if post-deploy smoke tests fail.

### 13.5 Deployment order

1. Verify production configuration and target project.
2. Run format, lint, type, unit, integration, build, E2E, and security-rule tests.
3. Verify curriculum and Stockfish checksums and license metadata.
4. Apply backward-compatible Firestore rules and indexes.
5. Publish validated Remote Config values when required.
6. Deploy the already-built Hosting artifact.
7. Run production smoke tests for load, offline readiness, game start, PGN import, and deterministic coaching fallback.
8. Record release evidence and retain the previous Hosting version for rollback.

Schema-breaking changes require an expand, migrate, contract sequence across separate releases. Hosting rollback must remain compatible with the currently deployed Firestore rules and data.

## 14. CI workflows

### `verify.yml`

Runs on every pull request and protected-branch push. It installs from the lockfile, validates generated assets, runs all quality gates, builds the PWA, tests Firestore rules with emulators, and uploads test and SLO artifacts.

### `preview.yml`

Runs after verification for authorized pull requests. It deploys the immutable build to a Firebase Hosting preview channel, runs a smoke test against the preview URL, and posts the result to the pull request.

### `deploy.yml`

Runs only from a protected release tag or manual production approval. It promotes the verified artifact, deploys Firebase changes in the documented order, runs post-deploy smoke tests, and exposes an explicit rollback action.

## 15. Observability

Record the SLI events defined in `docs/SLO.md` with coarse device capability, release version, and component versions. Do not record PGN, FEN, prompt content, generated coaching, or personal identifiers in performance telemetry without explicit opt-in.

Operational views must distinguish:

- gameplay, analysis, coaching, import, and synchronization failures
- on-device, cloud, and deterministic coaching paths
- first installation, warm cache, and offline sessions
- current and previous release versions

Every failure log has an owned error code, release version, correlation ID, and safe diagnostic context. User-facing errors never expose stack traces, raw SDK messages, prompts, or Firebase document paths.

## 16. Definition of done

A change is done when:

- behavior and acceptance criteria are implemented
- relevant tests reproduce the user journey and failure path
- all quality gates pass without unexplained retries
- accessibility and responsive UI are inspected
- offline, reload, and fallback behavior are verified when affected
- schemas and migrations are backward compatible
- logs and metrics can distinguish success from failure
- the owning PRD, ARD, SLO, or engineering documentation is current
- deployment and rollback are proven for infrastructure changes
