# Submission release audit

Audit date: 2026-11-24  
Target: Firebase #BuildHybridAI 2026 Web/Chrome submission  
Deadline: 2026-11-30 2:00 PM Pacific Time

## Official Stage One requirements

| Requirement                             | Current evidence                                                                                                                                                                                 | Status                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Functioning Web/Chrome project          | Production build and 12 Chromium journeys pass locally, including exact in-progress resume after reload.                                                                                         | Proven locally                            |
| Firebase AI Logic used at runtime       | Live review imports the Firebase AI Logic hybrid provider, initializes the device model from a review-board gesture, calls `generateContent`, validates structured output, and shows provenance. | Code proven; hosted call pending          |
| Gemini Nano with cloud fallback         | Provider uses `InferenceMode.PREFER_ON_DEVICE` and reports `ON_DEVICE` or `IN_CLOUD`; unit tests cover accepted on-device output and deterministic rejection.                                    | Code proven; real device pending          |
| App Check                               | Provider is enabled only when Firebase initializes with App Check; production CSP permits reCAPTCHA; local debug mode is opt-in.                                                                 | Code proven; console enforcement pending  |
| Public open-source repository           | <https://github.com/Hyunkim95/chesscue> is public, contains source and assets, and GitHub detects Apache-2.0.                                                                                    | Proven                                    |
| Source, assets, and instructions        | Source, exact Stockfish assets and checksums, setup instructions, and test commands are present.                                                                                                 | Proven locally                            |
| Text description and value proposition  | `docs/SUBMISSION.md` contains a submission-ready draft and disclosure of submission-period work.                                                                                                 | Draft complete                            |
| Public YouTube demo, at most 3 minutes  | Timed demo script is drafted in `docs/SUBMISSION.md`.                                                                                                                                            | Recording and upload pending              |
| Accessible project for judges           | Firebase Hosting configuration and deployment workflows exist.                                                                                                                                   | Deployment pending Firebase login/project |
| English support                         | Product and submission materials are in English.                                                                                                                                                 | Proven                                    |
| Entrant eligibility and IP confirmation | Apache-2.0, Stockfish GPL notice, source links, and dependency inventory are present.                                                                                                            | Entrant confirmation pending              |

## Verified local gates

- Formatting, lint, and strict type checks pass.
- 163 unit tests pass.
- All 8 integration tests pass with the Firestore emulator.
- Production PWA build passes.
- All 12 Chromium end-to-end journeys pass.
- Stockfish 19 Lite source, GPL license, and SHA-256 checksums are recorded.
- Firestore rules default to deny, scope reads and creates to the authenticated owner, and prohibit updates.
- GitHub Actions Verify run `45460115474` passed the same gates from the public `main` branch.
- Lighthouse scores 100 for Accessibility, Best Practices, and SEO; Agentic Browsing scores 98 with valid `llms.txt` and ARD metadata plus one low-severity warning because ChessCue publishes a Web app rather than a standard agent protocol artifact.

## External blockers

1. Authenticate Firebase CLI and select or create the real submission project.
2. Enable Firebase AI Logic with the Gemini Developer API.
3. Register the Web app and App Check provider, then enforce App Check for Firebase AI Logic.
4. Configure the Hosting environment and verify real on-device plus cloud-fallback calls.
5. Deploy the hosted app and add its URL.
6. Record, upload, and link the public demonstration video.
7. Complete the Devpost form and have the entrant confirm eligibility, ownership, and third-party compliance.

This audit does not treat local mocks, skipped tests, configuration files, or unexecuted workflows as proof of external deployment.
