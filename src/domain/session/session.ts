import type { Attempt, MomentResult, SessionState } from "./types";

// One position from start to finish. The state follows the design's session
// states; help and explorations are tracked beside it because they never
// change which state is active.
export interface MomentSession {
  readonly state: SessionState;
  // A hint, scan, preview or Show me was used before solving.
  readonly helped: boolean;
  // Distinct tries, previews and questions, by key.
  readonly explored: readonly string[];
}

export type SessionEvent =
  | { readonly kind: "try"; readonly attempt: Attempt }
  | { readonly kind: "help" }
  | { readonly kind: "explore"; readonly key: string }
  | { readonly kind: "show" }
  | { readonly kind: "finish" };

export const startSession: MomentSession = {
  state: { kind: "before" },
  helped: false,
  explored: [],
};

function attemptsOf(state: SessionState): readonly Attempt[] {
  return state.kind === "before"
    ? []
    : state.kind === "done"
      ? state.result.attempts
      : state.attempts;
}

function explore(session: MomentSession, key: string): MomentSession {
  return session.explored.includes(key)
    ? session
    : { ...session, explored: [...session.explored, key] };
}

function solving(state: SessionState): boolean {
  return (
    state.kind === "before" ||
    state.kind === "tried" ||
    state.kind === "second-miss"
  );
}

export function sessionResult(
  session: MomentSession,
): MomentResult | undefined {
  const { state } = session;
  if (state.kind === "done") return state.result;
  if (state.kind !== "solved" && state.kind !== "shown") return undefined;
  return {
    outcome:
      state.kind === "shown"
        ? "shown"
        : state.firstTry && !session.helped
          ? "spotted"
          : "found-on-retry",
    helped: session.helped,
    explorations: session.explored.length,
    attempts: state.attempts,
  };
}

// Events that do not apply to the current state leave the session unchanged.
export function advanceSession(
  session: MomentSession,
  event: SessionEvent,
): MomentSession {
  const { state } = session;
  switch (event.kind) {
    case "explore":
      return state.kind === "done" ? session : explore(session, event.key);
    case "help":
      return solving(state) ? { ...session, helped: true } : session;
    case "show":
      return solving(state)
        ? {
            ...session,
            helped: true,
            state: { kind: "shown", attempts: attemptsOf(state) },
          }
        : session;
    case "finish": {
      const result = sessionResult(session);
      return result && state.kind !== "done"
        ? { ...session, state: { kind: "done", result } }
        : session;
    }
    case "try": {
      if (!solving(state)) return explore(session, `try:${event.attempt.uci}`);
      const tried = explore(session, `try:${event.attempt.uci}`);
      const attempts = [...attemptsOf(state), event.attempt];
      if (event.attempt.tier === "best")
        return {
          ...tried,
          state: {
            kind: "solved",
            firstTry: state.kind === "before",
            attempts,
          },
        };
      return {
        ...tried,
        state:
          state.kind === "before"
            ? { kind: "tried", attempts }
            : { kind: "second-miss", attempts },
      };
    }
  }
}
