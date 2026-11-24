# ChessCue

A local-first PWA where complete games shape the curriculum. Stockfish owns chess truth, deterministic playbooks own lesson progression, and Gemini may personalize only validated wording slots.

## Test locally

```bash
pnpm install
pnpm dev --host 127.0.0.1
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

The current checkpoint supports:

- complete legal games against Stockfish 19 lite in a Web Worker
- versioned focus-opening policies that steer early Stockfish replies without forcing learner moves
- durable local game state and offline PWA startup
- PGN paste or file import with learner color, validation, and deduplication
- rewind-style Stockfish review with a direct board retry and optional transfer challenges
- automatic post-game analysis with durable analysis and review evidence
- a real profile recomputed from game history, with bounded three-game CPU difficulty changes
- versioned lesson playbooks that constrain analysis, feedback, and follow-up generation behind the review experience
- a Firebase hybrid provider that prefers on-device inference and falls back to cloud when configured
- optional Firebase persistence and deployment adapters

Real Firebase project configuration, App Check, authentication, cloud synchronization for adaptive evidence, and live Gemini inference remain environment work. No deployment has been performed.

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
- [Brand system](docs/BRAND.md)
