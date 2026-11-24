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
- deterministic curriculum and bounded CPU difficulty policy
- versioned lesson-playbook execution with validated deterministic fallback
- optional Firebase persistence and deployment adapters

The interactive lesson screen, real Firebase project configuration, and real Gemini provider remain later integration work. No deployment has been performed.

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
