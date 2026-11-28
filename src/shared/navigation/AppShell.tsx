import type { ReactNode } from "react";

import { TabBar, type TabId } from "./TabBar";
import "./app-shell.css";

// The two frames every redesigned screen sits in. Tabs: the top bar with
// streak and XP on the left and the avatar on the right, then the tab bar.
// Focus: inside a position or a game, only ✕ and the screen's own top row.
export type ShellMode =
  | {
      readonly kind: "tabs";
      readonly current: TabId | undefined;
      readonly onNavigate: (tab: TabId) => void;
      readonly todayWaiting?: boolean;
      readonly start: ReactNode;
      readonly end: ReactNode;
    }
  | {
      readonly kind: "focus";
      readonly onExit: () => void;
      readonly exitLabel: string;
      readonly top?: ReactNode;
    };

export function AppShell({
  mode,
  children,
}: {
  readonly mode: ShellMode;
  readonly children: ReactNode;
}) {
  return (
    <div className={`app-shell app-shell--${mode.kind}`}>
      <header className="app-shell__top">
        {mode.kind === "tabs" ? (
          <>
            <div className="app-shell__start">{mode.start}</div>
            {mode.end}
          </>
        ) : (
          <>
            <button
              type="button"
              className="app-shell__exit"
              aria-label={mode.exitLabel}
              onClick={mode.onExit}
            >
              <span aria-hidden="true">✕</span>
            </button>
            {mode.top}
          </>
        )}
      </header>
      {/* A new tab mounts a new body, which fades in (app-shell.css). */}
      <main
        key={mode.kind === "tabs" ? (mode.current ?? "tabs") : mode.exitLabel}
        className="app-shell__body"
      >
        {children}
      </main>
      {mode.kind === "tabs" && (
        <TabBar
          current={mode.current}
          onNavigate={mode.onNavigate}
          todayWaiting={mode.todayWaiting ?? false}
        />
      )}
    </div>
  );
}
