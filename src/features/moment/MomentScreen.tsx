import { Chess, SQUARES, type Square } from "chess.js";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type {
  CheckedTry,
  CheckFailure,
  MomentPosition,
} from "../../application/run-moment/check-try";
import type {
  QuestionOutcome,
  RoutedAction,
} from "../../application/route-question/route-question";
import type {
  AnalysisEngineFailure,
  PositionAnalysis,
} from "../../application/analyze-game/analysis-engine";
import type { BoardArrow } from "../../domain/analysis/board-move-cues";
import {
  alternativeFrame,
  lineStoryboard,
  payoffFrame,
  refutationStoryboard,
  type StoryFrame,
} from "../../domain/analysis/line-storyboard";
import { scanHint } from "../../domain/analysis/forcing-moves";
import {
  describedMoves,
  mentionedMove,
} from "../../domain/game/exploration-intent";
import type { MomentAttemptRecord } from "../../domain/progress/types";
import { attemptXp } from "../../domain/progress/xp";
import { chipsFor, type SanMove } from "../../domain/session/chips";
import type { MomentGoal } from "../../domain/session/moment-goal";
import {
  advanceSession,
  sessionResult,
  startSession,
  type MomentSession,
  type SessionEvent,
} from "../../domain/session/session";
import type {
  Attempt,
  Chip,
  FeedbackTier,
  MomentResult,
} from "../../domain/session/types";
import type { Result } from "../../shared/result/result";
import { AskBar } from "../../shared/rook/AskBar";
import { RookBubble, RookSays } from "../../shared/rook/RookBubble";
import { RookCharacter, type RookMood } from "../../shared/rook/RookCharacter";
import {
  Button,
  ChipRow,
  CountUp,
  Modal,
  Pill,
  Ring,
  Sheet,
} from "../../shared/ui/primitives";
import { ChessBoard, type BoardOutline } from "../board/ChessBoard";
import { departureBadges } from "../board/departure-badges";
import {
  checksAnswer,
  replyReason,
  rookMoveReason,
  STANDING_AFTER,
  threatsAnswer,
  tierLine,
  type BoardAnswer,
} from "./moment-copy";
import "./moment.css";

export interface MomentSpec extends MomentPosition {
  readonly id: string;
  // "Your game vs Ahmed · Tuesday", or "A position like ones from your games".
  readonly sourceLabel: string;
  readonly playedInGame?: SanMove | undefined;
  readonly bestNonSolution?: SanMove | undefined;
  // What the player is working towards, stated before they move.
  readonly goal: MomentGoal;
  // The idea, named only after it is found.
  readonly ideaName: string | undefined;
  readonly unitId: string | undefined;
  readonly source: MomentAttemptRecord["source"];
}

interface BoardView {
  readonly fen: string;
  readonly lastMoveUci?: string | undefined;
  readonly animate?: boolean;
  readonly arrows: readonly BoardArrow[];
  readonly outlines: readonly BoardOutline[];
  readonly previewTag?: string | undefined;
  readonly spot?: Square | undefined;
  readonly control?: StoryFrame["control"];
}

interface Say {
  readonly text: ReactNode;
  readonly mood: RookMood;
  readonly understood?: string | undefined;
}

// A line the player steps through one captioned frame at a time.
interface Story {
  // The position before the first frame.
  readonly start: string;
  readonly frames: readonly StoryFrame[];
  readonly step: number;
  readonly mood: RookMood;
  // The moves of a line the player can branch from at their own turns:
  // frame i plays moves[i].
  readonly moves?: readonly string[] | undefined;
  // A refutation goes back to the step the player branched from.
  readonly back?: Story | "start" | undefined;
}

// A position in a line where the player may try their own move.
interface Branch {
  readonly fen: string;
  // The line's move here and the rest of the line from it.
  readonly line: readonly string[];
  readonly back: Story | "start";
}

const GHOST: Record<Exclude<FeedbackTier, "best">, BoardArrow["kind"]> = {
  missed: "ghost-missed",
  worse: "ghost-worse",
  costly: "ghost-costly",
};

const TRIES_CHIP: Record<Exclude<FeedbackTier, "best">, string> = {
  missed: "level, chance missed",
  worse: "now worse",
  costly: "now losing",
};

function uciMove(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
  };
}

function sanFor(fen: string, uci: string | undefined): string | undefined {
  if (uci === undefined) return undefined;
  try {
    return new Chess(fen).move(uciMove(uci)).san;
  } catch {
    return undefined;
  }
}

function square(name: string): Square | undefined {
  return SQUARES.find((candidate) => candidate === name);
}

function arrow(uci: string, kind: BoardArrow["kind"]): BoardArrow[] {
  const from = square(uci.slice(0, 2));
  const to = square(uci.slice(2, 4));
  return from && to ? [{ from, to, kind }] : [];
}

function legalTargets(fen: string, from: Square): Square[] {
  try {
    return new Chess(fen)
      .moves({ square: from, verbose: true })
      .map(({ to }) => to);
  } catch {
    return [];
  }
}

function ghostArrows(attempts: readonly Attempt[]): BoardArrow[] {
  return attempts.flatMap(({ uci, tier }) =>
    tier === "best" ? [] : arrow(uci, GHOST[tier]),
  );
}

function frameView(frame: StoryFrame): BoardView {
  return {
    fen: frame.fen,
    lastMoveUci: frame.moveUci,
    animate: true,
    arrows: frame.arrows,
    outlines: frame.outlines,
    control: frame.control,
  };
}

// The position a frame's move was played from.
function beforeFrame(story: Story, index: number): string {
  return index === 0 ? story.start : (story.frames[index - 1]?.fen ?? "");
}

// The moves the frames play, named, for questions about one of them.
function storyMoves(story: Story): (SanMove & { readonly index: number })[] {
  return story.frames.flatMap((frame, index) => {
    const san = frame.moveUci
      ? sanFor(beforeFrame(story, index), frame.moveUci)
      : undefined;
    return san ? [{ uci: frame.moveUci, san, index }] : [];
  });
}

// What Rook can answer, said when a question does not reach a move.
const ANSWERABLE =
  "I can explain a move. Name it, like “why Qxg5?”, or describe it, like “why would the queen take?”";

function legalMoves(fen: string): SanMove[] {
  try {
    return new Chess(fen)
      .moves({ verbose: true })
      .map(({ lan, san }) => ({ uci: lan, san }));
  } catch {
    return [];
  }
}

// Questions whose answer would change the position on screen. Typed, they
// are answered in place and offered as a button.
function movesBoard(action: RoutedAction): boolean {
  return (
    action.kind === "show-me" ||
    action.kind === "scan" ||
    action.kind === "why" ||
    action.kind === "what-if"
  );
}

// Before the answer is known, a refutation stops before any move of the
// player's that matches the answer, so it never shows it.
function withoutAnswer(
  line: readonly string[],
  bestUci: string,
): readonly string[] {
  const at = line.findIndex((uci, index) => index > 0 && uci === bestUci);
  return at === -1 ? line : line.slice(0, at);
}

export function MomentScreen({
  moment,
  online,
  checkMove,
  checkFrom,
  analyzePosition,
  askRook,
  onComplete,
  onContinue,
  dailyGoal,
  openingFrames = [],
}: {
  readonly moment: MomentSpec;
  readonly online: boolean;
  readonly checkMove: (
    uci: string,
    signal: AbortSignal,
  ) => Promise<Result<CheckedTry, CheckFailure>>;
  // Checks a move the player tries at another point of the line, once the
  // position is solved or shown. Never recorded as a try.
  readonly checkFrom: (
    position: MomentPosition,
    uci: string,
    signal: AbortSignal,
  ) => Promise<Result<CheckedTry, CheckFailure>>;
  // Stockfish's top lines for a position, used to find Rook's other defences.
  readonly analyzePosition: (
    fen: string,
    multiPv: number,
    signal: AbortSignal,
  ) => Promise<Result<PositionAnalysis, AnalysisEngineFailure>>;
  readonly askRook: (
    question: {
      text: string;
      fen: string;
      boardMoveUci?: string | undefined;
      boardMoveSan?: string | undefined;
    },
    signal: AbortSignal,
  ) => Promise<QuestionOutcome>;
  // Called once with the finished result, to record it.
  readonly onComplete: (result: MomentResult) => void;
  readonly onContinue: () => void;
  // Today's goal, which fills on the celebration.
  readonly dailyGoal?:
    | { readonly done: number; readonly target: number }
    | undefined;
  // The game's opening as board frames, when this position comes from it.
  readonly openingFrames?: readonly StoryFrame[] | undefined;
}) {
  const start: BoardView = { fen: moment.fen, arrows: [], outlines: [] };
  const [session, setSession] = useState<MomentSession>(startSession);
  const [view, setView] = useState<BoardView>(start);
  const [say, setSay] = useState<Say>({
    text: "Take your time. Look for checks, captures and threats.",
    mood: "idle",
  });
  const [story, setStory] = useState<Story | undefined>();
  const [selected, setSelected] = useState<Square | undefined>();
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<SanMove | undefined>();
  // Stockfish's line after each try, for "Why not {move}?".
  const [tryLines, setTryLines] = useState<
    ReadonlyMap<string, readonly string[]>
  >(new Map());
  const [confirm, setConfirm] = useState<
    Extract<QuestionOutcome, { kind: "confirm" }> | undefined
  >();
  // Moves to choose from when a question describes more than one.
  const [choices, setChoices] = useState<
    | readonly { readonly label: string; readonly action: RoutedAction }[]
    | undefined
  >();
  const [sheet, setSheet] = useState<"celebrate" | "missed" | undefined>();
  // Created in the effect so StrictMode's mount, unmount and remount leaves a
  // live controller.
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => {
      current.abort();
    };
  }, []);

  const kind = session.state.kind;
  const solving =
    kind === "before" || kind === "tried" || kind === "second-miss";
  const attempts =
    session.state.kind === "before" || session.state.kind === "done"
      ? []
      : session.state.attempts;
  const result = sessionResult(session);
  // The line the player solved it with: Rook's main line, or the player's own
  // good move and Stockfish's answer to it, followed by Rook's move and what
  // it adds.
  const [solvedLine, setSolvedLine] = useState<readonly string[]>(
    moment.solutionLine,
  );
  const solvedUci = solvedLine[0] ?? moment.bestUci;
  const alternative = alternativeFrame(moment.fen, solvedUci, moment.bestUci);
  const lineFrames = lineStoryboard(moment.fen, solvedLine);
  const payoff = payoffFrame(moment.fen, lineFrames);
  const storyboard = [
    ...lineFrames,
    ...(payoff ? [payoff] : []),
    ...(alternative ? [alternative] : []),
  ];
  const answerStory: Story = {
    start: moment.fen,
    frames: storyboard,
    step: 0,
    mood: "happy",
    moves: solvedLine,
  };
  const afterSolution = (() => {
    try {
      return new Chess(moment.fen).move(uciMove(solvedUci)).after;
    } catch {
      return undefined;
    }
  })();
  const learnerColor = moment.fen.split(" ")[1] === "b" ? "b" : "w";

  // Once solved, find Rook's best defence other than his main-line reply, for
  // "What if you'd played …?". A forced reply has no alternative.
  const [defence, setDefence] = useState<
    (SanMove & { readonly line: readonly string[] }) | undefined
  >();
  const solved = kind === "solved" || kind === "shown";
  useEffect(() => {
    if (!solved || afterSolution === undefined) return;
    if (new Chess(afterSolution).moves().length < 2) return;
    const signal = controller.current.signal;
    void analyzePosition(afterSolution, 2, signal).then((analysis) => {
      if (!analysis.ok || signal.aborted) return;
      const other = analysis.value.candidates.find(
        ({ uci }) => uci !== solvedLine[1],
      );
      const san = other ? sanFor(afterSolution, other.uci) : undefined;
      if (other && san)
        setDefence({
          uci: other.uci,
          san,
          line: [other.uci, ...other.principalVariation.slice(1)],
        });
    });
  }, [solved, afterSolution, analyzePosition, solvedLine]);
  const bestSan = sanFor(moment.fen, moment.bestUci) ?? moment.bestUci;

  // After the position is solved or shown, the player may try their own move
  // at the start or at any of their turns in a line they are stepping
  // through.
  const branch: Branch | undefined = (() => {
    if (!solved || view.previewTag) return undefined;
    if (!story)
      return view.fen === moment.fen && solvedLine.length > 0
        ? { fen: moment.fen, line: solvedLine, back: "start" }
        : undefined;
    const frame = story.frames[story.step];
    if (
      !story.moves ||
      !frame ||
      frame.moveUci !== story.moves[story.step] ||
      frame.fen.split(" ")[1] !== learnerColor
    )
      return undefined;
    const line = story.moves.slice(story.step + 1);
    return line.length > 0 ? { fen: frame.fen, line, back: story } : undefined;
  })();

  function send(...events: SessionEvent[]) {
    setSession((current) => events.reduce(advanceSession, current));
  }

  // The board answers the tap at once; Rook's reply follows once the engine
  // has checked the move.
  function showPlayed(uci: string, previewTag?: string, from = moment.fen) {
    try {
      const after = new Chess(from).move(uciMove(uci)).after;
      setView({
        fen: after,
        lastMoveUci: uci,
        arrows: [],
        outlines: [],
        previewTag,
      });
    } catch {
      // An illegal move stays off the board; the check says so.
    }
  }

  // Show, don't tell: one captioned frame of a line on the board. The player
  // steps through it and it stays until Reset.
  function openStory(next: Story, understood?: string) {
    const frame = next.frames[next.step];
    if (!frame) {
      setStory(undefined);
      setSay({
        text: `Stockfish rates ${bestSan} as the best move here.`,
        mood: next.mood,
        understood,
      });
      return;
    }
    setStory(next);
    setSelected(undefined);
    setView(frameView(frame));
    setSay({ text: frame.caption, mood: next.mood, understood });
  }

  function stepTo(step: number) {
    if (!story || busy) return;
    const clamped = Math.max(0, Math.min(story.frames.length - 1, step));
    if (clamped !== story.step) openStory({ ...story, step: clamped });
  }

  function onStepKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!story) return;
    if (event.key === "ArrowLeft") stepTo(story.step - 1);
    else if (event.key === "ArrowRight") stepTo(story.step + 1);
    else return;
    event.preventDefault();
  }

  function rewind(withScan: boolean) {
    const scan = withScan ? scanHint(moment.fen) : undefined;
    setStory(undefined);
    setView({
      fen: moment.fen,
      arrows: [...ghostArrows(attempts), ...(scan?.arrows ?? [])],
      outlines: [],
    });
    setReply(undefined);
    if (scan) {
      send({ kind: "help" });
      setSay({
        text: (
          <>
            Let's scan.{" "}
            {scan.rows.map((row) => `${row.label}: ${row.moves}.`).join(" ")}
          </>
        ),
        mood: "hmm",
      });
    } else
      setSay({
        text: "Your move again. The faint arrows are your earlier tries.",
        mood: "idle",
      });
  }

  async function tryMove(uci: string) {
    setSelected(undefined);
    setBusy(true);
    const before = view;
    showPlayed(uci);
    setSay({ text: "Let me see…", mood: "think" });
    const checked = await checkMove(uci, controller.current.signal);
    setBusy(false);
    if (!checked.ok) {
      setView(before);
      setSay({
        text: "I couldn't check that move just now. Try it again.",
        mood: "hmm",
      });
      return;
    }
    const { attempt, afterFen, replyFen, replySan, line } = checked.value;
    send({ kind: "try", attempt });
    setTryLines((current) => new Map(current).set(attempt.uci, line));
    if (attempt.tier === "best") {
      setSolvedLine(line);
      setView({
        fen: afterFen,
        lastMoveUci: attempt.uci,
        arrows: [],
        outlines: [],
        spot: square(attempt.uci.slice(2, 4)),
      });
      setSay({
        text: "Want to see why it works, or what I could have tried instead? Or tap Done.",
        mood: "happy",
      });
      return;
    }
    setReply(
      attempt.replyUci && replySan
        ? { uci: attempt.replyUci, san: replySan }
        : undefined,
    );
    setView({
      fen: replyFen ?? afterFen,
      lastMoveUci: attempt.replyUci ?? attempt.uci,
      animate: true,
      arrows: attempt.replyUci ? arrow(attempt.replyUci, "reply") : [],
      outlines: [],
    });
    setSay({
      text: tierLine({
        tier: attempt.tier,
        trySan: attempt.san,
        replySan,
        preview: false,
        plan: moment.goal.kind === "plan",
      }),
      mood: attempt.tier === "missed" ? "warm" : "cool",
    });
  }

  // A move of the player's own at a point of the line, once the answer is
  // known: the line's move steps on; another is checked with Stockfish and
  // either works too or plays out as Rook's refutation.
  async function tryFrom(from: Branch, uci: string, understood?: string) {
    setSelected(undefined);
    const [lineUci] = from.line;
    if (uci === lineUci) {
      if (from.back === "start") openStory(answerStory, understood);
      else openStory({ ...from.back, step: from.back.step + 1 }, understood);
      return;
    }
    const san = sanFor(from.fen, uci);
    if (lineUci === undefined || san === undefined) return;
    send({ kind: "explore", key: `branch:${from.fen}:${uci}` });
    setBusy(true);
    const before = view;
    showPlayed(uci, undefined, from.fen);
    setSay({ text: "Let me see…", mood: "think", understood });
    const signal = controller.current.signal;
    const top = await analyzePosition(from.fen, 1, signal);
    const bestCp = top.ok
      ? top.value.candidates[0]?.evaluationCpFromSideToMove
      : undefined;
    const checked =
      bestCp === undefined
        ? undefined
        : await checkFrom(
            {
              fen: from.fen,
              bestUci: lineUci,
              bestCp,
              solutionLine: from.line,
              ...(moment.toleranceCp === undefined
                ? {}
                : { toleranceCp: moment.toleranceCp }),
            },
            uci,
            signal,
          );
    setBusy(false);
    if (signal.aborted) return;
    if (!checked?.ok) {
      setView(before);
      setSay({
        text: "I couldn't check that move just now. Try it again.",
        mood: "hmm",
        understood,
      });
      return;
    }
    const { attempt, line } = checked.value;
    if (attempt.tier === "best") {
      const works = alternativeFrame(from.fen, lineUci, uci);
      openStory(
        {
          start: from.fen,
          frames: works ? [works] : [],
          step: 0,
          mood: "happy",
          back: from.back,
        },
        understood,
      );
      if (!works) setSay({ text: `${san} works too.`, mood: "happy" });
      return;
    }
    openStory(
      {
        start: from.fen,
        frames: refutationStoryboard({
          fen: from.fen,
          line,
          learner: learnerColor,
          standing: STANDING_AFTER[attempt.tier],
          instead: from.line,
          answerKnown: true,
        }),
        step: 0,
        mood: "cool",
        back: from.back,
      },
      understood,
    );
  }

  // "Why not {your move}?": the try, Rook's best answer and what it costs.
  // Before the position is solved it never shows the answer.
  function whyNot(tried: Attempt, understood?: string) {
    const line = tryLines.get(tried.uci);
    if (!line || tried.tier === "best") return false;
    openStory(
      {
        start: moment.fen,
        frames: refutationStoryboard({
          fen: moment.fen,
          line: solving ? withoutAnswer(line, moment.bestUci) : line,
          learner: learnerColor,
          standing: STANDING_AFTER[tried.tier],
          instead: solvedLine,
          answerKnown: !solving,
        }),
        step: 0,
        mood: "cool",
      },
      understood,
    );
    return true;
  }

  // "Why {a move in the line}?": the frame where it was played, and what it
  // does in that position.
  function whyOnFrame(uci: string, understood?: string): boolean {
    if (!story) return false;
    const found = storyMoves(story).find((move) => move.uci === uci);
    const frame = found ? story.frames[found.index] : undefined;
    if (!found || !frame) return false;
    const reason =
      frame.by === "rook"
        ? (rookMoveReason(beforeFrame(story, found.index), uci) ??
          frame.caption)
        : frame.caption;
    setStory({ ...story, step: found.index });
    setView(frameView(frame));
    setSay({ text: reason, mood: "idle", understood });
    return true;
  }

  async function preview(uci: string, understood?: string) {
    if (solving) send({ kind: "help" });
    send({ kind: "explore", key: `preview:${uci}` });
    setStory(undefined);
    setBusy(true);
    const before = view;
    showPlayed(uci, "Preview · not played");
    setSay({ text: "Let me see…", mood: "think", understood });
    const checked = await checkMove(uci, controller.current.signal);
    setBusy(false);
    if (!checked.ok) {
      setView(before);
      setSay({
        text:
          checked.error.code === "illegal"
            ? "That move isn't possible from the start. Tap ↺ Reset and play it on the board."
            : "I couldn't check that move just now.",
        mood: "hmm",
        understood,
      });
      return;
    }
    const { attempt, afterFen, replyFen, replySan } = checked.value;
    setView({
      fen: replyFen ?? afterFen,
      lastMoveUci: attempt.replyUci ?? attempt.uci,
      previewTag: "Preview · not played",
      animate: true,
      arrows: [
        ...arrow(attempt.uci, "preview"),
        ...(attempt.replyUci ? arrow(attempt.replyUci, "reply") : []),
      ],
      outlines: [],
    });
    setSay({
      text: tierLine({
        tier: attempt.tier,
        trySan: attempt.san,
        replySan,
        preview: true,
        plan: moment.goal.kind === "plan",
      }),
      mood: attempt.tier === "best" ? "happy" : "warm",
      understood,
    });
  }

  function showAnswer(answer: BoardAnswer, understood?: string) {
    setView((current) => ({
      ...current,
      arrows: [...ghostArrows(attempts), ...answer.arrows],
      outlines: answer.outlines,
    }));
    setSay({ text: answer.text, mood: "idle", understood });
  }

  function reset() {
    setReply(undefined);
    setStory(undefined);
    setSelected(undefined);
    setView(
      solving
        ? { fen: moment.fen, arrows: ghostArrows(attempts), outlines: [] }
        : start,
    );
    setSay({
      text: solving
        ? "Back to the start. Your move."
        : "Back to the start. Play any move and I'll show you what happens.",
      mood: "idle",
    });
  }

  function goBack(back: Story | "start") {
    if (back === "start") reset();
    else openStory(back);
  }

  // The answer opens on the board; the player steps through it, can ask
  // about it and taps Done when ready.
  function showMe() {
    send({ kind: "show" });
    openStory({ ...answerStory, mood: "warm" });
  }

  function finish() {
    const finished = sessionResult(session);
    if (!finished) return;
    send({ kind: "finish" });
    onComplete(finished);
  }

  function legalAt(fen: string, uci: string): boolean {
    return sanFor(fen, uci) !== undefined;
  }

  function act(action: RoutedAction, understood?: string) {
    setConfirm(undefined);
    setChoices(undefined);
    const fen = view.fen;
    const key = `ask:${action.kind}${"uci" in action ? `:${action.uci}` : ""}`;
    if (action.kind !== "done" && action.kind !== "something-else")
      send({ kind: "explore", key });
    switch (action.kind) {
      case "threats":
        showAnswer(threatsAnswer(fen), understood);
        return;
      case "checks":
        showAnswer(checksAnswer(fen), understood);
        return;
      case "scan": {
        send({ kind: "help" });
        const scan = scanHint(moment.fen);
        setStory(undefined);
        setView({
          fen: moment.fen,
          arrows: [...ghostArrows(attempts), ...(scan?.arrows ?? [])],
          outlines: [],
        });
        setSay({
          text: scan
            ? scan.rows.map((row) => `${row.label}: ${row.moves}.`).join(" ")
            : "Look at every check, capture and threat.",
          mood: "idle",
          understood,
        });
        return;
      }
      case "why":
      case "what-if": {
        if (action.uci === moment.bestUci && !solving) {
          if (action.kind === "why" || !whyOnFrame(action.uci, understood))
            openStory(answerStory, understood);
          return;
        }
        if (
          action.kind === "what-if" &&
          action.uci === defence?.uci &&
          afterSolution
        ) {
          openStory(
            {
              start: afterSolution,
              frames: lineStoryboard(afterSolution, defence.line, learnerColor),
              step: 0,
              mood: "idle",
              moves: defence.line,
            },
            understood,
          );
          return;
        }
        if (whyOnFrame(action.uci, understood)) return;
        const tried = attempts.find(({ uci }) => uci === action.uci);
        if (tried && whyNot(tried, understood)) return;
        if (action.kind === "why" && action.uci === reply?.uci) {
          const beforeReply = new Chess(moment.fen);
          const last = attempts.at(-1);
          try {
            if (last) beforeReply.move(uciMove(last.uci));
          } catch {
            // The reason falls back to a request to play the move.
          }
          setSay({
            text: replyReason(beforeReply.fen(), action.uci),
            mood: "idle",
            understood,
          });
          return;
        }
        if (branch && legalAt(branch.fen, action.uci)) {
          void tryFrom(branch, action.uci, understood);
          return;
        }
        void preview(action.uci, understood);
        return;
      }
      case "show-line":
        openStory(answerStory, understood);
        return;
      case "show-me":
        if (solving) showMe();
        else openStory(answerStory, understood);
        return;
      case "opening": {
        // The frames are separate positions, not one line, so there is
        // nothing to branch from.
        const [first] = openingFrames;
        if (first)
          openStory(
            { start: first.fen, frames: openingFrames, step: 0, mood: "warm" },
            understood,
          );
        return;
      }
      case "plan":
        setSay({
          text: online ? "Plans are coming soon." : "Plans need internet.",
          mood: "idle",
        });
        return;
      case "something-else":
        setSay({
          text: "Tap a chip, or play a move on the board and I'll show you what happens.",
          mood: "idle",
        });
        return;
      case "done":
        if (kind === "shown") {
          setSheet("missed");
          return;
        }
        finish();
        setSheet("celebrate");
        return;
    }
  }

  // Why a move is played, said about the position on screen without moving
  // anything. Before the answer is found, the answer is never explained.
  function reasonInPlace(uci: string): string | undefined {
    if (solving && uci === moment.bestUci)
      return "Play it on the board and I'll tell you how it does.";
    const inLine = story
      ? storyMoves(story).find((move) => move.uci === uci)
      : undefined;
    const frame = inLine && story ? story.frames[inLine.index] : undefined;
    if (inLine && story && frame)
      return frame.by === "rook"
        ? (rookMoveReason(beforeFrame(story, inLine.index), uci) ??
            frame.caption)
        : frame.caption;
    const tried = attempts.find((attempt) => attempt.uci === uci);
    if (tried)
      return `${sanFor(moment.fen, uci) ?? uci} was one of your tries. I can play out what goes wrong.`;
    if (legalAt(view.fen, uci))
      return lineStoryboard(view.fen, [uci], learnerColor)[0]?.caption;
    return undefined;
  }

  // A typed question is answered where the player is looking. Anything that
  // would move the board is offered as a button instead of done.
  function answerInPlace(action: RoutedAction, understood: string) {
    const offer = (label: string, text: string) => {
      setChoices(undefined);
      setConfirm({ kind: "confirm", action, label, understood });
      setSay({ text, mood: "idle", understood });
    };
    switch (action.kind) {
      case "show-me":
        offer(
          "Show me the answer",
          "I can play the answer for you. That ends this try.",
        );
        return;
      case "scan":
        offer(
          "Mark it for me",
          "I can mark every check, capture and threat for you.",
        );
        return;
      case "why":
      case "what-if": {
        const reason = reasonInPlace(action.uci);
        if (solving && action.uci === moment.bestUci) {
          setSay({ text: reason ?? "", mood: "idle", understood });
          return;
        }
        offer(
          action.kind === "why"
            ? "Show it on the board"
            : "Play it on the board",
          reason ?? "I can show that on the board.",
        );
        return;
      }
      default:
        act(action, understood);
    }
  }

  async function ask(text: string) {
    // On a frame, a question is about the position shown. The move it is
    // about comes from code, never the model: one it names from the line,
    // one it describes in words ("why would the queen take") from the line
    // or the board, or else the frame's own move.
    const frame = story?.frames[story.step];
    const played = story ? storyMoves(story) : [];
    const named = mentionedMove(text, played);
    const inLine = named ? [] : describedMoves(text, played);
    const candidates = named
      ? [named]
      : inLine.length > 0
        ? inLine
        : describedMoves(text, legalMoves(view.fen));
    const resolved =
      candidates.find((move) => move.uci === frame?.moveUci) ??
      (candidates.length === 1 ? candidates[0] : undefined);
    if (/^\s*why\b/i.test(text)) {
      if (resolved) {
        answerInPlace(
          { kind: "why", uci: resolved.uci },
          `Rook understood · why · ${resolved.san}`,
        );
        return;
      }
      if (candidates.length > 1) {
        const options = candidates.slice(0, 3);
        setConfirm(undefined);
        setChoices(
          options.map((move) => ({
            label: `Why ${move.san}?`,
            action: { kind: "why", uci: move.uci } as const,
          })),
        );
        setSay({
          text: `Which move: ${options.map(({ san }) => san).join(" or ")}?`,
          mood: "hmm",
        });
        return;
      }
    }
    setBusy(true);
    setSay({ text: "Let me think…", mood: "think" });
    const boardMove =
      resolved ?? played.find((move) => move.uci === frame?.moveUci);
    const outcome = await askRook(
      {
        text,
        fen: view.fen,
        boardMoveUci: boardMove?.uci,
        boardMoveSan: boardMove?.san,
      },
      controller.current.signal,
    );
    setBusy(false);
    switch (outcome.kind) {
      case "act":
        if (movesBoard(outcome.action)) {
          answerInPlace(outcome.action, outcome.understood);
          return;
        }
        act(outcome.action, outcome.understood);
        return;
      case "confirm":
        if (outcome.action.kind === "something-else") {
          setSay({ text: ANSWERABLE, mood: "hmm" });
          return;
        }
        setConfirm(outcome);
        setSay({
          text: `Did you mean: ${outcome.label}`,
          mood: "hmm",
          understood: outcome.understood,
        });
        return;
      case "play-it-on-the-board":
        setSay({
          text: "Play the move on the board and I'll show you what happens.",
          mood: "idle",
          understood: outcome.understood,
        });
        return;
      case "unrouted":
        setSay({ text: ANSWERABLE, mood: "hmm" });
    }
  }

  const atStart = view.fen === moment.fen;
  // Where the board takes a move: the start while solving, or a point of the
  // line once the answer is known.
  const boardFen = busy
    ? undefined
    : solving
      ? atStart && !view.previewTag
        ? moment.fen
        : undefined
      : branch?.fen;

  function selectSquare(target: Square) {
    if (boardFen === undefined) return;
    if (selected && legalTargets(boardFen, selected).includes(target)) {
      const piece = new Chess(boardFen).get(selected);
      const promotes =
        piece?.type === "p" && (target.endsWith("8") || target.endsWith("1"));
      const uci = `${selected}${target}${promotes ? "q" : ""}`;
      if (solving) void tryMove(uci);
      else if (branch) void tryFrom(branch, uci);
      return;
    }
    const piece = new Chess(boardFen).get(target);
    const turn = boardFen.split(" ")[1];
    setSelected(piece?.color === turn ? target : undefined);
  }

  const lastMiss = attempts.findLast(({ tier }) => tier !== "best");
  const chips: readonly Chip[] = confirm
    ? []
    : chipsFor(kind, {
        fen: view.fen,
        bestUci: moment.bestUci,
        playedInGame: moment.playedInGame,
        reply,
        bestNonSolution: moment.bestNonSolution,
        bestDefence: defence,
        tried:
          lastMiss && tryLines.has(lastMiss.uci)
            ? { uci: lastMiss.uci, san: lastMiss.san }
            : undefined,
        quiet: false,
        online,
        opening: openingFrames.length > 0,
      });
  const turn = moment.fen.split(" ")[1] === "w" ? "White" : "Black";
  // Try again is the reset after a not-best move; Reset covers everything
  // else that changed the board: previews, answers and storyboards.
  // Neither shows while a played move waits on the engine.
  const tryAgain =
    !busy && solving && kind !== "before" && !atStart && !view.previewTag;
  const showReset =
    !busy &&
    kind !== "done" &&
    sheet === undefined &&
    !tryAgain &&
    (!atStart ||
      story !== undefined ||
      view.outlines.length > 0 ||
      view.arrows.length > ghostArrows(attempts).length);
  const stepper = story && story.frames.length > 1 ? story : undefined;
  const back = story?.back;
  const missed = attempts.filter((attempt) => attempt.tier !== "best");
  const xp = result ? attemptXp(result) : 0;
  // A plan's goal marks its pieces on the bare starting board while the
  // player is solving; any answer drawn on the board replaces them.
  const goalMarks =
    moment.goal.kind === "plan" &&
    solving &&
    atStart &&
    !view.previewTag &&
    view.outlines.length === 0 &&
    view.arrows.length === ghostArrows(attempts).length
      ? moment.goal
      : undefined;

  return (
    <div className="moment board-split">
      <div className="board-split__main">
        <h1 className="moment__prompt">
          {turn} to move
          <small>{moment.sourceLabel}</small>
        </h1>
        <p className={`moment__goal moment__goal--${moment.goal.kind}`}>
          {moment.goal.prompt}
        </p>
        <ChessBoard
          fen={view.fen}
          label={`${turn} to move. ${moment.sourceLabel}`}
          orientation={turn === "White" ? "white" : "black"}
          lastMoveUci={view.lastMoveUci}
          // Every change of position slides, including Reset.
          animateMove={view.animate ?? true}
          selectedSquare={selected ?? null}
          legalTargets={
            selected && boardFen ? legalTargets(boardFen, selected) : []
          }
          onSquareSelect={selectSquare}
          disabled={boardFen === undefined}
          extraArrows={
            goalMarks ? [...goalMarks.arrows, ...view.arrows] : view.arrows
          }
          outlines={goalMarks ? goalMarks.outlines : view.outlines}
          previewTag={view.previewTag}
          badges={departureBadges(view.arrows)}
          spotSquare={view.spot}
          controlChanges={
            view.control && view.control.length > 0
              ? new Map(
                  view.control.map(({ square, change }) => [square, change]),
                )
              : undefined
          }
        />
      </div>
      <div className="board-split__aside">
        <RookSays>
          <RookCharacter mood={busy ? "think" : say.mood} />
          <RookBubble understood={say.understood}>{say.text}</RookBubble>
        </RookSays>
        {stepper && (
          <div
            className="moment__stepper"
            role="group"
            aria-label="Step through the line"
            onKeyDown={onStepKey}
          >
            {/* aria-disabled keeps focus on a button that reaches the end of
                the line, so the arrow keys keep working. */}
            <Pill
              aria-label="Previous step"
              onClick={() => {
                stepTo(stepper.step - 1);
              }}
              aria-disabled={busy || stepper.step === 0}
            >
              ◀
            </Pill>
            <span className="moment__step">
              {stepper.step + 1} / {stepper.frames.length}
            </span>
            <Pill
              aria-label="Next step"
              onClick={() => {
                stepTo(stepper.step + 1);
              }}
              aria-disabled={busy || stepper.step === stepper.frames.length - 1}
            >
              ▶
            </Pill>
          </div>
        )}
        {(solving || showReset || back) && (
          <div className="moment__tools">
            {back && (
              <Pill
                onClick={() => {
                  goBack(back);
                }}
                disabled={busy}
              >
                {back === "start"
                  ? "◀ Back to the start"
                  : "◀ Back to the answer"}
              </Pill>
            )}
            {tryAgain && (
              <Button
                onClick={() => {
                  rewind(kind === "second-miss");
                }}
                disabled={busy}
              >
                ↺ Try again
              </Button>
            )}
            {showReset && (
              <Pill onClick={reset} disabled={busy}>
                ↺ Reset
              </Pill>
            )}
            {solving && (
              <>
                <Pill
                  onClick={() => {
                    act({ kind: "scan" });
                  }}
                  disabled={busy}
                >
                  Hint
                </Pill>
                <Pill onClick={showMe} disabled={busy}>
                  Show me
                </Pill>
              </>
            )}
          </div>
        )}
        {missed.length > 0 && (
          <ul className="moment__tries" aria-label="Your tries">
            {missed.map(({ uci, san, tier }, index) => (
              <li
                key={`${uci}-${String(index)}`}
                className={`moment__try moment__try--${tier}`}
              >
                {san} · {tier === "best" ? "" : TRIES_CHIP[tier]}
              </li>
            ))}
          </ul>
        )}
        {confirm || choices ? (
          <div className="ui-chip-row" role="group" aria-label="Did you mean">
            {(confirm
              ? [{ label: confirm.label, action: confirm.action }]
              : (choices ?? [])
            ).map((option) => (
              <button
                key={option.label}
                type="button"
                className="ui-chip ui-chip--primary"
                onClick={() => {
                  setChoices(undefined);
                  act(option.action, confirm?.understood);
                }}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className="ui-chip"
              onClick={() => {
                setConfirm(undefined);
                setChoices(undefined);
                setSay({ text: ANSWERABLE, mood: "idle" });
              }}
            >
              Never mind
            </button>
          </div>
        ) : (
          <ChipRow
            chips={chips}
            onSelect={(chip) => {
              act(chip.action);
            }}
          />
        )}
        {kind !== "done" && (
          <AskBar
            mode={online ? "online" : "offline"}
            onAsk={(text) => {
              void ask(text);
            }}
            disabled={busy}
          />
        )}
      </div>
      <Modal
        celebrate
        open={sheet === "celebrate"}
        title={
          result?.outcome === "spotted"
            ? "You spotted it! ✨"
            : "Found it on a retry"
        }
      >
        {moment.ideaName && (
          <div className="moment__idea-card">
            <b>{moment.ideaName}</b>
            <small>
              {result?.outcome === "spotted"
                ? `Added to your collection · ${moment.sourceLabel}`
                : "Spot it on the first try to light its star"}
            </small>
          </div>
        )}
        <div className="moment__reward">
          <p className="moment__xp">
            <CountUp value={xp} format={(gained) => `+${String(gained)} XP`} />
          </p>
          {dailyGoal && (
            <span className="moment__goal-ring">
              <Ring
                countUp
                size="sm"
                done={dailyGoal.done}
                target={dailyGoal.target}
                label={`Today: ${String(Math.min(dailyGoal.done, dailyGoal.target))} of ${String(dailyGoal.target)} positions`}
              />
              <small aria-hidden="true">today</small>
            </span>
          )}
        </div>
        <Button wide onClick={onContinue}>
          Continue
        </Button>
      </Modal>
      <Sheet open={sheet === "missed"} title="Not this time" tone="calm">
        <p className="moment__sheet-line">
          {moment.ideaName ? `The idea: ${moment.ideaName}. ` : ""}
          It will come back, and you'll know what to look for.
        </p>
        <Button
          wide
          onClick={() => {
            finish();
            onContinue();
          }}
        >
          Continue
        </Button>
      </Sheet>
    </div>
  );
}
