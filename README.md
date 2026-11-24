# Adaptive Chess Tutor

A local-first PWA where complete games shape the curriculum. Stockfish owns chess truth, deterministic playbooks own lesson progression, and Gemini may personalize only validated wording slots.

## Test locally

```bash
pnpm install
pnpm dev --host 127.0.0.1
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

The current checkpoint supports:

- complete legal games against Stockfish 19 lite in a Web Worker
- durable local game state and offline PWA startup
- PGN paste or file import with validation and deduplication
- replay-first Stockfish review with full-game scrubbing and played-versus-better line comparison
- deterministic curriculum and bounded CPU difficulty policy
- an interactive versioned playbook lesson with validated deterministic fallback
- a Firebase hybrid provider that prefers on-device inference and falls back to cloud when configured
- optional Firebase persistence and deployment adapters

Real Firebase project configuration, App Check, authentication, and live Gemini inference remain environment work. Imported-game analysis also needs the learner's color selection before it can feed personalized lessons. No deployment has been performed.

## Verify

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e --project=chromium
```

The Firestore rules integration suite additionally requires Java 21 and the Firebase emulator.

## Specifications

- [Product requirements](docs/PRD.md)
- [Architecture requirements](docs/ARD.md)
- [Lesson playbook model](docs/LESSON_PLAYBOOKS.md)
- [Service level objectives](docs/SLO.md)
- [Engineering handbook](docs/ENGINEERING.md)
