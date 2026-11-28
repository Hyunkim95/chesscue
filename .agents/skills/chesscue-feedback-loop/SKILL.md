---
name: chesscue-feedback-loop
description: Design, implement, or review ChessCue’s shared learning loop across Coached Play, Practice, and Review. Use for missed tactics, move feedback, retries, motif discovery, board comparisons, and evidence of unaided improvement.
---

# ChessCue feedback loop

Design Coached Play, Practice, and Review around one path from a move the player committed to verified evidence, Rook’s explanation, and a retry or continuation. Coached Play supplies a move already played, Practice supplies an exercise and its verified objective, and Review supplies a decision from a completed game or a learner’s trial move. Inspect and report any gaps in the current implementation when changing one surface.

## Teach for transfer

- Use the [PRD’s pilot skill-transfer target](../../../docs/PRD.md). Aim for a 10 percentage-point increase in the share of comparable opportunities a player handles unaided in rated games after practice. Use new positions and compare the same underlying skill before and after. Report the number of opportunities and successes in each period. Puzzle solves and familiar retries are practice activity. Verification that a hint appears is a software check. Measure transfer from separate rated games.
- Treat a reported tactic as a regression example for the underlying learning problem. For a missed fork, ask whether Rook can show the consequence of a stronger reply in unfamiliar positions. Reproduce the move and identify the missing or poorly surfaced evidence before changing the teaching logic. Check the same capability on a different kind of position and on a similar-looking position where the threatened consequence cannot be verified.
- Use a shared path from checked position and continuation to teaching cue, retry, and later unaided opportunity. Derive cues from verified changes such as material, legal replies, threats, or control. Use the most useful supported consequence even when the tactic has no name. Motif names can enrich a cue and link to versioned curriculum. Follow the PRD’s dynamic motif policy and keep new motifs teachable without a code release. Avoid adding a classifier, threshold, or feedback branch for each reported tactic.
- Chess.js and Stockfish establish the chess facts. Gemini can interpret verified evidence and phrase a cue within existing boundaries. Keep legal, checkable feedback available offline. If the evidence supports only an evaluation loss, report that limited result and keep retry available. Preserve the unassisted rated-game boundary.

## Share the move check

- Reuse the same comparison of the starting position, played move, and stronger verified alternatives across all three surfaces. Share how evidence is validated, how the consequence is described, and how the retry opens the original position. Equivalent evidence should lead to equivalent feedback. When the search cannot support a verdict, record that outcome and allow a later check.
- Keep the rules of each activity in the caller. Coached Play checks only after a move is committed. Its optional notes stay collapsed, and the check must stay off the CPU reply path. Review can give difficult positions more search time. Practice keeps the exercise’s verified objective and accepts alternatives that satisfy it. A retry is practice evidence. Check skill transfer in a separate unassisted game.

## The shared interaction

1. Show the position, side to move, and the decision the player needs to make. In Practice, have Rook explain what the motif does and what to look for before the first move. Keep the answer covered until the player commits a move or asks to see it.
2. Check the move and tell the player what it achieved. Give distinct feedback for a weaker move, a close alternative, and an unverified move. In Coached Play and Review, show the difference between the played move and a checked alternative. In Practice, explain how the attempt served the exercise objective. Apply the existing tolerance where that comparison already uses it.
3. Show the concrete consequence on the board beside Rook’s explanation. Start with the one visual that explains the verdict. For example, trace the opponent’s verified reply to an exposed piece, highlight the new defender after a good move, or show the capture and recapture before explaining the resulting material.
4. Keep another attempt at the original decision one action away. After a verified success, let the player continue the line or try a similar position. Any scored transfer attempt should begin without the solution annotations.

## Keep board evidence consistent

- Use the same treatment for equivalent evidence and actions across all three entry points. When a comparison is available, let the player flip between the verified positions on one board. Mark changes relative to the labeled reference and keep that reference fixed while flipping.
- For square control, mark only gains and losses. Name the moves in the legend. Selecting a square lists the pieces that control it in each position, and the arrows show the controllers in the displayed position. Use the same markers, keyboard access, and screen-reader names wherever this comparison appears.
- Build cues from legal moves, checked lines, or facts the board can establish directly. If analysis cannot support an explanation, say the move could not be verified and keep retry available.

## Reuse and verify

Trace [Coached Play](../../../src/features/play/PlayGameScreen.tsx), [Review](../../../src/features/review/GameReviewExperience.tsx), and [Practice](../../../src/features/curriculum/PracticePosition.tsx). Check what they already share through [RookExploration](../../../src/features/rook/RookExploration.tsx), the [board](../../../src/features/board/ChessBoard.tsx), and [Rook messages](../../../src/shared/rook/RookMessage.tsx). Use the [ChessCue UI design skill](../chesscue-ui-design/SKILL.md) for placement, visual hierarchy, and panel checks.

For a shared feedback change, try the same position across all three entry points with a weaker move, a close alternative, and a verified success. Check that the feedback points at the same consequence and that a retry restores the original position. Include a tactic found by a longer search that the live budget misses, and verify how the position can be revisited in Review. When evaluating detection changes, hold out entire games and distinguish engine misses, cues skipped by the coach, and cues the player did not see. Check the relevant offline or unavailable-analysis state, Black orientation, and the extension at 320 px and a wider width.

Use the [CPU reply and review interaction SLOs](../../../docs/SLO.md) to check gameplay, comparison, and replay responsiveness.
