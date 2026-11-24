# ChessCue submission draft

## Required links

- Live project: <https://chesscue-hybrid-ai-2026.web.app>
- Public source repository: <https://github.com/Hyunkim95/chesscue>
- Demo video: pending public YouTube upload

## Tagline

Play complete chess games, then let each game shape what you practise next.

## Project description

ChessCue is a local-first adaptive chess tutor for developing players who learn better through games than through lesson libraries. The player completes a normal game against Stockfish without hints or evaluation. ChessCue analyzes the finished game locally, selects the most useful learning moment, rewinds the board, and lets the player try the decision again. The next CPU game then changes its opening behavior to create more opportunities to practise the detected weakness.

Stockfish is the authority for legality, evaluation, and candidate lines. Deterministic, versioned playbooks control scoring, progression, review scheduling, and the next-game focus. Firebase AI Logic may personalize only bounded coaching language. Generated text cannot change chess facts, mastery, difficulty, or progression.

## How Firebase AI Logic is used

The Web app creates a Firebase AI Logic `GenerativeModel` with `InferenceMode.PREFER_ON_DEVICE`. A review-board move is the user activation that initializes the on-device model. Supported Chrome desktop installations use Gemini Nano; otherwise Firebase AI Logic falls back to the configured Gemini cloud model.

Each request contains a compact verified packet: the position, theme, attempted move, verified candidate move, acceptance result, and deterministic explanation. Structured output is validated against an allowlist of moves, squares, and numbers. Invalid output, timeout, missing configuration, or model unavailability returns the deterministic explanation. The interface displays whether accepted coaching came from Gemini Nano on device, Gemini cloud fallback, or verified local fallback.

Firebase App Check protects Firebase AI Logic. Firestore rules default to deny and permit authenticated users to create and read only their own immutable game records. Firebase Hosting serves the installable PWA and Stockfish Web Worker assets with explicit security and caching headers.

## Features

- Complete legal games against Stockfish 19 Lite in a Web Worker
- No live coaching or hidden engine information during play
- Automatic local analysis and deterministic learning-moment selection
- Reversible board-based review with plain-language feedback
- Verified coach lines and opponent replies
- Optional similar-position transfer challenges
- Persistent mastery evidence and bounded three-game Elo adjustment
- Focus-specific opening policy for the next CPU game
- PGN paste and file import with learner color, validation, and deduplication
- Offline-after-setup PWA behavior with deterministic coaching fallback
- Firebase AI Logic hybrid coaching with visible inference provenance

## Value proposition

Most chess tools separate playing, analysis, lessons, and puzzles. ChessCue turns the player's own decisions into one continuous loop: play, understand, retry, and encounter the idea again in the next real game. It reduces the burden of choosing what to study while keeping every factual and adaptive decision deterministic and auditable.

## Work completed during the submission period

During the hackathon period, ChessCue was built into a functioning Chrome PWA with local Stockfish gameplay and analysis, durable evidence, imported-game analysis, playbook-constrained review, verified transfer positions, adaptive opening behavior, Firebase infrastructure, and Firebase AI Logic hybrid inference. The branded interface, offline support, test suite, security rules, and submission materials were also completed during this period.

## Testing instructions

1. Open the hosted URL in Chrome desktop.
2. Play a move and confirm Stockfish replies without hints or evaluation.
3. Resign to reach review quickly, or complete the game normally.
4. Wait for local analysis, then move directly on the rewound board.
5. Observe the clear result, undo, coach line, opponent reply, and feedback source.
6. Finish review and open Training plan to see mastery evidence and the next focus.
7. Import a completed PGN under Bring games to show external evidence changing focus without directly changing CPU Elo.
8. Disable the network after the first load and confirm gameplay and deterministic review remain available.

For a fast synthetic demonstration, use `demo/chesscue-demo.pgn` and follow `demo/README.md`.

### Verify Gemini Nano on a second desktop

Use a regular Chrome desktop profile with the Prompt API enabled. Check the [Chrome hardware requirements](https://developer.chrome.com/docs/ai/prompt-api#review_the_hardware_requirements) and follow the [Firebase on-device setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started#step_1_set_up_chrome_and_the_prompt_api_for_on-device_inference). The hosted app works without a repository checkout or a sign-in.

1. Open the hosted app in a fresh browser profile. Play **e4** and wait for Black’s reply.
2. Resign. In the rewind, select the knight on **g1**, move it to **f3**, and click **Play this move**. This starts Chrome’s model initialization on a user gesture.
3. If the model is downloading, wait until it is available, choose **Undo and try another move**, and replay **Nf3**.
4. Capture the board and the completed **Hybrid coach** note together. Verify that it reads **Feedback source: Gemini Nano on device**. Save a short recording for the demo and note the Chrome version.

The cloud path has already been verified on the hosted app with App Check enforced. The on-device label is the pass condition for this separate check.

## Demo video outline, maximum 3 minutes

### 0:00-0:20 - Problem and promise

Developing players can play many games but still struggle to decide what to study. ChessCue makes the games themselves the curriculum.

### 0:20-0:50 - Unassisted game

Show the focus, adaptive CPU rating, normal starting position, and several moves. Emphasize that no hints or engine evaluation appear during play.

### 0:50-1:35 - Rewind review

Finish or resign. Show automatic Stockfish analysis, the rewound position, a move attempt, clear feedback, undo, the coach move, and the opponent reply.

### 1:35-2:05 - Hybrid AI

Show the Hybrid coach note and its visible inference source. Explain that Firebase AI Logic prefers Gemini Nano on device and falls back to the cloud, while deterministic validation protects chess facts and progression.

### 2:05-2:35 - Adaptive loop

Finish review, show updated mastery and next focus, then start the next game and explain how the opening policy quietly creates more practice opportunities.

### 2:35-2:55 - Imported games and offline behavior

Show PGN import briefly, then mention that gameplay, Stockfish analysis, and deterministic coaching continue offline after setup.

### 2:55-3:00 - Close

ChessCue: play, understand, and meet the lesson again in your next game.

## Final submission checklist

- [ ] Select Web (Chrome) as the submission platform
- [x] Firebase project and Web app configured
- [x] Firebase AI Logic enabled with App Check enforcement
- [x] Cloud fallback verified on the hosted build
- [ ] Gemini Nano on-device inference verified on the hosted build
- [x] Firestore emulator rules suite passes
- [x] Firebase Hosting deployment smoke-tested
- [x] Public repository URL added and Apache-2.0 visible
- [x] Hosted project URL added
- [ ] Public YouTube video added and no longer than 3 minutes
- [ ] Devpost text reviewed in English
- [ ] Existing-project disclosure and submission-period work confirmed
- [ ] Eligibility and third-party license review completed by the entrant
