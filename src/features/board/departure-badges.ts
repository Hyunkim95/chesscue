import type { BoardArrow } from "../../domain/analysis/board-move-cues";
import type { BoardBadge } from "./ChessBoard";

// In an opening frame where the game left the book, the dashed try is the
// move that left it and the move arrow is the book move. A short arrow such
// as a2-a3 is hard to see, so each is also marked where it lands.
export function departureBadges(
  arrows: readonly BoardArrow[],
): readonly BoardBadge[] {
  const tried = arrows.find(({ kind }) => kind === "tried");
  const book = arrows.find(({ kind }) => kind === "move");
  if (!tried || !book) return [];
  return [
    {
      square: tried.to,
      text: "✗",
      tone: "coral",
      label: "Where the move that left the book landed.",
    },
    {
      square: book.to,
      text: "✓",
      tone: "jade",
      label: "Where the book move lands.",
    },
  ];
}
