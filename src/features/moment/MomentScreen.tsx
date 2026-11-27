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
import { PIECE_NAME } from "../../domain/analysis/board-relations";
import { scanHint } from "../../domain/analysis/forcing-moves";
import {
  describedMoves,
  mentionedMove,
  writtenMove,
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
import { useRookNarration } from "../../shared/rook/use-rook-narration";
import { useRookSpeech } from "../../shared/rook/use-rook-speech";
import { RookSpeechStatus } from "../../shared/rook/RookSpeechStatus";
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
  captureReasonFromBoard,
  replyReason,
  rookMoveReason,
  sacrificeSentence,
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
  // For a branch about another move: the move really played from its start.
  readonly played?: string | undefined;
}

// A position in a line where the player may try their own move.
// A point in a line where Rook is to move: the move he played there.
interface RookTurn {
  readonly fen: string;
  readonly chosen: string;
  readonly back: Story | "start";
}

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
// The player's move just before a frame, from the position it was played in.
function previousMove(story: Story, index: number) {
  const frame = index > 0 ? story.frames[index - 1] : undefined;
  return frame?.moveUci
    ? { fen: beforeFrame(story, index - 1), uci: frame.moveUci }
    : undefined;
}

// The type of the piece a move takes, if any.
function capturedBy(fen: string, uci: string): string | undefined {
  try {
    return new Chess(fen).move(uciMove(uci)).captured;
  } catch {
    return undefined;
  }
}

// The moves after a frame, for reasons that depend on where the line goes.
function restOf(story: Story, index: number): string[] {
  return story.frames
    .slice(index + 1)
    .map(({ moveUci }) => moveUci)
    .filter((uci) => uci !== "");
}

function storyMoves(story: Story): (SanMove & {
  readonly index: number;
  readonly captured: string | undefined;
})[] {
  return story.frames.flatMap((frame, index) => {
    const before = beforeFrame(story, index);
    const san = frame.moveUci ? sanFor(before, frame.moveUci) : undefined;
    return san
      ? [
          {
            uci: frame.moveUci,
            san,
            index,
            captured: capturedBy(before, frame.moveUci),
          },
        ]
      : [];
  });
}

// Hands-free: short spoken words that steer the walkthrough instead of
// asking Rook something.
type VoiceCommand = "next" | "back" | "reset" | "done";
function voiceCommand(text: string): VoiceCommand | undefined {
  const said = text.trim().toLowerCase().replace(/[.!?]/g, "");
  if (/^(?:next|forward|go on|continue)$/.test(said)) return "next";
  if (/^(?:back|previous|go back)$/.test(said)) return "back";
  if (/^(?:reset|start again|start over)$/.test(said)) return "reset";
  if (/^(?:done|finish|i'm done)$/.test(said)) return "done";
  return undefined;
}

// A reason only a Stockfish search can give.
const SEARCH = Symbol("search");

// "What if…" about another move, played out once the move is known.
const WHAT_IF_QUESTION =
  /^\s*(?:what if|what about|why not|could (?:you|i) (?:have )?)/i;

// Questions asking for a reason, answered by code once the move is known.
const WHY_QUESTION =
  /^\s*(?:why|how come|explain|what(?:'s| is| was) the point)\b/i;

// What Rook can answer, said when a question does not reach a move.
const ANSWERABLE =
  "I can explain a move. Name it, like “why Qxg5?”, or describe it, like “why would the queen take?”";

function legalMoves(
  fen: string,
): (SanMove & { readonly captured: string | undefined })[] {
  try {
    return new Chess(fen)
      .moves({ verbose: true })
      .map(({ lan, san, captured }) => ({ uci: lan, san, captured }));
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
  readsAloud = false,
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
  // The player's "Rook reads aloud" setting.
  readonly readsAloud?: boolean;
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
    readonly { readonly label: string; readonly run: () => void }[] | undefined
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

  // On a step where Rook moves next, the player can play a different move
  // for him and see why he did not.
  const rookTurn: RookTurn | undefined = (() => {
    if (!solved || view.previewTag || !story?.moves) return undefined;
    const frame = story.frames[story.step];
    if (
      !frame ||
      frame.moveUci !== story.moves[story.step] ||
      frame.fen.split(" ")[1] === learnerColor
    )
      return undefined;
    const chosen = story.moves[story.step + 1];
    return chosen ? { fen: frame.fen, chosen, back: story } : undefined;
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
    setConfirm(undefined);
    setChoices(undefined);
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

  // "What if you had played X?" for one of Rook's moves: X, the player's
  // best answer and the rest of Stockfish's line on the board, then how it
  // compares with the move Rook played.
  async function rookAlternative(
    from: RookTurn,
    uci: string,
    understood?: string,
  ) {
    setSelected(undefined);
    if (uci === from.chosen) {
      if (from.back !== "start")
        openStory({ ...from.back, step: from.back.step + 1 }, understood);
      return;
    }
    const altSan = sanFor(from.fen, uci);
    const chosenSan = sanFor(from.fen, from.chosen);
    let afterFen: string;
    try {
      const board = new Chess(from.fen);
      board.move(uciMove(uci));
      afterFen = board.fen();
    } catch {
      return;
    }
    if (!altSan || !chosenSan) return;
    send({ kind: "explore", key: `rook-alt:${from.fen}:${uci}` });
    setBusy(true);
    showPlayed(uci, undefined, from.fen);
    setSay({ text: "Let me see…", mood: "think", understood });
    const signal = AbortSignal.any([
      controller.current.signal,
      AbortSignal.timeout(8_000),
    ]);
    const [before, after] = await Promise.all([
      analyzePosition(from.fen, 1, signal),
      analyzePosition(afterFen, 1, signal),
    ]);
    setBusy(false);
    const best = before.ok ? before.value.candidates[0] : undefined;
    const answer = after.ok ? after.value.candidates[0] : undefined;
    const replySan = answer?.principalVariation[0]
      ? sanFor(afterFen, answer.principalVariation[0])
      : undefined;
    if (!best || !answer || !replySan) {
      setSay({
        text: "I couldn't check that just now. Try it again.",
        mood: "hmm",
        understood,
      });
      return;
    }
    const loss =
      best.evaluationCpFromSideToMove + answer.evaluationCpFromSideToMove;
    const line = [uci, ...answer.principalVariation];
    const frames = lineStoryboard(from.fen, line, learnerColor);
    const [first, ...rest] = frames;
    const last = frames.at(-1);
    if (!first || !last) return;
    const payoff = payoffFrame(from.fen, frames);
    const closing: StoryFrame = {
      fen: (payoff ?? last).fen,
      moveUci: "",
      by: "rook",
      arrows: [],
      outlines: [],
      control: [],
      caption:
        loss >= 100
          ? `I'd be worse off than with ${chosenSan}, so I played that.`
          : `${altSan} is about as good for me as ${chosenSan}.`,
    };
    openStory(
      {
        start: from.fen,
        frames: [
          { ...first, caption: `If I play ${altSan}, you answer ${replySan}.` },
          ...rest,
          ...(payoff ? [payoff] : []),
          closing,
        ],
        step: 0,
        mood: "cool",
        back: from.back,
        moves: line,
        played: from.chosen,
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
        ? (rookMoveReason(
            beforeFrame(story, found.index),
            uci,
            previousMove(story, found.index),
            restOf(story, found.index),
          ) ?? frame.caption)
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
            text: replyReason(
              beforeReply.fen(),
              action.uci,
              last ? { fen: moment.fen, uci: last.uci } : undefined,
            ),
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
  // Where Rook played a move, for reasons that need the position before it,
  // the player's move just before and the rest of the line.
  function rookMoveContext(uci: string):
    | {
        readonly before: string;
        readonly previous:
          | { readonly fen: string; readonly uci: string }
          | undefined;
        readonly rest: readonly string[];
      }
    | undefined {
    const lines = [story, solving ? undefined : answerStory].filter(
      (line): line is Story => line !== undefined,
    );
    for (const line of lines) {
      const inLine = storyMoves(line).find((move) => move.uci === uci);
      const frame = inLine ? line.frames[inLine.index] : undefined;
      if (!inLine || frame?.by !== "rook") continue;
      return {
        before: beforeFrame(line, inLine.index),
        previous: previousMove(line, inLine.index),
        rest: restOf(line, inLine.index),
      };
    }
    const last = attempts.at(-1);
    if (uci === reply?.uci && last) {
      try {
        const before = new Chess(moment.fen);
        before.move(uciMove(last.uci));
        return {
          before: before.fen(),
          previous: { fen: moment.fen, uci: last.uci },
          rest: [],
        };
      } catch {
        return undefined;
      }
    }
    if (legalAt(view.fen, uci) && view.fen.split(" ")[1] !== learnerColor)
      return { before: view.fen, previous: undefined, rest: [] };
    return undefined;
  }

  // Why a move is played, said about the position on screen without moving
  // anything. Before the answer is found, the answer is never explained. A
  // capture of Rook's that gives up material returns SEARCH: only Stockfish
  // can say why.
  function reasonInPlace(uci: string): string | typeof SEARCH | undefined {
    if (solving && uci === moment.bestUci)
      return "Play it on the board and I'll tell you how it does.";
    const rook = rookMoveContext(uci);
    if (rook) {
      const captures = capturedBy(rook.before, uci) !== undefined;
      if (captures)
        return (
          captureReasonFromBoard(rook.before, uci, rook.previous, rook.rest) ??
          SEARCH
        );
      return (
        rookMoveReason(rook.before, uci, rook.previous, rook.rest) ??
        lineStoryboard(rook.before, [uci], learnerColor)[0]?.caption
      );
    }
    for (const line of [story, solving ? undefined : answerStory]) {
      if (!line) continue;
      const inLine = storyMoves(line).find((move) => move.uci === uci);
      const frame = inLine ? line.frames[inLine.index] : undefined;
      if (frame) return frame.caption;
    }
    const tried = attempts.find((attempt) => attempt.uci === uci);
    if (tried)
      return `${sanFor(moment.fen, uci) ?? uci} was one of your tries. I can play out what goes wrong.`;
    if (legalAt(view.fen, uci))
      return lineStoryboard(view.fen, [uci], learnerColor)[0]?.caption;
    return undefined;
  }

  // When no search is possible: what the capture takes, honestly.
  function captureFallback(uci: string): string {
    const rook = rookMoveContext(uci);
    return (
      (rook && sacrificeSentence(rook.before, [uci, ...rook.rest])) ??
      "I can't check that right now. Step through the line to see what follows."
    );
  }

  // Why Rook gave up material, from a search: what goes wrong with his best
  // other move, then what the capture costs and wins. "If my queen runs with
  // Qd2, you answer Nd3+ and I'm much worse off. Taking your bishop costs me
  // a queen, but I get a bishop and a knight for her."
  async function searchedReason(
    uci: string,
  ): Promise<{ readonly text: string; readonly story?: Story } | undefined> {
    const rook = rookMoveContext(uci);
    if (!rook) return undefined;
    // A search that never answers must not leave Rook busy for good.
    const analysis = await analyzePosition(
      rook.before,
      4,
      AbortSignal.any([controller.current.signal, AbortSignal.timeout(8_000)]),
    );
    if (!analysis.ok) return undefined;
    const { candidates } = analysis.value;
    const chosen = candidates.find((candidate) => candidate.uci === uci);
    const from = uci.slice(0, 2);
    const others = candidates.filter((candidate) => candidate.uci !== uci);
    const alternative =
      others.find((candidate) => candidate.uci.slice(0, 2) === from) ??
      others[0];
    const reply = alternative?.principalVariation[1];
    const score =
      chosen?.evaluationCpFromSideToMove ??
      candidates[0]?.evaluationCpFromSideToMove;
    if (!alternative || !reply || score === undefined) return undefined;
    if (score - alternative.evaluationCpFromSideToMove < 100) return undefined;
    const altSan = sanFor(rook.before, alternative.uci);
    let replySan: string | undefined;
    try {
      const after = new Chess(rook.before);
      after.move(uciMove(alternative.uci));
      replySan = sanFor(after.fen(), reply);
    } catch {
      return undefined;
    }
    if (!altSan || !replySan) return undefined;
    const fromSquare = SQUARES.find((square) => square === from);
    const piece = fromSquare
      ? new Chess(rook.before).get(fromSquare)
      : undefined;
    const runs =
      alternative.uci.slice(0, 2) === from && piece
        ? `If my ${PIECE_NAME[piece.type]} runs with ${altSan}`
        : `If I play ${altSan} instead`;
    const cost = sacrificeSentence(rook.before, [uci, ...rook.rest]);
    const text = `${runs}, you answer ${replySan} and I'm much worse off.${cost ? ` ${cost}` : ""}`;
    // Show, don't tell: the escape plays on the board as a branch, then what
    // it costs, then why the capture is better.
    const escape = [
      alternative.uci,
      ...alternative.principalVariation.slice(1),
    ];
    const frames = lineStoryboard(rook.before, escape, learnerColor);
    const [first, ...rest] = frames;
    const last = frames.at(-1);
    if (!first || !last) return { text };
    const payoff = payoffFrame(rook.before, frames);
    const closing: StoryFrame = {
      fen: (payoff ?? last).fen,
      moveUci: "",
      by: "rook",
      arrows: [],
      outlines: [],
      control: [],
      caption:
        cost ?? `So I take your ${capturedName(rook.before, uci)} instead.`,
    };
    return {
      text,
      story: {
        start: rook.before,
        frames: [
          {
            ...first,
            caption: `${runs}, you answer ${replySan} and I'm much worse off.`,
          },
          ...rest,
          ...(payoff ? [payoff] : []),
          closing,
        ],
        step: 0,
        mood: "cool",
        back: story ?? "start",
        moves: escape,
        played: uci,
      },
    };
  }

  function capturedName(fen: string, uci: string): string {
    const piece = capturedBy(fen, uci);
    return piece === "p" ||
      piece === "n" ||
      piece === "b" ||
      piece === "r" ||
      piece === "q" ||
      piece === "k"
      ? PIECE_NAME[piece]
      : "piece";
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
        const found = reasonInPlace(action.uci);
        if (found === SEARCH) {
          setChoices(undefined);
          setConfirm(undefined);
          setBusy(true);
          setSay({
            text: "Let me check what else I could do…",
            mood: "think",
            understood,
          });
          const uci = action.uci;
          void searchedReason(uci)
            .catch(() => undefined)
            .then((found) => {
              setBusy(false);
              if (found?.story) {
                openStory(found.story, understood);
                return;
              }
              setSay({
                text: found?.text ?? captureFallback(uci),
                mood: "idle",
                understood,
              });
            });
          return;
        }
        const reason = found;
        const onScreen =
          action.kind === "why" &&
          story?.frames[story.step]?.moveUci === action.uci;
        if (
          (solving && action.uci === moment.bestUci) ||
          (onScreen && reason)
        ) {
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

  // "What if the queen moves next to the king?": the moves the words
  // describe, from the position on screen back through the line, at the
  // first position where any fit. Rook's turns become his alternatives; the
  // player's become branches.
  function whatIf(text: string):
    | {
        readonly fen: string;
        readonly moves: readonly SanMove[];
        readonly play: (uci: string) => void;
      }
    | undefined {
    if (!story?.moves) return undefined;
    const line = story.moves;
    for (let index = story.step; index >= -1; index -= 1) {
      const frame = index >= 0 ? story.frames[index] : undefined;
      if (index >= 0 && frame?.moveUci !== line[index]) continue;
      const fen = frame ? frame.fen : story.start;
      const legal = legalMoves(fen);
      const written = writtenMove(text, fen);
      const moves = written
        ? legal.filter((move) => move.uci === written.lan)
        : describedMoves(text, legal, fen);
      if (moves.length === 0) continue;
      const chosen =
        index === -1 && story.played ? story.played : line[index + 1];
      // Back returns to the step the player asked from.
      const back: Story = story;
      const rookToMove = fen.split(" ")[1] !== learnerColor;
      return {
        fen,
        moves,
        play: (uci) => {
          if (rookToMove && chosen)
            void rookAlternative({ fen, chosen, back }, uci);
          else if (!rookToMove && chosen)
            void tryFrom({ fen, line: line.slice(index + 1), back }, uci);
        },
      };
    }
    return undefined;
  }

  async function ask(text: string) {
    // A new question replaces any offer or choice left from the last one.
    setConfirm(undefined);
    setChoices(undefined);
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
    const onFrame = played.find((move) => move.uci === frame?.moveUci);
    // A bare "why?" on a step asks about the move on screen.
    const resolved =
      candidates.find((move) => move.uci === frame?.moveUci) ??
      (candidates.length === 1 ? candidates[0] : undefined) ??
      (candidates.length === 0 && WHY_QUESTION.test(text)
        ? onFrame
        : undefined);
    if (!solving && WHAT_IF_QUESTION.test(text)) {
      const found = whatIf(text);
      const [only] = found?.moves ?? [];
      if (found && only && found.moves.length === 1) {
        found.play(only.uci);
        return;
      }
      if (found && found.moves.length > 1) {
        const options = found.moves.slice(0, 3);
        // Show the options where they would be played, as arrows.
        setStory(undefined);
        setView({
          fen: found.fen,
          arrows: options.flatMap((move) => {
            const from = SQUARES.find((sq) => sq === move.uci.slice(0, 2));
            const to = SQUARES.find((sq) => sq === move.uci.slice(2, 4));
            return from && to ? [{ from, to, kind: "preview" as const }] : [];
          }),
          // A one-square arrow is hard to see: outline where each lands.
          outlines: options.flatMap((move) => {
            const to = SQUARES.find((sq) => sq === move.uci.slice(2, 4));
            return to ? [{ square: to, tone: "jade" as const }] : [];
          }),
        });
        setChoices(
          options.map((move) => ({
            label: `What if ${move.san}?`,
            run: () => {
              found.play(move.uci);
            },
          })),
        );
        setSay({
          text: `Which one: ${options.map(({ san }) => san).join(" or ")}? They're drawn on the board.`,
          mood: "hmm",
        });
        return;
      }
    }
    if (WHY_QUESTION.test(text)) {
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
            run: () => {
              act({ kind: "why", uci: move.uci });
            },
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
        // Answering never moves the board, so only ending the moment is
        // confirmed; anything that would move the board becomes a button.
        if (outcome.action.kind !== "done") {
          if (movesBoard(outcome.action))
            answerInPlace(outcome.action, outcome.understood);
          else act(outcome.action, outcome.understood);
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

  // Voice. The mic sends a spoken question as if typed. Hands-free, Rook
  // reads each line aloud and then listens; "next", "back", "reset" and
  // "done" steer the walkthrough.
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeOn = useRef(false);
  const narration = useRookNarration();
  const heard = useRef<(text: string) => void>(() => undefined);
  const voice = useRookSpeech((text) => {
    heard.current(text);
  });
  const listening = voice.state.status === "listening";
  useEffect(() => {
    heard.current = (text) => {
      const command = handsFreeOn.current ? voiceCommand(text) : undefined;
      if (command === "next" && story) stepTo(story.step + 1);
      else if (command === "back" && story) stepTo(story.step - 1);
      else if (command === "reset") reset();
      else if (command === "done" && (kind === "solved" || kind === "shown"))
        act({ kind: "done" });
      else void ask(text.trim().slice(0, 400));
    };
  });
  const listen = useRef(voice.start);
  useEffect(() => {
    listen.current = voice.start;
  });
  const { readAloud, cancel: stopReading } = narration;
  const spoken =
    say.mood !== "think" && typeof say.text === "string" ? say.text : "";
  useEffect(() => {
    if (!spoken || !(handsFree || readsAloud)) return;
    readAloud(spoken, () => {
      if (handsFreeOn.current) void listen.current();
    });
  }, [spoken, handsFree, readsAloud, readAloud]);
  useEffect(() => stopReading, [stopReading]);

  const atStart = view.fen === moment.fen;
  // Where the board takes a move: the start while solving, or a point of the
  // line once the answer is known.
  const boardFen = busy
    ? undefined
    : solving
      ? atStart && !view.previewTag
        ? moment.fen
        : undefined
      : (branch?.fen ?? rookTurn?.fen);

  function selectSquare(target: Square) {
    if (boardFen === undefined) return;
    if (selected && legalTargets(boardFen, selected).includes(target)) {
      const piece = new Chess(boardFen).get(selected);
      const promotes =
        piece?.type === "p" && (target.endsWith("8") || target.endsWith("1"));
      const uci = `${selected}${target}${promotes ? "q" : ""}`;
      if (solving) void tryMove(uci);
      else if (branch) void tryFrom(branch, uci);
      else if (rookTurn) void rookAlternative(rookTurn, uci);
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
          <div
            className="ui-chip-row"
            role="group"
            aria-label={choices ? "Which move" : "Rook offers"}
          >
            {confirm ? (
              <button
                type="button"
                className="ui-chip ui-chip--primary"
                onClick={() => {
                  act(confirm.action, confirm.understood);
                }}
              >
                {confirm.label}
              </button>
            ) : (
              (choices ?? []).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="ui-chip ui-chip--primary"
                  onClick={() => {
                    setChoices(undefined);
                    option.run();
                  }}
                >
                  {option.label}
                </button>
              ))
            )}
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
          <>
            <AskBar
              mode={online ? "online" : "offline"}
              onAsk={(text) => {
                void ask(text);
              }}
              onMic={() => {
                if (listening) {
                  voice.stop();
                  return;
                }
                narration.cancel();
                void voice.start();
              }}
              listening={listening}
              handsFree={handsFree}
              onHandsFree={() => {
                const on = !handsFree;
                handsFreeOn.current = on;
                setHandsFree(on);
                narration.cancel();
                voice.cancel();
                // Turning it on reads the current line, then listens.
                if (on) narration.prepare();
              }}
              disabled={busy}
            />
            <RookSpeechStatus voice={voice} />
          </>
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
