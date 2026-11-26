import { Chess } from "chess.js";
import { courses, type StudyTopic } from "./roadmap";

export interface LessonChallenge {
  readonly version: 1;
  readonly title: string;
  readonly insight: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly player: "w" | "b";
  readonly objectives: readonly string[];
  readonly steps: readonly {
    readonly before: string;
    readonly after: string;
    readonly uci: string;
    readonly san: string;
  }[];
}

// The historical continuation is the teaching playbook, not a claim that every
// alternative is weaker. Replay every step before allowing a challenge to start.
export function buildLessonChallenge(
  topic: StudyTopic,
  lessonIndex: number,
): LessonChallenge | null {
  const course = courses[topic];
  const lesson = course.lessons[lessonIndex];
  const goals = lesson?.continuation
    .filter((_, i) => i % 2 === 0)
    .map(() => lesson.question);
  if (!lesson || !goals || !lesson.continuation.length) return null;
  try {
    const board = new Chess(lesson.fen);
    const player = board.turn();
    const steps = lesson.continuation.map((san) => {
      const move = board.move(san);
      return {
        before: move.before,
        after: move.after,
        uci: move.lan,
        san: move.san,
      };
    });
    if (goals.length !== Math.ceil(steps.length / 2)) return null;
    return {
      version: 1,
      title: lesson.title,
      insight: lesson.insight,
      source: course.source,
      sourceUrl: course.url,
      player,
      objectives: goals,
      steps,
    };
  } catch {
    return null;
  }
}

export interface ChallengeState {
  readonly status: "playing" | "replying" | "retry" | "complete";
  readonly ply: number;
  readonly fen: string;
  readonly lastMove: string | null;
  readonly opponentMove: string | null;
}

export type ChallengeAction =
  | { readonly type: "attempt"; readonly uci: string }
  | { readonly type: "reply" }
  | { readonly type: "retry" };

export function startLessonChallenge(
  challenge: LessonChallenge,
): ChallengeState | null {
  const first = challenge.steps[0];
  return first
    ? {
        status: "playing",
        ply: 0,
        fen: first.before,
        lastMove: null,
        opponentMove: null,
      }
    : null;
}

export function advanceLessonChallenge(
  challenge: LessonChallenge,
  state: ChallengeState,
  action: ChallengeAction,
): ChallengeState {
  const step = challenge.steps[state.ply];
  if (!step) return state;
  if (action.type === "retry")
    return state.status === "retry"
      ? { ...state, status: "playing", fen: step.before, lastMove: null }
      : state;
  if (action.type === "reply") {
    if (state.status !== "replying") return state;
    const ply = state.ply + 1;
    return {
      ...state,
      status: ply === challenge.steps.length ? "complete" : "playing",
      ply,
      fen: step.after,
      lastMove: step.uci,
      opponentMove: step.san,
    };
  }
  if (state.status !== "playing") return state;
  try {
    const move = new Chess(state.fen).move(action.uci);
    if (move.lan !== step.uci)
      return { ...state, status: "retry", fen: move.after, lastMove: move.lan };
    const ply = state.ply + 1;
    return {
      ...state,
      status: ply === challenge.steps.length ? "complete" : "replying",
      ply,
      fen: move.after,
      lastMove: move.lan,
    };
  } catch {
    return state;
  }
}
