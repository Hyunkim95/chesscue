---
name: chesscue-ui-design
description: Design or review player-facing changes anywhere in ChessCue, including a single button, toast, label, loading state, or screen. Use when adding an element to an existing journey, consolidating components, or correcting UI that feels generic, cramped, or inconsistent with the brand.
---

# ChessCue UI design

## Start on the screen where the player will see the change

Open the relevant journey in the running extension. Look at the state immediately before the change, the moment it appears, and what the player does next. For a new screen, use the nearest existing journey as the starting point. Identify the one thing the player is trying to do, what they must see to do it, and what the proposed element would displace. A request for a toast settles the interaction pattern. Its placement, words, timing, and relationship to the board still need design.

## Find the family it belongs to

Read the project’s brand guide in `docs/BRAND.md` when available. Inspect the current components and tokens alongside a neighboring screen that already feels right. Recent owner-approved behavior takes precedence where the guide has drifted. Useful starting points are `src/shared/navigation`, `src/shared/rook`, `src/shared/empty-state`, `src/shared/loading`, and `src/app/styles.css`.

ChessCue is a calm chess observatory. The board carries the position, Stockfish supplies evidence, and Rook is the recognizable jade guide. Use brass for commands, jade for progress and coral for a teaching cue. Newsreader carries major outcomes and DM Sans carries instructions and controls. Use the shared control and card radii. Keep board squares, rank emblems, and skill nodes recognizable. Choose the brand detail that tells the player who is speaking or what happened. A system sync error has a different job from a message from Rook.

## Compose the change into the journey

- **Placement.** Start beside the object or action the change explains. Inspect the competing placements when the screen is crowded. A save confirmation can appear beside the reviewed move. Keep the board, playback, chat input and navigation usable while it is visible.
- **Hierarchy.** Decide what should draw attention first and what can recede. Use alignment, spacing and type before adding another bordered surface. A player profile can give the rank emblem the most room. During a review, the same amount of emphasis belongs to the position the player must solve.
- **Behavior and words.** Write the real object, consequence and destination using the same names the player will see there. Identify which state warrants the message. For a saved retry, acknowledge the committed write once, name the move and skill, and let the player keep exploring. For an unavailable puzzle, show the next usable action.
- **Implementation.** Start with the existing component that owns the meaning. Reuse Rook’s message treatment when he speaks and the shared header for a destination title. Introduce a new variant when the existing treatment fails a concrete need in the actual screen.

## Verify the composition

Exercise the change with realistic content in the extension at 320 px and a wider panel. Check the companion web layout when it shares the UI. Inspect whole-screen captures, including the moment a temporary message is visible. Try the next action while it is present and after it clears. Check long labels, focus, announcements, and the relevant empty, repeated, failure or offline state. For saved training feedback, follow the named skill and open the actual retry.

Fix what gets covered, jumps unexpectedly, duplicates a cue, or competes with the main task. Hand off a representative screen capture and the interaction you verified. Distinguish a working layout from a usability target that still needs player testing.
