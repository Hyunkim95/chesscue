import type { ReactNode } from "react";

import rook from "../../assets/brand/rating-rook.webp";
import { RookBubble, RookSays } from "../rook/RookBubble";
import { RookCharacter } from "../rook/RookCharacter";
import "../ui/ui.css";
import "./loading-state.css";

// SLO-014: a wait shows the shape of what is coming. The words stay for
// screen readers; sighted players see placeholders where content will land.

function SkeletonLine({ width }: { readonly width: string }) {
  return <span className="skeleton skeleton--line" style={{ width }} />;
}

export function SkeletonLines({
  children,
  lines = 2,
}: {
  readonly children: ReactNode;
  readonly lines?: number;
}) {
  return (
    <span className="skeleton-lines" role="status">
      <span className="ui-visually-hidden">{children}</span>
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine key={index} width={index % 2 === 0 ? "88%" : "62%"} />
      ))}
    </span>
  );
}

function BoardSkeleton() {
  return (
    <div className="board-split__main skeleton-board-card" aria-hidden="true">
      <SkeletonLine width="38%" />
      <span className="skeleton skeleton--board" />
      <SkeletonLine width="62%" />
    </div>
  );
}

// Where a board will appear: the board, its caption and Rook's bubble.
export function PositionLoading({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="board-split skeleton-screen" role="status">
      <span className="ui-visually-hidden">{children}</span>
      <BoardSkeleton />
      <div className="board-split__aside" aria-hidden="true">
        <RookSays>
          <RookCharacter mood="think" />
          <RookBubble tone="muted">
            <span className="skeleton-bubble">
              <SkeletonLine width="92%" />
              <SkeletonLine width="70%" />
            </span>
          </RookBubble>
        </RookSays>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <span className="skeleton-list" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <span className="skeleton-list__row" key={row}>
          <span className="skeleton skeleton--thumb" />
          <span className="skeleton-list__text">
            <SkeletonLine width={row % 2 === 0 ? "72%" : "58%"} />
            <SkeletonLine width="36%" />
          </span>
        </span>
      ))}
    </span>
  );
}

function PageSkeleton() {
  return (
    <span className="skeleton-page" aria-hidden="true">
      <span className="skeleton skeleton--title" />
      <span className="skeleton skeleton--card" />
      <SkeletonLine width="84%" />
      <SkeletonLine width="66%" />
      <span className="skeleton skeleton--card skeleton--card-short" />
    </span>
  );
}

export type LoadingShape = "page" | "list" | "board";

// A whole screen or section that is still loading.
export function LoadingState({
  children,
  shape = "page",
}: {
  readonly children: ReactNode;
  readonly shape?: LoadingShape;
}) {
  if (shape === "board") return <PositionLoading>{children}</PositionLoading>;
  return (
    <div className={`skeleton-screen skeleton-screen--${shape}`} role="status">
      <span className="ui-visually-hidden">{children}</span>
      {shape === "list" ? <ListSkeleton /> : <PageSkeleton />}
    </div>
  );
}

// Rook working on a named job, such as checking a reply. Not for page loads.
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
