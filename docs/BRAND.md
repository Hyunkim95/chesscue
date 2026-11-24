# ChessCue Brand System

Status: Approved direction  
Direction: Coach's Notebook  
Personality: Calm, sharp, encouraging

## Brand promise

ChessCue turns completed games into the next useful thing to notice, practise, and apply.

Working line: **See the cue. Play the position.**

## Visual idea

The product behaves like a thoughtful coach's annotated scorebook. Paper surfaces create calm, pine marks primary actions, and coral annotations point to the one decision that needs attention.

The core motif is a pair of opposing corner brackets around a point. It represents a cue without relying on a literal knight, king, or robot symbol. Use it for the app mark, selected positions, focus states, and important transitions. Do not scatter it decoratively.

## Color roles

| Role            | Token              | Value     |
| --------------- | ------------------ | --------- |
| Ink             | `--cue-ink`        | `#292a27` |
| Muted ink       | `--cue-muted`      | `#5b6059` |
| Paper           | `--cue-paper`      | `#f8f1e5` |
| Canvas          | `--cue-canvas`     | `#eee6d7` |
| Recessed paper  | `--cue-paper-deep` | `#e7dcc9` |
| Primary action  | `--cue-pine`       | `#3d6b5a` |
| Primary pressed | `--cue-pine-dark`  | `#315547` |
| Annotation      | `--cue-coral`      | `#df765b` |
| Annotation text | `--cue-coral-dark` | `#a64f3b` |

Pine means act or progress. Coral means notice or compare. Neither color carries meaning without a label, border, marker, or shape.

## Typography

- **Newsreader**: product name, page payoff, lesson question, and major outcome.
- **DM Sans**: controls, body text, labels, board metadata, and technical details.
- **System monospace**: raw engine notation inside collapsed technical details only.

Use sentence case. Large display text should remain medium-weight and breathe. Supporting labels may be small and bold with tracking.

## Voice

- Calm: one instruction at a time.
- Sharp: name the exact decision and consequence.
- Encouraging: correct the pattern without calling the player careless or bad.

Prefer:

- “What matters most before you move?”
- “Choose from memory. Stockfish stays hidden until you commit.”
- “This move does not resolve the threat as reliably as the verified line.”

Avoid:

- “Blunder!”
- “Engine impact: 521 centipawns.”
- “You should obviously play Bd3.”
- playful language when the player has just made a mistake

## UI principles

1. The board or current learning action wins the squint test.
2. One pine primary action appears per state.
3. Coral annotations identify the cue, not general decoration.
4. Paper cards represent distinct objects, not every content group.
5. Full replay, engine notation, and diagnostics remain secondary disclosures.
6. Mobile keeps the board and current question ahead of navigation and history.
7. Every selected, legal-target, success, and correction state has a non-color indicator.

## Logo usage

The mark uses pine upper-left and coral lower-right brackets around an ink dot. Pair it with the Newsreader ChessCue wordmark in navigation. The mark may stand alone for the app icon and favicon. Preserve clear space equal to the center dot diameter.
