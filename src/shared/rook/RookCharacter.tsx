import rook from "../../assets/brand/rook.webp";
import "./rook-character.css";

export type RookMood = "idle" | "think" | "happy" | "hmm" | "warm" | "cool";

// Rook's body. The mood drives the lantern eyes and pose; the words live in
// RookBubble. Decorative: the bubble carries the meaning.
export function RookCharacter({
  mood,
  size = "md",
}: {
  readonly mood: RookMood;
  readonly size?: "md" | "lg";
}) {
  return (
    <div
      className={`rook-character rook-character--${mood} rook-character--${size}`}
      data-mood={mood}
      aria-hidden="true"
    >
      <img src={rook} alt="" />
      <i className="rook-character__eye rook-character__eye--left" />
      <i className="rook-character__eye rook-character__eye--right" />
    </div>
  );
}
