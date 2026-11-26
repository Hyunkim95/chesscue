# ChessCue

A local-first PWA where complete games shape the curriculum. Stockfish owns chess truth, deterministic playbooks own progression, and Firebase AI Logic hybrid inference personalizes only validated coaching slots.

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
- live review coaching through Firebase AI Logic, preferring Gemini Nano on device and falling back to Gemini in the cloud
- optional Firebase persistence and deployment adapters

Without Firebase configuration, ChessCue remains fully playable and uses verified deterministic coaching. A configured deployment requires App Check before hybrid coaching is enabled.

## Firebase AI Logic setup

ChessCue uses the Firebase Web SDK with `InferenceMode.PREFER_ON_DEVICE`. On supported Chrome desktop installations, coaching runs with Gemini Nano. When the on-device model is unavailable or still downloading, Firebase AI Logic uses the configured Gemini cloud model. The interface displays the inference source after each generated note.

1. Create or select a Firebase project and register a Web app.
2. In Firebase AI Logic, choose the Gemini Developer API and complete its guided setup.
3. Register a score-based reCAPTCHA Enterprise key for your hosted domain in Web App Check, then enforce App Check for Firebase AI Logic.
4. Copy `.env.example` to `.env.local` and fill in the public Firebase Web configuration.
5. For local development only, set `VITE_FIREBASE_APP_CHECK_DEBUG=true`, load the app, and register the printed debug token in the Firebase console. Never commit the token.
6. Use Chrome desktop 139 or later with the Prompt API enabled to demonstrate on-device inference.

The first review move is a user gesture that starts on-device model initialization. Generated output is schema-validated against the supplied moves, squares, and numbers. Invalid, unavailable, or timed-out generation falls back to the same deterministic explanation without affecting scoring or progression.

See the [Firebase hybrid Web setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started).

## Verify

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e --project=chromium
```

The Firestore rules integration suite additionally requires Java 21 and the Firebase emulator.

## License

Apache-2.0. See [LICENSE](LICENSE).

Third-party components retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Shared PGN collection

Importing a completed PGN contributes the entire score to the shared collection. Past private imports are included only if someone submits them again. New offline submissions upload when ChessCue is open and connected.

Enable Anonymous in Firebase Authentication for guest submissions. Deploy the Firestore rules and configure the existing Sync puzzle library workflow with `LIBRARY_FIREBASE_PROJECT`, `GCP_WORKLOAD_IDENTITY_PROVIDER` and `LIBRARY_FIRESTORE_SERVICE_ACCOUNT`. Its publisher needs Firestore document read, create and delete access. Each run archives up to 25 submissions, records mate-in-one opportunities for coaching research and publishes eligible unrated puzzles with source replays. Submission mining runs independently of Gemini.

## Account sync

Account uses Google sign-in and displays the provider name and email. Enable Google in Firebase Authentication, authorize the hosting domain, and deploy the repository's Firestore rules for the target project. Hosting allows the configured ChessCue Firebase auth iframe and the Google popup. Set the auth iframe origin in `firebase.json` when targeting another project.

Run the two-browser account journey and SLO-007 emulator workload with Java 21 and Chromium installed:

```sh
pnpm exec firebase emulators:exec --only auth,firestore --project demo-chesscue-account 'VITE_ACCOUNT_EMULATORS=true pnpm exec playwright test tests/e2e/account'
```

## Hackathon coaching baseline

In Practice or Review, try a move. When Stockfish finds a costly mistake, Rook shows what the opponent can do next. Retry the move from the original position, or ask Rook to explain the stronger move. The explanation appears only when the local engine and chess rules support the comparison. After installation this flow works offline. Rated games remain unassisted.

## Desktop Chrome extension

Run `pnpm build:extension`, open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**. Select `extension/dist`. Click the ChessCue toolbar icon to play in the Chrome side panel. On a finished Lichess game, **Practise this game** opens its Stockfish review alongside the game. If you are viewing someone else's game or playing anonymously, choose the side to review. Previously imported games can be reopened from ChessCue offline. The extension has its own local history.

For a hackathon cloud demo, configure the Firebase web variables in `.env.local` and set `VITE_FIREBASE_APP_CHECK_DEBUG=true` before building. In the dedicated demo Chrome profile, open a review, then register the Firebase-generated debug token from the extension page's DevTools console under **Firebase Console → App Check → web app → Manage debug tokens**. Keep the token private and revoke it after filming. Registration is per profile and extension ID. Production attestation for a public store release remains outstanding. In review, try a move and expand **Why this matters** to see the coaching source.

`pnpm test:extension` builds the unpacked extension and tests the Lichess handoff, repeat visits, active-game rejection and offline play using Chromium.
