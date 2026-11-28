import type { ReactNode } from "react";

import rook from "../../assets/brand/rook.webp";
import "./tab-bar.css";

export type TabId = "today" | "play" | "sky" | "games";

const icons: Record<Exclude<TabId, "today">, ReactNode> = {
  play: (
    <path
      d="M8 20h9M9.5 17h6l-1-6 2-2-3-5H9l1.5 3-2 2.5L10 11l-.5 6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  ),
  sky: (
    <path
      d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"
      fill="currentColor"
    />
  ),
  games: (
    <>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 9h16M9 4v16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </>
  ),
};

const tabs: readonly { id: TabId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "play", label: "Play" },
  { id: "sky", label: "Sky" },
  { id: "games", label: "Games" },
];

export function TabBar({
  current,
  onNavigate,
  todayWaiting = false,
}: {
  readonly current: TabId | undefined;
  readonly onNavigate: (tab: TabId) => void;
  // Positions are waiting on Today: a coral dot.
  readonly todayWaiting?: boolean;
}) {
  return (
    <nav className="tab-bar" aria-label="Primary navigation">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="tab-bar__tab"
          aria-current={current === id ? "page" : undefined}
          aria-label={
            id === "today" && todayWaiting
              ? "Today, positions waiting"
              : undefined
          }
          onClick={() => {
            onNavigate(id);
          }}
        >
          {id === "today" ? (
            <img className="tab-bar__rook" src={rook} alt="" />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {icons[id]}
            </svg>
          )}
          {id === "today" && todayWaiting && (
            <i className="tab-bar__dot" aria-hidden="true" />
          )}
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
