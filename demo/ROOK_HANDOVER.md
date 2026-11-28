# ChessCue Rook demo handover

The proof of concept tests whether Rook can teach a skill through a move the player chose. Start with an unlabeled position. Once the player commits a move that tests the practice goal or contains a verified mistake, Rook asks what they intended. The player can speak, type, play the reply they expected, request a hint, or go straight to the replay. Keep the transcript open as they compare lines, ask follow-up questions, or continue playing.

## Run the demo

From the ChessCue repository, run:

```sh
pnpm exec vite --host localhost --port 4179 --strictPort
```

Open [the Rook demo](http://localhost:4179/demo/rook.html). The seed position and Queen safety practice goal are demo inputs. The move evaluations, prompts, and replay lines are derived during play. Supply a URL-encoded FEN through `?fen=` to try another board. Practice and transcript state live in the page session.

Use these moves from the seed position to check the loop. **Try another move** returns to the starting position and preserves the transcript.

- **Qa4, then “why?”** The move saves the queen but permits **…Qa5+**. Rook explains that **Qd2** saves the queen and blocks the diagonal from a5 to e1. **Compare** shows Stockfish estimates from the same side, legal checks, and both checked continuations.
- **Qe3** also saves the queen. Black’s **…Qa5+** checks the king and attacks the knight. Rook asks what the player would try against the check. **Keep playing** applies the checked opponent reply.
- **Qb4** permits **…Nxb4**, so Practice queues a retry as soon as the mistake is verified. Open the retry and play **Qd2** to complete Queen safety and clear the queued item. Rook’s example moves are labeled **Preview**, and the board returns to the committed move after a preview.

## Where the code lives

- [Demo entry](rook.html) and [RookDemo.tsx](../src/features/rook-demo/RookDemo.tsx) own the demonstration. Start with `play` for grading and Practice, `reveal` for staged feedback, `explore` for follow-up questions, and `playPreview` for temporary board playback.
- [Stockfish review analysis](../src/application/analyze-game/analyze-review-reply.ts) supplies legal continuations and evaluations. Chess.js derives board claims such as the blocked checking line. The comparison searches both resulting positions with the same time budget.
- [Rook speech](../src/shared/rook/use-rook-speech.ts) and [speech status](../src/shared/rook/RookSpeechStatus.tsx) handle capture, transcription, input level, and an explicit online speech retry. **Hands-free voice** opens the mic after narration ends and submits the transcript when recognition finishes.
- The [AI routing guide](../docs/AI_ROUTING.md) defines what belongs in deterministic chess logic, Gemini Nano, and Cloud. Nano uses the learner’s intent to choose a bounded teaching prompt. A factual “why?” uses checked board evidence. Cloud is for an explicit task that benefits from extra context or tools. The core loop works with checked local feedback when Nano is unavailable.

## Verification and open work

- Chrome checks at 320 and 480 px covered the move comparisons, previews, retry completion, and transcript continuation. The Qa4 “why?” regression was reproduced and verified in the browser. Formatting, lint, and the TypeScript build passed for the latest code changes.
- Offline Gemini Nano inference was verified on a prepared Chrome profile for the demo’s board-input coaching path. Recorded audio verified microphone routing and the meter. Speech tests simulated recognition results and checked auto-submission and explicit online retry. Live transcription on the user’s microphone remains open.
- The demo is a separate Vite dev entry. It has no production or hackathon deployment from this work. The files are in the working tree, which contains unrelated edits. Review the diff before committing or moving the work to another checkout.
- Hint depth is opt-in. The sequence is a small board cue, the checked reply, then the alternative. Rating cutoffs and feature deprecations were discussed and remain undecided.
- The next validation is a live microphone run on the exact Chrome profile intended for the demo, followed by a complete move-to-Practice recording. Typed intent and board prediction provide alternative demo inputs. The agreed product target remains a 10 percentage-point lift in unaided skill transfer. The proof of concept has no learning-outcome measurement.

## Ported to the extension review (2026-11-27)

The owner approved bringing all five demo behaviours into Rook's review, Practice and lesson boards. See `docs/PRD.md` for the acceptance wording.

- **Equal-search judging.** A learner's move and Stockfish's best move are scored by searching the position after each to depth 16 from a cleared hash. Repeated checks give the same verdict. The 150-centipawn cutoff is unchanged. Lowering it to 125 is still undecided.
- **Intent first.** After a verified mistake, Rook asks what the learner was trying to do. An answer, Hint or Next move reveals the reply. The loss explanation stays in the conversation.
- **Hints.** After a mistake, Hint marks the threat, then shows the reply. Review keeps its checks, captures and threats scan as the first step.
- **Compare.** Compare moves opens automatically on a revealed or found mistake. A follow-up question closes it.
- **Hands-free voice.** The headset button beside the microphone reads Rook aloud, asks the question aloud, then listens and sends the answer. Live microphone transcription is still unverified on a real profile.
