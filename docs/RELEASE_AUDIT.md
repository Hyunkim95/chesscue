# Submission release audit

Audit date: 2026-11-25

Target: Firebase #BuildHybridAI 2026 Web/Chrome submission

Deadline: 2026-11-30 2:00 PM Pacific Time

## Official Stage One requirements

| Requirement                             | Current evidence                                                                                                                                                               | Status                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Functioning Web/Chrome project          | Production build and 12 Chromium journeys pass locally, including exact in-progress resume after reload.                                                                       | Proven locally                         |
| Firebase AI Logic used at runtime       | The hosted review received HTTP 200 from Firebase AI Logic and displayed the generated feedback with cloud provenance.                                                         | Cloud verified on Hosting              |
| Gemini Nano with cloud fallback         | Hosted Chrome 158 review showed Gemini Nano on-device provenance with zero cloud generation requests. A separate hosted review confirmed Gemini cloud fallback.                | Both routes verified on Hosting        |
| App Check                               | The Web app uses Fraud Defense registration. The console shows enforcement and the hosted token exchange returned HTTP 200.                                                    | Verified on Hosting                    |
| Public open-source repository           | <https://github.com/Hyunkim95/chesscue> is public, contains source and assets, and GitHub detects Apache-2.0.                                                                  | Proven                                 |
| Source, assets, and instructions        | Source, exact Stockfish assets and checksums, setup instructions, and test commands are present.                                                                               | Proven locally                         |
| Text description and value proposition  | `docs/SUBMISSION.md` contains a submission-ready draft and disclosure of submission-period work.                                                                               | Draft complete                         |
| Public YouTube demo, at most 3 minutes  | The 61-second local export shows hosted gameplay, Gemini cloud fallback, Gemini Nano on-device feedback, and PGN-driven adaptation. English captions are visible in the video. | Video verified locally, upload pending |
| Accessible project for judges           | <https://chesscue-hybrid-ai-2026.web.app> served a playable PWA with a Stockfish reply, reload, and AI review.                                                                 | Hosted smoke test passed               |
| English support                         | Product and submission materials are in English.                                                                                                                               | Proven                                 |
| Entrant eligibility and IP confirmation | Apache-2.0, Stockfish GPL notice, source links, and dependency inventory are present.                                                                                          | Entrant confirmation pending           |

## Verified local gates

- Formatting, lint, and strict type checks pass.
- 164 unit tests pass.
- All 8 integration tests pass with the Firestore emulator.
- Production PWA build passes.
- All 12 Chromium end-to-end journeys pass.
- Stockfish 19 Lite source, GPL license, and SHA-256 checksums are recorded.
- Firestore rules default to deny, scope reads and creates to the authenticated owner, and prohibit updates.
- GitHub Actions Verify run [45469118948](https://github.com/Hyunkim95/chesscue/actions/runs/45469118948) passed the build, unit, integration, Firestore emulator, and Chromium gates from the public `main` branch at `2d37ac1`.
- Lighthouse scores 100 for Accessibility, Best Practices, and SEO; Agentic Browsing scores 98 with valid `llms.txt` and ARD metadata plus one low-severity warning because ChessCue publishes a Web app rather than a standard agent protocol artifact.

## Hosted verification

- Firebase Hosting serves the production build at <https://chesscue-hybrid-ai-2026.web.app>. Chromium played a move, received a Stockfish reply, and restored both moves after reload. The deployed policy grants WebAssembly compilation and revalidates the root HTML.
- Firebase lists the Web app as registered with Fraud Defense and Firebase AI Logic as enforced under App Check. The score-based site key is restricted to the `web.app` hostname.
- In a fresh Chromium session on the hosted build, starting a game, resigning, and retrying the position produced HTTP 200 from the Enterprise App Check token exchange and Firebase AI Logic `generateContent`. The review displayed “Feedback source: Gemini cloud fallback.” A separate headless session received HTTP 400 during token exchange.
- After freeing storage, Chrome 158 downloaded Gemini Nano in an isolated test profile. Hosting build `index-Crq_gXQq.js` displayed “Feedback source: Gemini Nano on device” 29 seconds after the review move, with zero requests to the cloud generation endpoint. The build allows a bounded cold start while verified move feedback remains available.
- A separate hosted browser journey imported the synthetic demo PGN. The focus changed from Calculation to One Move Threat, and the opponent remained at 1450 Elo.

## Remaining submission gates

1. Publish the demonstration video on YouTube and add its public URL.
2. Complete the Devpost form and have the entrant confirm eligibility, ownership, and third-party compliance.

This audit does not treat local mocks, skipped tests, configuration files, or unexecuted workflows as proof of external deployment.
