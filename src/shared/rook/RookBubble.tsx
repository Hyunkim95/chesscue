import type { ReactNode } from "react";

import "./rook-character.css";

// Rook's one speech bubble. There is no history: a new line replaces the
// old one. "understood" names the model that routed a typed question.
export function RookBubble({
  children,
  tone = "default",
  understood,
}: {
  readonly children: ReactNode;
  readonly tone?: "default" | "muted";
  readonly understood?: string | undefined;
}) {
  return (
    <div className={`rook-bubble rook-bubble--${tone}`}>
      {understood && (
        <small className="rook-bubble__understood">{understood}</small>
      )}
      <p className="rook-bubble__text" aria-live="polite">
        {children}
      </p>
    </div>
  );
}

// Rook and his bubble side by side, under the board.
export function RookSays({ children }: { readonly children: ReactNode }) {
  return <div className="rook-says">{children}</div>;
}
