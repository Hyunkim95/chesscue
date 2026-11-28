import type { ReactNode } from "react";

import rook from "../../assets/brand/rating-rook.webp";
import { RookBubble, RookSays } from "../rook/RookBubble";
import { RookCharacter } from "../rook/RookCharacter";
import "./loading-state.css";

export function PositionLoading({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="board-split">
      <div
        className="board-split__main position-loading__card"
        aria-hidden="true"
      >
        <div className="position-loading__board" />
      </div>
      <div className="board-split__aside">
        <RookSays>
          <RookCharacter mood="think" />
          <RookBubble tone="muted">{children}</RookBubble>
        </RookSays>
      </div>
    </div>
  );
}

export function LoadingMark({ large = false }: { readonly large?: boolean }) {
  return (
    <span
      className={large ? "loading-mark loading-mark--large" : "loading-mark"}
      aria-hidden="true"
    >
      <img src={rook} alt="" />
    </span>
  );
}

export function LoadingText({ children }: { readonly children: ReactNode }) {
  return (
    <span className="loading-text">
      <LoadingMark />
      <span>{children}</span>
    </span>
  );
}

export function LoadingState({ children }: { readonly children: ReactNode }) {
  return (
    <div className="loading-state" role="status">
      <LoadingMark large />
      <span>{children}</span>
    </div>
  );
}
