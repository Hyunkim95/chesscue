import type { ReactNode } from "react";

import bronzeRook from "../../assets/brand/rating-rook.webp";
import rook from "../../assets/brand/rook.webp";
import "./empty-state.css";

export function EmptyState({
  art,
  title,
  description,
  children,
}: {
  readonly art: "race" | "review" | "practice";
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className="empty-state"
      data-art={art}
      role="region"
      aria-label={title}
    >
      <div className="empty-state__art" aria-hidden="true">
        {art === "race" && <img src={bronzeRook} alt="" />}
        <img src={art === "practice" ? bronzeRook : rook} alt="" />
      </div>
      <div className="empty-state__body">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        {children && <div className="empty-state__actions">{children}</div>}
      </div>
    </div>
  );
}
