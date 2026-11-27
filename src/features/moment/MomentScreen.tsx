import { Chess, SQUARES, type Square } from "chess.js";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
  type StoryFrame,
} from "../../domain/analysis/line-storyboard";
import { scanHint } from "../../domain/analysis/forcing-moves";
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
import {
  checksAnswer,
  replyReason,
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

// Long enough to read one caption and see its arrows.
const STORY_STEP_MS = 2_400;

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

export function MomentScreen({
  moment,
  online,
  checkMove,
  analyzePosition,
  askRook,
  onComplete,
  onContinue,
  dailyGoal,
}: {
  readonly moment: MomentSpec;
  readonly online: boolean;
  readonly checkMove: (
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
    question: { text: string; fen: string; boardMoveUci?: string | undefined },
    signal: AbortSignal,
  ) => Promise<QuestionOutcome>;
  // Called once with the finished result, to record it.
  readonly onComplete: (result: MomentResult) => void;
  readonly onContinue: () => void;
  // Today's goal, which fills on the celebration.
  readonly dailyGoal?:
    | { readonly done: number; readonly target: number }
    | undefined;
}) {
  const start: BoardView = { fen: moment.fen, arrows: [], outlines: [] };
  const [session, setSession] = useState<MomentSession>(startSession);
  const [view, setView] = useState<BoardView>(start);
  const [say, setSay] = useState<Say>({
    text: "Take your time. Look for checks, captures and threats.",
    mood: "idle",
  });
  const [selected, setSelected] = useState<Square | undefined>();
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<SanMove | undefined>();
  const [confirm, setConfirm] = useState<
    Extract<QuestionOutcome, { kind: "confirm" }> | undefined
  >();
  const [sheet, setSheet] = useState<"celebrate" | "missed" | undefined>();
  // Created in the effect so StrictMode's mount, unmount and remount leaves a
  // live controller.
  const controller = useRef(new AbortController());
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => {
      current.abort();
      window.clearTimeout(timer.current);
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
  const storyboard = [
    ...lineStoryboard(moment.fen, solvedLine),
    ...(alternative ? [alternative] : []),
  ];
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

  function send(...events: SessionEvent[]) {
    setSession((current) => events.reduce(advanceSession, current));
  }

  // The board answers the tap at once; Rook's reply follows once the engine
  // has checked the move.
  function showPlayed(uci: string, previewTag?: string) {
    try {
      const after = new Chess(moment.fen).move(uciMove(uci)).after;
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

  function later(action: () => void, ms: number) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(action, ms);
  }

  function rewind(withScan: boolean) {
    const scan = withScan ? scanHint(moment.fen) : undefined;
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

  async function preview(uci: string, understood?: string) {
    if (solving) send({ kind: "help" });
    send({ kind: "explore", key: `preview:${uci}` });
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

  // Show, don't tell: the line plays on the board, one captioned frame at a
  // time, and stays on its last frame until Reset.
  function playStoryboard(
    frames: readonly StoryFrame[],
    mood: RookMood,
    understood?: string,
    then?: () => void,
  ) {
    if (frames.length === 0) {
      setSay({
        text: `Stockfish rates ${bestSan} as the best move here.`,
        mood,
        understood,
      });
      then?.();
      return;
    }
    let step = 0;
    const next = () => {
      const frame = frames[step];
      if (!frame) {
        then?.();
        return;
      }
      setView({
        fen: frame.fen,
        lastMoveUci: frame.moveUci,
        animate: true,
        arrows: frame.arrows,
        outlines: frame.outlines,
        control: frame.control,
      });
      setSay({ text: frame.caption, mood, understood });
      step += 1;
      later(next, STORY_STEP_MS);
    };
    next();
  }

  function reset() {
    window.clearTimeout(timer.current);
    setReply(undefined);
    setView(
      solving
        ? { fen: moment.fen, arrows: ghostArrows(attempts), outlines: [] }
        : start,
    );
    setSay({
      text: solving
        ? "Back to the start. Your move."
        : "Back to the start. Tap a chip to see it again.",
      mood: "idle",
    });
  }

  // The answer plays on the board; the player can then ask about it and taps
  // Done when ready.
  function showMe() {
    send({ kind: "show" });
    playStoryboard(storyboard, "warm");
  }

  function finish() {
    const finished = sessionResult(session);
    if (!finished) return;
    send({ kind: "finish" });
    onComplete(finished);
  }

  function act(action: RoutedAction, understood?: string) {
    setConfirm(undefined);
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
        if (action.uci === moment.bestUci && !solving) {
          playStoryboard(storyboard, "happy", understood);
          return;
        }
        if (action.uci === reply?.uci) {
          const beforeReply = new Chess(moment.fen);
          const tried = attempts.at(-1);
          try {
            if (tried) beforeReply.move(uciMove(tried.uci));
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
        void preview(action.uci, understood);
        return;
      case "what-if":
        if (action.uci === defence?.uci && afterSolution) {
          playStoryboard(
            lineStoryboard(afterSolution, defence.line, learnerColor),
            "idle",
            understood,
          );
          return;
        }
        void preview(action.uci, understood);
        return;
      case "show-line":
        playStoryboard(storyboard, "happy", understood);
        return;
      case "show-me":
        showMe();
        return;
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

  async function ask(text: string) {
    setBusy(true);
    setSay({ text: "Let me think…", mood: "think" });
    const outcome = await askRook(
      { text, fen: view.fen, boardMoveUci: undefined },
      controller.current.signal,
    );
    setBusy(false);
    switch (outcome.kind) {
      case "act":
        act(outcome.action, outcome.understood);
        return;
      case "confirm":
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
        setSay({
          text: "I didn't catch that. Tap a chip instead.",
          mood: "hmm",
        });
    }
  }

  function selectSquare(square: Square) {
    if (busy || !solving || view.fen !== moment.fen) return;
    if (selected && legalTargets(moment.fen, selected).includes(square)) {
      const piece = new Chess(moment.fen).get(selected);
      const promotes =
        piece?.type === "p" && (square.endsWith("8") || square.endsWith("1"));
      void tryMove(`${selected}${square}${promotes ? "q" : ""}`);
      return;
    }
    const piece = new Chess(moment.fen).get(square);
    const turn = moment.fen.split(" ")[1];
    setSelected(piece?.color === turn ? square : undefined);
  }

  const chips: readonly Chip[] = confirm
    ? []
    : chipsFor(kind, {
        fen: view.fen,
        bestUci: moment.bestUci,
        playedInGame: moment.playedInGame,
        reply,
        bestNonSolution: moment.bestNonSolution,
        bestDefence: defence,
        quiet: false,
        online,
      });
  const turn = moment.fen.split(" ")[1] === "w" ? "White" : "Black";
  const atStart = view.fen === moment.fen;
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
      view.outlines.length > 0 ||
      view.arrows.length > ghostArrows(attempts).length);
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
          legalTargets={selected ? legalTargets(moment.fen, selected) : []}
          onSquareSelect={selectSquare}
          disabled={busy || !solving || !atStart}
          extraArrows={
            goalMarks ? [...goalMarks.arrows, ...view.arrows] : view.arrows
          }
          outlines={goalMarks ? goalMarks.outlines : view.outlines}
          previewTag={view.previewTag}
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
        {(solving || showReset) && (
          <div className="moment__tools">
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
        {confirm ? (
          <div className="ui-chip-row" role="group" aria-label="Did you mean">
            <button
              type="button"
              className="ui-chip ui-chip--primary"
              onClick={() => {
                act(confirm.action, confirm.understood);
              }}
            >
              {confirm.label}
            </button>
            <button
              type="button"
              className="ui-chip"
              onClick={() => {
                act({ kind: "something-else" });
              }}
            >
              Something else
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
