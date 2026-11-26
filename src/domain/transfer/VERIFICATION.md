# Generated learning material

The installed pack contains real game positions mined by code. The release artifact records the Gemini model, inference route, generation run, prompt and response fingerprints, source game URL and ply, and engine evidence. The source PGN supplies historical continuations. Stockfish scores them independently. The runtime checks legal replay and rejects obsolete saved roadmaps.

Regenerate from a public [Lichess puzzle CSV](https://database.lichess.org/#puzzles) and a [PGN Mentor score collection](https://github.com/rozim/ChessData/tree/master/PgnMentor). The puzzle miner plays the CSV's first move before evaluating the solver's position. Its two-example quota is a maximum per theme. A theme can have fewer verified examples.

Run from the repository root using an installed dependency set:

```sh
node scripts/material/mine.mjs puzzles.csv games.pgn SOURCE_PGN_URL /tmp/chesscue-evidence.json
node scripts/material/author.mjs /tmp/chesscue-evidence.json src/domain/material/starter.generated.json
node scripts/material/demo.mjs games.pgn src/domain/material/starter.generated.json demo/chesscue-demo.pgn
```

The author uses a dedicated Gemini API key supplied through the environment variable `GEMINI_API_KEY`, or the installed Chrome on-device model in a dedicated `CHESSCUE_NANO_PROFILE`. The optional `CHESSCUE_NANO_DEV=1` enables Chrome's developer model settings in that profile. The author publishes only after every required item validates. Regenerating a pack can produce different language or engine results. Ship the verified artifact so an offline install can use the exact release without making model requests.

For the current pack, mining used the first 3,500 records of the public Lichess puzzle CSV and the Mar del Plata 1957 PGN collection. The archive was selected by sorting eligible tournament-file blob hashes rather than choosing a game or exercise by hand. The scripts perform bounded 700 ms MultiPV 3 searches with the Stockfish 19 Lite single-thread engine. Starter questions were authored with the on-device Gemini Nano route. Historical headings render the source move number and side. Explanations reproduce selected evidence from the game or the engine. The Cloud research path looks up new scores online and checks the selected position with the local engine before offering it.

## Shared library sync

`Sync puzzle library` runs at 03:23 UTC daily on the default branch and supports manual dispatch. The job streams the CC0 puzzle export and processes up to 350 rows or 12 verified candidates per run. It resumes from its saved scan offset. It independently replays the cited Lichess game, checks each recorded solver move with Stockfish, and asks Gemini Cloud to propose the motif and write the question. Publication retains the source IDs and hashes. A hash of the playable board and accepted answers avoids publishing the same puzzle twice. The scan offset advances after a successful batch.

Seed publication requires `LIBRARY_FIRESTORE_SERVICE_ACCOUNT` and `GCP_WORKLOAD_IDENTITY_PROVIDER` as GitHub secrets and `LIBRARY_FIREBASE_PROJECT` as a repository variable. The incremental generation step also requires `LIBRARY_GEMINI_API_KEY`. The dedicated service account needs Firestore document read and write permissions. The action exchanges its GitHub identity for a short-lived access token. App clients may only read the published collections. This uses the existing Spark database.

Run a local verification without publishing or using Gemini credentials:

```sh
node scripts/material/sync-library.mjs puzzles.csv --dry-run --verify-sources
```

This publishing slice creates `puzzleLibrary`, `puzzleMotifs` and `librarySync/lichess`. The scheduler still needs to consume the shared catalog, and the remaining hardcoded classifiers still need migration. Lichess export tags serve as source evidence for Gemini, and the proposed motif name can extend the catalog.

### Bootstrap the shared library

The bootstrap fixture is `scripts/material/library-seed.generated.json`. It is prepared from the first 100,000 rows of the official CC0 Lichess puzzle export. The raw sample is kept locally under `data/generated/`. The generator finds frequent, well-supported source themes, then selects two puzzles each from three Lichess rating bands. It replays the original game at the cited ply and checks each recorded solver move with Stockfish. The installed OpenAI edition reuses those positions and source references, rechecks the solver moves, and uses the Codex-authored course copy and position questions from `scripts/material/openai-curriculum-draft.json`. Lichess ratings order the initial practice sets. Later difficulty estimates can use ChessCue attempts.

```sh
node scripts/material/seed-library.mjs data/generated/lichess-puzzles-bootstrap-100k.csv scripts/material/library-seed.generated.json
node scripts/material/rebuild-library.mjs scripts/material/library-seed.generated.json scripts/material/library-openai.generated.json --codex-draft scripts/material/openai-curriculum-draft.json
node scripts/material/publish-seed.mjs scripts/material/library-openai.generated.json --dry-run
```

The sync job validates and publishes the seed before processing its first incremental batch. A private marker keyed by the generation run makes repeat publication idempotent. Clients may read published curricula and puzzles. Earlier practice records can reference the same immutable version as additional material enters the catalog.

## Installed curriculum

OpenAI Codex authored the objectives, questions and explanations in scripts/material/curriculum-draft.json. Generate the installed bundle from the local CC0 Lichess sample. The generator checks the original setups and the solver moves in each sourced continuation. It requires 21 completed units with distinct positions.

    node scripts/material/build-curriculum.mjs data/generated/lichess-puzzles-bootstrap-100k.csv scripts/material/curriculum.generated.json
