import { Children, isValidElement, type ReactNode } from "react";

import "./rook-character.css";

// The words a node shows, so a new line can be told from a re-render.
function textOf(node: ReactNode): string {
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "bigint"
  )
    return String(node);
  if (isValidElement<{ readonly children?: ReactNode }>(node))
    return textOf(node.props.children);
  if (typeof node !== "object" || node === null || "then" in node) return "";
  return Children.toArray(node).map(textOf).join("");
}

// Rook's one speech bubble. There is no history: a new line replaces the
// old one and fades in. "understood" names the model that routed a typed
// question.
export function RookBubble({
  children,
  tone = "default",
  understood,
}: {
  readonly children: ReactNode;
  readonly tone?: "default" | "muted";
  readonly understood?: string | undefined;
}) {
  const line = textOf(children);
  return (
    <div className={`rook-bubble rook-bubble--${tone}`}>
      {understood && (
        <small className="rook-bubble__understood">{understood}</small>
      )}
      <p className="rook-bubble__text" aria-live="polite">
        <span key={line} className="rook-bubble__line">
          {children}
        </span>
      </p>
    </div>
  );
}

// Rook and his bubble side by side, under the board.
export function RookSays({ children }: { readonly children: ReactNode }) {
  return <div className="rook-says">{children}</div>;
}
