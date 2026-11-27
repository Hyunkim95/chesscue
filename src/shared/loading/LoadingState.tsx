import type { ReactNode } from "react";

import rook from "../../assets/brand/rating-rook.webp";
import "./loading-state.css";

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
