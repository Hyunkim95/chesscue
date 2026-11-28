import { isSidePanel } from "../../shared/navigation/side-panel";
import { BoardBack } from "../../shared/navigation/BoardBack";
import { LoadingMark, LoadingText } from "../../shared/loading/LoadingState";
import { BusyButton } from "../../shared/ui/primitives";
import { Chess, SQUARES, type Move, type Square } from "chess.js";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  RookBoardShelf,
  RookConversationButton,
  RookMessage,
  HandsFreeIcon,
  SendIcon,
} from "../../shared/rook/RookMessage";
import {
  EXPLANATION_LINE_PLIES,
  equalSearchReference,
  type ReviewReply,
} from "../../application/analyze-game/analyze-review-reply";
import type { AssessPosition } from "../../application/analyze-game/assess-position";
import type { ReplayFrame } from "../../domain/analysis/replay-game";
import {
  beforeMoveHint,
  boardMoveCue,
  legalBoardLine,
  moveArrow,
  openedPawnExchange,
  type BoardMoveCue,
} from "../../domain/analysis/board-move-cues";
import type { PlayerColor } from "../../domain/game/types";
import { materialBalance } from "../../domain/game/board-balance";
import { createRookExplorationCoach } from "../../infrastructure/ai/rook-exploration-gemini";
import { pieceNames, pieceSymbols } from "../board/board-pieces";
import {
  HintButton,
  NextMovePill,
  type HintLevel,
} from "../board/BoardHintControls";
import type { SquareControlChange } from "../board/ChessBoard";
import { PromotionPiece } from "../board/PromotionPiece";
import { SkillSeal } from "../curriculum/SkillSeal";
import { useRookNarration } from "../../shared/rook/use-rook-narration";
import { useRookSpeech } from "../../shared/rook/use-rook-speech";
import { RookSpeechStatus } from "../../shared/rook/RookSpeechStatus";
import {
  explainBetterMove,
  explainComparedMove,
  explainContinuation,
  explainOpenedPawnExchange,
} from "../review/explain-continuation";
import { ReviewBoard } from "../review/ReviewBoard";
import { TrainingStage, type AnalyzeReply } from "../review/GuidedMoveFeedback";
import type { ReviewMistakeEvidence } from "../../domain/analysis/review-mistake";
import { REVIEW_MOVE_TOLERANCE_CP } from "../../domain/analysis/review-training";
import { scanHint } from "../../domain/analysis/forcing-moves";
import {
  MISSED_LINE_WORDING_VERSION,
  explainMissedLine,
} from "../../domain/analysis/explain-miss";
import {
  MINIMUM_BOARD_UNIT_PROBABILITY,
  boardSequence,
  predictBoardUnits,
} from "../../domain/curriculum/board-unit-model";
import { curriculum } from "../../domain/material/installed-curriculum";
import {
  classifyExperiment,
  moveLossCp,
} from "../../domain/analysis/classify-experiment";
import { explainCheckedLoss, isGenericLoss } from "./explain-checked-loss";
import { explainLinePlan, explainLineStep } from "./explain-line-step";
import { proveLinePlan } from "./prove-line-plan";
import { RookEvaluation } from "./RookEvaluation";
import { useEvalBar, usePositionAssessment } from "../board/use-eval-bar";
import { rookCaptureAnswer } from "./rook-capture-answer";
import "./rook-exploration.css";

// Dev only: the exploration as PGN from its start position, so a board bug can
// be shared. Headers record the game move that led here and, when it differs
// from the line's end, the position on screen.
function explorationPgn(
  rootFen: string,
  line: readonly string[],
  originMoveUci: string | null,
  shownFen: string,
): string {
  const game = new Chess(rootFen);
  for (const san of line) game.move(san);
  if (originMoveUci) game.setHeader("OriginMove", originMoveUci);
  if (shownFen !== game.fen()) game.setHeader("ShownFEN", shownFen);
  return game.pgn();
}

interface Position {
  readonly id: number;
  readonly parent: number | null;
  readonly fen: string;
  readonly move: Move | null;
  readonly line: readonly string[];
}

export interface PracticeSave {
  // Where the retry appears in Practice, such as "Threats › Double attack".
  readonly location: string;
  readonly unitId: string;
}

interface Experiment {
  readonly stage:
    | "spot"
    | "retry"
    | "revealed"
    | "found"
    | "stronger"
    | "unchecked";
  readonly bestReply: ReviewReply;
  readonly strongerLine: readonly Move[];
  readonly position: Position;
  readonly rewind: Position;
  // Why the learner's move was flagged, kept for the chat record.
  readonly warning?: string;
  // The warning names a concrete board fact, so the reply needs no more.
  readonly concreteWarning?: boolean;
}

interface MoveComparison {
  readonly found: Move;
  readonly reference: Move;
  readonly source: "game" | "practice";
  readonly checkedReplies?: Readonly<Record<ComparisonView, Move | null>>;
  readonly checkedReplyScores?: Readonly<Record<ComparisonView, number>>;
}

type ComparisonView = "found" | "reference";

interface CommentaryAnchor {
  readonly position: Position;
  readonly line: readonly Move[];
  readonly step: number | null;
  readonly plan?: true;
  readonly wordingVersion?: string;
  // The practice unit for a missed tactic, shown before the explanation.
  readonly heading?: string;
  readonly experiment?: Experiment;
  readonly moveComparison?: MoveComparison;
}

function triedMoveMessage(
  move: Move,
  {
    recordedMove,
    bestBefore,
  }: { readonly recordedMove: string; readonly bestBefore: ReviewReply },
  verdict: "trails-best" | "weaker" | "close",
) {
  const recorded = new Chess(move.before).move(recordedMove).san;
  if (verdict === "weaker")
    return `${move.san} is weaker than your game move ${recorded}. Try another move.`;
  if (verdict === "close")
    return `${move.san} is close to your game move ${recorded}. Try another move.`;
  const best = bestBefore.line[0];
  const stronger = best
    ? new Chess(move.before).move(best).san
    : "a stronger move";
  return `${move.san} beats your game move ${recorded}, but ${stronger} keeps more of your advantage. Try another move.`;
}

function mistakeComparison(
  { warning, position, strongerLine }: Experiment,
  reply: Move,
): MoveComparison | undefined {
  const [better, betterReply] = strongerLine;
  if (!warning || !position.move || !better) return undefined;
  return {
    found: better,
    reference: position.move,
    source: "game",
    checkedReplies: { found: betterReply ?? null, reference: reply },
  };
}

function looksLikeQuestion(text: string) {
  const words = text.trim().split(/\s+/);
  return (
    /\?\s*$/.test(text) ||
    words.length <= 2 ||
    /^(?:what|why|how|can|could|is|are|was|does|do|did|which|where|who|should|would|will|if)\b/i.test(
      text.trim(),
    )
  );
}

function asksForHint(question: string) {
  return /\b(?:hint|clue|help|stuck)\b/i.test(question);
}

function flaggedPrefix({ warning }: Experiment) {
  return warning ? warning + "\n\n" : "";
}

function commentaryFen(anchor: CommentaryAnchor | undefined) {
  return (
    anchor &&
    (anchor.step === null
      ? anchor.position.fen
      : anchor.line[anchor.step]?.after)
  );
}

type Coaching =
  | { readonly status: "idle" | "checking" }
  | {
      readonly status: "ready";
      readonly line: readonly Move[];
      readonly shownMove: Move | null;
      readonly text: string;
      readonly missedOpeningMove?: Move;
      // A turning-point try the board undid, marked until the next move.
      readonly triedMove?: Move;
      readonly experiment?: Experiment;
      readonly moveComparison?: MoveComparison;
      readonly comparisonView?: ComparisonView | null;
      readonly inspectedSquare?: Square | null;
    };

interface ReturnPoint {
  readonly position: Position;
  readonly step: number | null;
  readonly coaching: Coaching;
}

interface AnswerVisual {
  readonly fen: string;
  readonly cue: BoardMoveCue;
  readonly squares: readonly Square[];
}

interface ExchangeExplanation {
  readonly prefix: string;
  readonly move: Move;
  readonly anchor: CommentaryAnchor;
  readonly exchange: NonNullable<ReturnType<typeof openedPawnExchange>>;
}

interface ExplanationPlayback {
  readonly explanation: ExchangeExplanation;
  readonly captureStep: number;
  readonly stage: "reply" | "challenge" | "capture" | "recapture";
}

interface WhatIfBranch {
  readonly stage: "preview" | "trying" | "checking";
  readonly setup: CommentaryAnchor;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function squareControllers(position: Chess, square: Square) {
  return [
    ...position.attackers(square, "w"),
    ...position.attackers(square, "b"),
  ].flatMap((from) => {
    const piece = position.get(from);
    return piece ? [{ ...piece, square: from }] : [];
  });
}

function rookFocusSquares(
  board: Chess,
  move: Move,
  observation: string,
): readonly Square[] {
  if (board.isCheck()) {
    return [move.to, ...board.findPiece({ type: "k", color: board.turn() })];
  }
  const before = new Chess(move.before);
  const king = before.findPiece({ type: "k", color: move.color })[0];
  if (before.isCheck() && king) {
    const checkers = before.attackers(king, board.turn());
    return [...new Set([move.to, ...checkers])];
  }
  const namedSquares = new Set(observation.match(/\b[a-h][1-8]\b/g));
  namedSquares.delete(move.from);
  namedSquares.delete(move.to);
  return [
    move.to,
    ...SQUARES.filter((square) => namedSquares.has(square)).slice(0, 2),
  ];
}

// The board model's unit for a missed line, when it is confident. The model
// ships with the app; without it Rook explains the line with no heading.
async function missedTacticUnit(
  fen: string,
  line: readonly Move[],
): Promise<string | undefined> {
  const fens = boardSequence(
    fen,
    line.map(({ lan }) => lan),
  );
  if (!fens) return undefined;
  const { loadBoardUnitModel } =
    await import("../../infrastructure/models/board-unit-model-asset");
  const model = await loadBoardUnitModel();
  const [top] = model ? predictBoardUnits(model, fens) : [];
  if (!top || top.probability < MINIMUM_BOARD_UNIT_PROBABILITY)
    return undefined;
  return curriculum.stages
    .flatMap(({ units }) => units)
    .find(({ id }) => id === top.unitId)?.title;
}

export function RookExploration({
  fen,
  orientation,
  analyzeReply,
  assessPosition,
  topic,
  compact = false,
  openingChallenge,
  originMoveUci = null,
  introFrames,
  onIntroComplete,
  reviewTools,
  closeLabel = "Close exploration",
  onMistake,
  puzzle,
  onClose,
  forcingScanHint = false,
}: {
  readonly fen: string;
  readonly orientation: PlayerColor;
  readonly analyzeReply: AnalyzeReply;
  readonly assessPosition?: AssessPosition | null | undefined;
  readonly topic?: string;
  readonly compact?: boolean;
  readonly openingChallenge?:
    | {
        readonly recordedFen: string;
        readonly recordedMove: string;
        readonly opening: boolean;
        readonly bestBefore: ReviewReply;
      }
    | undefined;
  readonly originMoveUci?: string | null;
  readonly introFrames?: readonly ReplayFrame[] | undefined;
  readonly onIntroComplete?: (() => void) | undefined;
  readonly reviewTools?: ReactNode;
  readonly closeLabel?: string;
  readonly onMistake?:
    | ((evidence: ReviewMistakeEvidence) => Promise<PracticeSave | null>)
    | undefined;
  readonly puzzle?: {
    readonly motifCue?: string;
    readonly verifiedLine?: readonly string[];
    readonly onMove: (uci: string) => boolean;
    readonly source: ReactNode;
  };
  readonly onClose?: (() => void) | undefined;
  // Review's first hint is the checks, captures and threats scan.
  readonly forcingScanHint?: boolean;
}) {
  const root: Position = { id: 0, parent: null, fen, move: null, line: [] };
  const [introIndex, setIntroIndex] = useState<number | null>(() =>
    introFrames && introFrames.length > 1 && !prefersReducedMotion() ? 0 : null,
  );
  const introFrame =
    introIndex === null ? undefined : introFrames?.[introIndex];
  useEffect(() => {
    if (introIndex === null || !introFrame || !introFrames) return;
    const timer = window.setTimeout(() => {
      if (introIndex + 1 < introFrames.length - 1) {
        setIntroIndex(introIndex + 1);
      } else {
        setIntroIndex(null);
        onIntroComplete?.();
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
    };
  }, [introFrame, introFrames, introIndex, onIntroComplete]);
  const [nodes, setNodes] = useState<readonly Position[]>([root]);
  const positions = useRef(nodes);
  const [active, setActive] = useState(root);
  const [puzzleMove, setPuzzleMove] = useState<"accepted" | "try-again" | null>(
    null,
  );
  const previousPracticeMiss = useRef<Move | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<readonly Move[]>([]);
  const [practiceToast, setPracticeToast] = useState<
    (PracticeSave & { readonly move: string }) | null
  >(null);
  // A save made while Rook asks about the move waits for the reply, so the
  // notice does not answer Rook's question.
  const heldToast = useRef<(PracticeSave & { readonly move: string }) | null>(
    null,
  );
  const askingAboutMove = useRef(false);
  useEffect(() => {
    if (!practiceToast) return;
    const timer = window.setTimeout(() => {
      setPracticeToast(null);
    }, 6000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [practiceToast]);
  const [message, setMessage] = useState("");
  const [discussion, setDiscussion] = useState<"waiting" | "open" | "closed">(
    "waiting",
  );
  const discussionOpen = discussion === "open";
  const [turns, setTurns] = useState<
    readonly {
      id: number;
      role: "player" | "rook";
      text: string;
      sentAt: number;
      commentary?: boolean;
      anchor?: CommentaryAnchor | undefined;
      explanation?: ExchangeExplanation | undefined;
      nano?: boolean;
    }[]
  >([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [answerVisual, setAnswerVisual] = useState<AnswerVisual | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIfBranch | null>(null);
  const nextChatId = useRef(0);
  const chatInput = useRef<HTMLInputElement>(null);
  const chatLog = useRef<HTMLDivElement>(null);
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeOn = useRef(false);
  const narration = useRookNarration();
  const voice = useRookSpeech((text) => {
    if (handsFreeOn.current) {
      submitQuestion(text.trim().slice(0, 400), true);
      return;
    }
    setMessage((draft) =>
      [draft.trim(), text.trim()].filter(Boolean).join(" ").slice(0, 400),
    );
    chatInput.current?.focus({ preventScroll: true });
  });
  const listening = voice.state.status === "listening";
  const startingVoice =
    voice.state.status === "starting" || voice.state.status === "installing";
  const finishingVoice = voice.state.status === "finishing";
  const voiceActive = listening || startingVoice || finishingVoice;

  const [scores, setScores] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [replyAnimation, setReplyAnimation] = useState<{
    readonly lastStep: number;
  } | null>(null);
  const [explanationPlayback, setExplanationPlayback] =
    useState<ExplanationPlayback | null>(null);
  useEffect(() => {
    if (!replyAnimation || demoStep === null) return;
    const replyIsShown = demoStep === replyAnimation.lastStep;
    const timer = window.setTimeout(
      () => {
        if (replyIsShown) setReplyAnimation(null);
        else setDemoStep(replyAnimation.lastStep);
      },
      replyIsShown ? 400 : 620,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [demoStep, replyAnimation]);
  useEffect(() => {
    if (
      !explanationPlayback ||
      replyAnimation ||
      explanationPlayback.stage === "recapture"
    )
      return;
    const { stage, captureStep } = explanationPlayback;
    const timer = window.setTimeout(
      () => {
        const next =
          stage === "reply"
            ? "challenge"
            : stage === "challenge"
              ? "capture"
              : "recapture";
        if (next !== "challenge") {
          const step = next === "capture" ? captureStep : captureStep + 1;
          setDemoStep(step);
          if (!prefersReducedMotion()) setReplyAnimation({ lastStep: step });
        }
        setExplanationPlayback({ ...explanationPlayback, stage: next });
      },
      stage === "reply" ? 700 : 1300,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [explanationPlayback, replyAnimation]);
  const [coaching, setCoaching] = useState<Coaching>({ status: "idle" });
  const [strongerSearch, setStrongerSearch] = useState<
    "idle" | "checking" | "unconfirmed"
  >("idle");
  const [returnPoint, setReturnPoint] = useState<ReturnPoint | null>(null);
  const [hintLevel, setHintLevel] = useState<HintLevel>(0);
  const [pgnCopy, setPgnCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [inspectedEscape, setInspectedEscape] = useState<{
    readonly move: Move;
    readonly square: Square;
  } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const recordedEvaluation = useRef<{ fen: string; reply: ReviewReply } | null>(
    null,
  );
  const chatRequest = useRef<AbortController | null>(null);
  const coach = useRef<ReturnType<typeof createRookExplorationCoach>>(null);
  const stage = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!compact) stage.current?.scrollIntoView({ block: "start" });
  }, [compact]);
  useLayoutEffect(() => {
    const log = chatLog.current;
    if (log && turns.length > 0) {
      log.scrollTop = compact ? 0 : log.scrollHeight;
    }
  }, [compact, discussionOpen, turns]);
  const moveComparison =
    coaching.status === "ready" && demoStep === null
      ? coaching.moveComparison
      : undefined;
  const practiceComparison = moveComparison?.source === "practice";
  const foundLabel = practiceComparison ? "Solved" : "Better";
  const referenceLabel = practiceComparison ? "Earlier try" : "Original";
  const comparisonView =
    coaching.status === "ready" ? coaching.comparisonView : null;
  const comparisonMove =
    moveComparison && comparisonView
      ? moveComparison[comparisonView]
      : undefined;
  const comparisonPositions = useMemo(() => {
    if (!moveComparison) return undefined;
    return {
      found: new Chess(moveComparison.found.after),
      reference: new Chess(moveComparison.reference.after),
    };
  }, [moveComparison]);
  const controlChanges = useMemo(() => {
    if (!moveComparison || !comparisonPositions) return undefined;
    const color = moveComparison.found.color;
    const changes = new Map<Square, SquareControlChange>();
    for (const square of SQUARES) {
      const referenceControls = comparisonPositions.reference.isAttacked(
        square,
        color,
      );
      const foundControls = comparisonPositions.found.isAttacked(square, color);
      if (referenceControls !== foundControls) {
        changes.set(square, foundControls ? "gained" : "lost");
      }
    }
    return changes;
  }, [comparisonPositions, moveComparison]);
  const inspectedSquare =
    comparisonMove && coaching.status === "ready"
      ? (coaching.inspectedSquare ?? undefined)
      : undefined;
  const squareInspection =
    inspectedSquare && comparisonPositions
      ? {
          found: squareControllers(comparisonPositions.found, inspectedSquare),
          reference: squareControllers(
            comparisonPositions.reference,
            inspectedSquare,
          ),
        }
      : undefined;
  const inspectedAttackers =
    comparisonView && squareInspection
      ? squareInspection[comparisonView].map(({ square }) => square)
      : [];
  const line = coaching.status === "ready" ? coaching.line : [];
  const lineLength = line.length;
  const demoMove = demoStep === null ? undefined : line[demoStep];
  const displayed = new Chess(demoMove?.after ?? active.fen);
  const options =
    selected === null
      ? []
      : displayed.moves({ square: selected, verbose: true });

  useEffect(
    () => () => {
      pending.current?.abort();
      chatRequest.current?.abort();
    },
    [],
  );

  function rememberScore(board: Chess, score: number) {
    setScores((previous) =>
      new Map(previous).set(board.fen(), board.turn() === "w" ? score : -score),
    );
  }

  function stopChat() {
    chatRequest.current?.abort();
    setChatBusy(false);
    setAnswerVisual(null);
    setReplyAnimation(null);
    setExplanationPlayback(null);
  }

  function releaseHeldToast() {
    if (heldToast.current) setPracticeToast(heldToast.current);
    heldToast.current = null;
  }

  // A flagged mistake opens the comparison so the better move is in view.
  function openComparison() {
    clearSelection();
    if (isSidePanel) setDiscussion("open");
  }

  function selectComparison(view: ComparisonView | null) {
    stopChat();
    clearSelection();
    setCoaching((current) =>
      current.status === "ready" && current.moveComparison
        ? {
            ...current,
            comparisonView: view,
            ...(view === null && { inspectedSquare: null }),
          }
        : current,
    );
  }

  function inspectSquare(square: Square) {
    if (!controlChanges?.has(square)) return;
    setCoaching((current) =>
      current.status === "ready" && current.comparisonView
        ? { ...current, inspectedSquare: square }
        : current,
    );
  }

  function postCommentary(
    text: string,
    anchor?: CommentaryAnchor,
    explanation?: ExchangeExplanation,
  ) {
    const turn = {
      id: nextChatId.current++,
      role: "rook",
      text,
      sentAt: Date.now(),
      commentary: true,
      anchor,
      explanation,
    } as const;
    setTurns((previous) => {
      const last = previous.at(-1);
      return last?.commentary &&
        last.text === text &&
        commentaryFen(last.anchor) === commentaryFen(anchor)
        ? previous
        : [...previous, turn];
    });
    setDiscussion((current) => (current === "waiting" ? "open" : current));
  }

  async function recordMistake(
    move: Move,
    before: ReviewReply,
    after: ReviewReply,
  ) {
    if (before.line[0] === move.lan || after.line.length === 0) return;
    if (!onMistake) return;
    const saved = await onMistake({
      fen: move.before,
      attemptedMove: move.lan,
      before: { ...before, line: [...before.line] },
      after: { ...after, line: [...after.line] },
    });
    if (saved === null) return;
    const toast = { ...saved, move: move.san };
    if (askingAboutMove.current) heldToast.current = toast;
    else setPracticeToast(toast);
  }

  function checkedPracticeComparison(
    move: Move | null,
    accepted: boolean | undefined,
  ): MoveComparison | undefined {
    if (!move || accepted === undefined) return undefined;
    if (!accepted) {
      previousPracticeMiss.current = move;
      return undefined;
    }
    const reference = previousPracticeMiss.current;
    if (reference?.before !== move.before || reference.lan === move.lan)
      return undefined;
    return { found: move, reference, source: "practice" };
  }

  async function investigate(
    next: Position,
    onLearnerSide: boolean,
    practiceAccepted?: boolean,
  ) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setDemoStep(null);
    setCoaching({ status: "checking" });
    try {
      const board = new Chess(next.fen);
      const exchange =
        practiceAccepted !== undefined && next.move
          ? openedPawnExchange(board, next.move)
          : null;
      if (isSidePanel && exchange) setDiscussion("open");
      if (board.isGameOver()) {
        const checkmate = board.isCheckmate();
        const matePlan =
          checkmate && next.move ? explainLinePlan([next.move]) : null;
        const moveComparison = checkedPracticeComparison(
          next.move,
          practiceAccepted,
        );
        setCoaching({
          status: "ready",
          line: [],
          shownMove: checkmate ? next.move : null,
          text: "",
          ...(moveComparison && { moveComparison }),
        });
        postCommentary(
          checkmate
            ? `Nice find. ${matePlan?.text ?? "That’s checkmate."}`
            : "The game ends in a draw. Rewind to explore another line.",
          {
            position: next,
            line: [],
            step: null,
            ...(moveComparison && { moveComparison }),
          },
        );
        return;
      }
      const beforeMove = next.move;
      const judging = beforeMove !== null && !practiceAccepted;
      const result = await analyzeReply(
        next.fen,
        controller.signal,
        false,
        judging ? "judgement" : undefined,
      );
      controller.signal.throwIfAborted();
      const reply = result?.line[0] ?? null;
      if (reply === null || result === null) {
        setCoaching({
          status: "ready",
          line: [],
          shownMove: null,
          text: "",
        });
        postCommentary(
          "Stockfish couldn’t check this position. Ask again to retry.",
        );
        return;
      }
      rememberScore(board, result.evaluationCpFromSideToMove);
      const best =
        beforeMove && judging
          ? await analyzeReply(
              beforeMove.before,
              controller.signal,
              true,
              "judgement",
            )
          : null;
      const before =
        best &&
        beforeMove &&
        (await equalSearchReference(
          analyzeReply,
          best,
          beforeMove,
          controller.signal,
        ));
      const verdict =
        beforeMove && judging
          ? classifyExperiment(beforeMove.lan, before, result)
          : "continue";
      controller.signal.throwIfAborted();
      const replyMove = board.move(reply);
      const verifiedMoves = [
        replyMove,
        ...(result.evidenceLine ?? result.line)
          .slice(1)
          .map((uci) => board.move(uci)),
      ];
      const moveComparison = checkedPracticeComparison(
        beforeMove,
        practiceAccepted,
      );
      const prior = positions.current.find(({ id }) => id === next.parent);
      if (verdict === "spot" && prior && before) {
        if (onLearnerSide) {
          askingAboutMove.current = true;
          void recordMistake(beforeMove, before, result);
        }
        const startingBoard = new Chess(beforeMove.before);
        const strongerLine = (before.evidenceLine ?? before.line).map((uci) =>
          startingBoard.move(uci),
        );
        const loss = explainCheckedLoss(beforeMove, result, before);
        const asking = {
          status: "ready",
          line: verifiedMoves,
          shownMove: null,
          text: `What were you trying to do with ${beforeMove.san}?`,
          experiment: {
            stage: "spot",
            position: next,
            rewind: prior,
            bestReply: result,
            strongerLine,
            warning: `You played ${beforeMove.san}. ${loss}`,
            concreteWarning: !isGenericLoss(loss),
          },
        } as const;
        setCoaching(asking);
        return;
      }
      const reviewAttempt =
        practiceAccepted === false && before && prior
          ? {
              stage: "unchecked" as const,
              position: next,
              rewind: prior,
              bestReply: result,
              strongerLine: [],
            }
          : undefined;
      if (exchange && beforeMove && prior) {
        const explanation: ExchangeExplanation = {
          prefix: `You played ${beforeMove.san}.`,
          move: beforeMove,
          anchor: { position: prior, line: [beforeMove], step: 0 },
          exchange,
        };
        setReturnPoint({
          position: next,
          step: null,
          coaching: {
            status: "ready",
            line: verifiedMoves,
            shownMove: beforeMove,
            text: "",
            ...(reviewAttempt && { experiment: reviewAttempt }),
            ...(moveComparison && { moveComparison }),
          },
        });
        setActive(prior);
        setCoaching({
          status: "ready",
          line: [beforeMove, exchange.capture, exchange.recapture],
          shownMove: null,
          text: "",
        });
        setDemoStep(0);
        setExplanationPlayback({
          explanation,
          captureStep: 1,
          stage: "reply",
        });
        postCommentary(
          `${explanation.prefix} ${explainOpenedPawnExchange(beforeMove, exchange)}`,
          undefined,
          explanation,
        );
        setDiscussion("open");
        return;
      }
      showCheckedContinuation(
        next,
        verifiedMoves,
        onLearnerSide && verdict !== "standout",
        {
          praise: verdict === "standout",
          ...(reviewAttempt && { experiment: reviewAttempt }),
          ...(moveComparison && { comparison: { moves: moveComparison } }),
        },
      );
    } catch {
      if (!controller.signal.aborted) {
        setCoaching({ status: "ready", line: [], shownMove: null, text: "" });
        postCommentary(
          "Stockfish couldn’t check this position. Ask again to retry.",
        );
      }
    }
  }

  function showCheckedContinuation(
    next: Position,
    line: readonly Move[],
    playReply: boolean,
    {
      praise = false,
      text = "",
      comparison,
      experiment,
    }: {
      readonly praise?: boolean;
      readonly text?: string;
      readonly experiment?: Experiment;
      readonly comparison?: {
        readonly explanation?: string;
        readonly moves: MoveComparison;
      };
    } = {},
  ) {
    const reply = playReply ? line[0] : undefined;
    const prior = positions.current.find(({ id }) => id === next.parent);
    const shownMove = reply ?? next.move;
    const shownPosition = reply ? advance(next, reply) : next;
    const checkedLine = reply ? line.slice(1) : line;
    const moveComparison = comparison?.moves;
    setCoaching({
      status: "ready",
      line: checkedLine,
      shownMove,
      text,
      ...(experiment && { experiment }),
      ...(moveComparison && { moveComparison }),
    });
    if (!shownMove) return;

    const playerNote =
      reply && next.move
        ? `You played ${next.move.san}. ` +
          explainContinuation(
            next.move,
            new Chess(next.move.after),
            prior?.move ?? undefined,
          ) +
          "\n\n"
        : praise
          ? "Nice find. "
          : "";
    postCommentary(
      comparison?.explanation ??
        playerNote +
          (reply ? `I played ${shownMove.san}. ` : "") +
          explainContinuation(
            shownMove,
            new Chess(shownMove.after),
            (reply ? next.move : prior?.move) ?? undefined,
          ),
      {
        position: shownPosition,
        line: checkedLine,
        step: null,
        ...(experiment && { experiment }),
        ...(moveComparison && { moveComparison }),
      },
    );
  }

  function advance(from: Position, move: Move) {
    const existing = positions.current.find(
      (node) => node.parent === from.id && node.move?.lan === move.lan,
    );
    const next = existing ?? {
      id: positions.current.length,
      parent: from.id,
      fen: move.after,
      move,
      line: [...from.line, move.san],
    };
    if (!existing) {
      positions.current = [...positions.current, next];
      setNodes(positions.current);
    }
    setActive(next);
    setSelected(null);
    setPromotion([]);
    return next;
  }

  function visit(next: Position) {
    pending.current?.abort();
    setStrongerSearch("idle");
    stopChat();
    setActive(next);
    if (next.id === 0) setPuzzleMove(null);
    setSelected(null);
    setPromotion([]);
    setDemoStep(null);
    setCoaching({ status: "idle" });
    setHintLevel(0);
    setWhatIf(null);
  }

  async function tryReply(
    move: Move,
    prompt: Extract<Coaching, { status: "ready" }>,
    experiment: Experiment,
  ) {
    const expected = prompt.line[0];
    if (!expected) return;
    clearSelection();
    const after = new Chess(move.after);
    const matches = move.lan === expected.lan;
    let continuation = prompt.line.slice(1);
    if (!matches) {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setCoaching({ status: "checking" });
      try {
        continuation = [];
        if (!after.isCheckmate()) {
          const result = after.isDraw()
            ? { evaluationCpFromSideToMove: 0, line: [] }
            : await analyzeReply(move.after, controller.signal);
          controller.signal.throwIfAborted();
          if (!result) throw new Error("No checked evaluation");
          rememberScore(after, result.evaluationCpFromSideToMove);
          if (
            moveLossCp(
              experiment.bestReply.evaluationCpFromSideToMove,
              result.evaluationCpFromSideToMove,
            ) > REVIEW_MOVE_TOLERANCE_CP
          ) {
            setCoaching({
              ...prompt,
              experiment: { ...experiment, stage: "retry" },
              text: `${explainCheckedLoss(move, result, experiment.bestReply)} Try another reply.`,
            });
            return;
          }
          continuation = (result.evidenceLine ?? result.line).map((uci) =>
            after.move(uci),
          );
        }
      } catch {
        if (!controller.signal.aborted)
          setCoaching({
            ...prompt,
            experiment: { ...experiment, stage: "retry" },
            text: "Stockfish couldn’t verify that reply. Try again or use Next move.",
          });
        return;
      }
    }
    const shownPosition = advance(experiment.position, move);
    const foundExperiment = { ...experiment, stage: "found" } as const;
    const comparison = mistakeComparison(experiment, move);
    setCoaching({
      ...prompt,
      line: continuation,
      shownMove: move,
      text: "",
      experiment: foundExperiment,
      ...(comparison && {
        moveComparison: comparison,
        comparisonView: "reference",
      }),
    });
    if (comparison) openComparison();
    releaseHeldToast();
    postCommentary(
      flaggedPrefix(experiment) +
        (matches ? "You found it. " : "That reply works too. ") +
        explainContinuation(
          move,
          new Chess(move.after),
          experiment.position.move ?? undefined,
        ),
      {
        position: shownPosition,
        line: continuation,
        step: null,
        experiment: foundExperiment,
      },
    );
  }

  function evaluateAfterMove(
    board: Chess,
    signal: AbortSignal,
  ): Promise<ReviewReply | null> {
    if (board.isCheckmate())
      return Promise.resolve({ evaluationCpFromSideToMove: -99_999, line: [] });
    if (board.isDraw())
      return Promise.resolve({ evaluationCpFromSideToMove: 0, line: [] });
    return analyzeReply(board.fen(), signal, false, "judgement");
  }

  async function tryOpeningMove(
    move: Move,
    challenge: NonNullable<typeof openingChallenge>,
  ) {
    clearSelection();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setCoaching({ status: "checking" });
    try {
      const recorded = recordedEvaluation.current;
      const reference =
        recorded?.fen === challenge.recordedFen
          ? recorded.reply
          : await evaluateAfterMove(
              new Chess(challenge.recordedFen),
              controller.signal,
            );
      controller.signal.throwIfAborted();
      if (!reference) throw new Error("No evaluation for the recorded move");
      recordedEvaluation.current = {
        fen: challenge.recordedFen,
        reply: reference,
      };

      const after = new Chess(move.after);
      const result =
        move.after === challenge.recordedFen
          ? reference
          : await evaluateAfterMove(after, controller.signal);
      controller.signal.throwIfAborted();
      if (!result) throw new Error("No evaluation for the attempted move");
      const gain = -moveLossCp(
        -reference.evaluationCpFromSideToMove,
        result.evaluationCpFromSideToMove,
      );
      const continuation = result.line.map((uci) => after.move(uci));
      const best = await equalSearchReference(
        analyzeReply,
        challenge.bestBefore,
        move,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (!best) throw new Error("No evaluation for the best move");
      const trailsBest = classifyExperiment(move.lan, best, result) === "spot";
      if (gain > REVIEW_MOVE_TOLERANCE_CP && !trailsBest) {
        const game = new Chess(move.before);
        const recordedMove = game.move(challenge.recordedMove);
        const gameLine = reference.line.map((uci) => game.move(uci));
        const comparison = explainBetterMove({
          played: recordedMove,
          found: move,
          playedLine: gameLine,
          foundLine: continuation,
          playedReplyScore: reference.evaluationCpFromSideToMove,
          foundReplyScore: result.evaluationCpFromSideToMove,
          gain,
          opening: challenge.opening,
        });
        rememberScore(new Chess(move.after), result.evaluationCpFromSideToMove);
        const board = new Chess(move.after);
        const playable =
          result.evidenceLine?.map((uci) => board.move(uci)) ?? continuation;
        showCheckedContinuation(advance(root, move), playable, true, {
          text: "You found a better move.",
          comparison: {
            explanation: comparison,
            moves: {
              found: move,
              reference: recordedMove,
              source: "game",
              checkedReplies: {
                found: continuation[0] ?? null,
                reference: gameLine[0] ?? null,
              },
              checkedReplyScores: {
                found: result.evaluationCpFromSideToMove,
                reference: reference.evaluationCpFromSideToMove,
              },
            },
          },
        });
        return;
      }

      const canExploreMistake = continuation.length > 0 && trailsBest;
      if (canExploreMistake) void recordMistake(move, best, result);
      setCoaching({
        status: "ready",
        line: [],
        shownMove: null,
        text:
          move.after === challenge.recordedFen
            ? "That’s the move you played. Try another."
            : triedMoveMessage(
                move,
                challenge,
                gain > REVIEW_MOVE_TOLERANCE_CP
                  ? "trails-best"
                  : gain < -REVIEW_MOVE_TOLERANCE_CP
                    ? "weaker"
                    : "close",
              ),
        triedMove: move,
        ...(canExploreMistake && { missedOpeningMove: move }),
      });
    } catch {
      if (!controller.signal.aborted) {
        setCoaching({
          status: "ready",
          line: [],
          shownMove: null,
          text: "Stockfish couldn’t verify that move. Try again.",
        });
      }
    }
  }

  async function tryWhatIfMove(move: Move, setup: CommentaryAnchor) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    clearSelection();
    setWhatIf({ stage: "checking", setup });
    const board = new Chess(move.after);
    let replies: readonly Move[] = [];
    try {
      const result = board.isGameOver()
        ? null
        : await analyzeReply(move.after, controller.signal);
      controller.signal.throwIfAborted();
      replies = legalBoardLine(
        move.after,
        result?.evidenceLine ?? result?.line ?? [],
      );
    } catch {
      if (controller.signal.aborted) return;
    }
    const [reply] = replies;
    const branch = [...setup.line, move, ...replies];
    const preview = {
      position: setup.position,
      line: branch,
      step: setup.line.length + (reply ? 1 : 0),
    };
    viewCommentaryPosition(preview, reply !== undefined);
    setWhatIf({ stage: "preview", setup });
    postCommentary(
      reply
        ? `After ${move.san}, Stockfish found ${reply.san}. ${explainContinuation(reply, new Chess(reply.after), move)}`
        : board.isGameOver()
          ? `${move.san}. ${explainContinuation(move, board)}`
          : `You tried ${move.san}. Stockfish couldn’t check a reply from this position.`,
      preview,
    );
  }

  function tryDifferentMove(setup: CommentaryAnchor) {
    viewCommentaryPosition(setup);
    setWhatIf({ stage: "trying", setup });
  }

  function play(move: Move) {
    stopChat();
    setHintLevel(0);
    if (
      whatIf?.stage === "trying" &&
      commentaryFen(whatIf.setup) === move.before
    ) {
      void tryWhatIfMove(move, whatIf.setup);
      return;
    }
    let from = active;
    if (demoStep !== null) {
      for (const checked of line.slice(0, demoStep + 1)) {
        from = advance(from, checked);
      }
    }
    if (coaching.status === "ready" && coaching.experiment && spotting) {
      void tryReply(move, coaching, coaching.experiment);
      return;
    }
    if (openingChallenge && from.id === root.id) {
      void tryOpeningMove(move, openingChallenge);
      return;
    }
    const openingAccepted =
      puzzle && from.id === 0 ? puzzle.onMove(move.lan) : undefined;
    if (openingAccepted !== undefined) {
      setPuzzleMove(openingAccepted ? "accepted" : "try-again");
    }
    const next = advance(from, move);
    const learner = orientation === "white" ? "w" : "b";
    void investigate(next, move.color === learner, openingAccepted);
  }

  function selectSquare(square: Square) {
    setPromotion([]);
    if (displayed.get(square)?.color === displayed.turn()) {
      setSelected(square);
      return;
    }
    const moves = options.filter((move) => move.to === square);
    if (moves.some((move) => move.promotion)) setPromotion(moves);
    else if (moves[0]) play(moves[0]);
  }

  const experiment =
    coaching.status === "ready" ? coaching.experiment : undefined;
  const spotting =
    experiment?.stage === "spot" || experiment?.stage === "retry";
  useLayoutEffect(() => {
    if (
      isSidePanel ||
      !compact ||
      (!discussionOpen && experiment?.stage !== "retry")
    )
      return;
    const boardStage = stage.current?.querySelector(
      ".game-review__board-stage",
    );
    const dock = stage.current?.querySelector<HTMLElement>(
      ".rook-exploration__composer-dock",
    );
    if (!boardStage || !dock) return;
    const showExchange = () => {
      if (
        stage.current?.closest(".app-frame--desktop") &&
        window.matchMedia("(min-width: 56.01rem)").matches
      ) {
        dock.style.removeProperty("--rook-chat-overhead");
        return;
      }
      const boardTop = boardStage.getBoundingClientRect().top;
      const drawer = chatLog.current;
      if (drawer) {
        const overhead =
          dock.getBoundingClientRect().bottom -
          boardTop -
          drawer.getBoundingClientRect().height;
        dock.style.setProperty(
          "--rook-chat-overhead",
          `${String(Math.ceil(overhead))}px`,
        );
      }
      const topInset = Number.parseFloat(
        getComputedStyle(boardStage).scrollMarginBlockStart,
      );
      if (boardTop < topInset) {
        boardStage.scrollIntoView({ block: "start", behavior: "instant" });
      }
      dock.scrollIntoView({ block: "nearest", behavior: "instant" });
    };
    showExchange();
    const observer = new ResizeObserver(showExchange);
    observer.observe(dock);
    observer.observe(boardStage);
    return () => {
      observer.disconnect();
      dock.style.removeProperty("--rook-chat-overhead");
    };
  }, [compact, discussionOpen, experiment?.stage, turns]);
  function reveal(current: Coaching = coaching) {
    if (current.status !== "ready") return;
    const experiment = current.experiment;
    if (experiment?.stage !== "spot" && experiment?.stage !== "retry") return;
    const coaching = current;
    const reply = coaching.line[0];
    if (!reply) return;
    visit(experiment.position);
    const revealedExperiment = { ...experiment, stage: "revealed" } as const;
    const comparison = mistakeComparison(experiment, reply);
    setCoaching({
      ...coaching,
      text: "",
      experiment: revealedExperiment,
      ...(comparison && {
        moveComparison: comparison,
        comparisonView: "reference",
      }),
    });
    if (comparison) openComparison();
    else setDemoStep(0);
    releaseHeldToast();
    const attempt = experiment.position.move;
    const connection = attempt
      ? explainLineStep([attempt, ...coaching.line], 1)
      : explainLineStep(coaching.line, 0);
    // A concrete warning already says why; the open comparison shows the rest.
    const brief = comparison !== undefined && experiment.concreteWarning;
    postCommentary(
      flaggedPrefix(experiment) +
        `I played ${reply.san}.` +
        (brief
          ? ""
          : " " +
            (connection ??
              explainContinuation(
                reply,
                new Chess(reply.after),
                attempt ?? undefined,
              ))),
      {
        position: experiment.position,
        line: coaching.line,
        step: 0,
        experiment: revealedExperiment,
      },
    );
    stage.current?.scrollIntoView({ block: "start" });
  }

  async function showStrongerLine(experiment: Experiment) {
    if (isSidePanel) setDiscussion("open");
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const deadline = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(19_000),
    ]);
    setStrongerSearch("checking");
    clearSelection();
    let strongerLine = experiment.strongerLine;
    let attemptedReply = experiment.bestReply;
    let checkedDeeper = false;
    let scores: { bestCp: number; playedCp: number } | undefined;
    try {
      const before = await analyzeReply(
        experiment.rewind.fen,
        deadline,
        false,
        "explanation",
      );
      deadline.throwIfAborted();
      const after =
        before &&
        (await analyzeReply(
          experiment.position.fen,
          deadline,
          false,
          "explanation",
        ));
      deadline.throwIfAborted();
      if (before && after) {
        if (
          before.line[0] === experiment.position.move?.lan ||
          moveLossCp(
            before.evaluationCpFromSideToMove,
            after.evaluationCpFromSideToMove,
          ) <= REVIEW_MOVE_TOLERANCE_CP
        ) {
          setStrongerSearch("unconfirmed");
          return;
        }
        const board = new Chess(experiment.rewind.fen);
        const moves = before.evidenceLine ?? before.line;
        const verified = moves.map((uci) => board.move(uci));
        if (
          verified.length >= strongerLine.length ||
          verified[0]?.lan !== strongerLine[0]?.lan
        )
          strongerLine = verified;
        attemptedReply = after;
        checkedDeeper = true;
        scores = {
          bestCp: before.evaluationCpFromSideToMove,
          playedCp: -after.evaluationCpFromSideToMove,
        };
        if (strongerLine.length < 5) {
          const tail = new Chess(experiment.rewind.fen);
          for (const move of strongerLine) tail.move(move.lan);
          if (!tail.isGameOver()) {
            const continuation = await analyzeReply(
              tail.fen(),
              deadline,
              false,
              "explanation",
            );
            deadline.throwIfAborted();
            const remaining = (
              continuation?.evidenceLine ??
              continuation?.line ??
              []
            ).slice(0, EXPLANATION_LINE_PLIES - strongerLine.length);
            const extension: Move[] = [];
            for (const uci of remaining) {
              if (tail.isGameOver()) break;
              extension.push(tail.move(uci));
            }
            strongerLine = [...strongerLine, ...extension];
          }
        }
      }
    } catch {
      if (controller.signal.aborted) return;
    }

    const [first] = strongerLine;
    if (!first) {
      setStrongerSearch("unconfirmed");
      return;
    }
    const tried = experiment.position.move;
    const attemptedBoard = new Chess(experiment.position.fen);
    const attemptedLine = tried
      ? [
          tried,
          ...(attemptedReply.evidenceLine ?? attemptedReply.line).map((uci) =>
            attemptedBoard.move(uci),
          ),
        ]
      : [];
    // A missed tactic whose payoff comes within three learner moves is
    // explained from the facts chess.js checks on the line. Otherwise the
    // move-consequence plan explains it, and a five-move fact reading covers
    // long lines the plan cannot verify.
    const missedInput = tried && {
      fen: experiment.rewind.fen,
      line: strongerLine.map(({ lan }) => lan),
      playedSan: tried.san,
      ...(scores && { scores }),
    };
    const shortMiss = missedInput && explainMissedLine(missedInput, "short");
    const plan = shortMiss
      ? null
      : await proveLinePlan(
          strongerLine,
          attemptedLine,
          deadline,
          async (fen, signal) => {
            const result = await analyzeReply(fen, signal);
            return result?.evidenceLine ?? result?.line ?? [];
          },
        ).catch(() => null);
    const missed =
      shortMiss ??
      (plan
        ? undefined
        : missedInput && explainMissedLine(missedInput, "long"));
    const heading =
      missed && (await missedTacticUnit(experiment.rewind.fen, strongerLine));
    if (controller.signal.aborted) return;
    visit(experiment.rewind);
    const shown = { ...experiment, stage: "stronger", strongerLine } as const;
    setCoaching({
      status: "ready",
      line: shown.strongerLine,
      shownMove: null,
      text: "",
      experiment: shown,
    });
    setDemoStep(0);
    postCommentary(
      missed?.text ??
        plan?.text ??
        `${checkedDeeper ? "The stronger line" : "The earlier checked line"} starts with ${first.san}. Rook could not verify why it works.`,
      {
        position: shown.rewind,
        line: shown.strongerLine,
        step: plan?.step ?? 0,
        ...(missed
          ? {
              plan: true,
              wordingVersion: MISSED_LINE_WORDING_VERSION,
              ...(heading && { heading }),
            }
          : plan && { plan: true, wordingVersion: plan.source.version }),
        experiment: shown,
      },
    );
    setDiscussion("open");
  }

  function clearSelection() {
    setSelected(null);
    setPromotion([]);
    setHintLevel(0);
  }

  const setupMoves = puzzle?.verifiedLine ?? openingChallenge?.bestBefore.line;
  const setupLine = useMemo(
    () => (setupMoves ? legalBoardLine(fen, setupMoves) : []),
    [fen, setupMoves],
  );
  const nextStep = (demoStep ?? -1) + 1;
  const setupPreview =
    !introFrame &&
    active.id === root.id &&
    demoStep === null &&
    coaching.status === "idle"
      ? setupLine
      : undefined;
  const availableLine = setupPreview ?? line;
  const hintMove =
    !introFrame &&
    !comparisonMove &&
    demoStep === null &&
    coaching.status !== "checking" &&
    (spotting || (active.id === root.id && setupLine.length > 0))
      ? availableLine[nextStep]
      : undefined;
  // Review starts with the checks, captures and threats scan, which lists every
  // forcing move without pointing at the answer.
  const hintOffset = forcingScanHint ? 1 : 0;
  const scan =
    forcingScanHint && hintMove && hintLevel === 1
      ? scanHint(hintMove.before)
      : undefined;
  const firstHint =
    hintMove && hintLevel === 1 + hintOffset
      ? beforeMoveHint(hintMove)
      : undefined;
  const pieceHint = hintMove !== undefined && hintLevel === 2 + hintOffset;
  const hintMessage =
    firstHint?.text ??
    (hintMove && pieceHint
      ? `Look at the ${pieceNames[hintMove.piece]} on ${hintMove.from}.`
      : undefined);
  function playOneMove() {
    if (strongerSearch === "checking") return;
    stopChat();
    clearSelection();
    if (spotting) {
      reveal();
    } else {
      const move = availableLine[nextStep];
      if (!move) return;
      if (setupPreview) {
        setCoaching({
          status: "ready",
          line: setupPreview,
          shownMove: null,
          text: "",
        });
      }
      setDemoStep(nextStep);
      const setup = [parent?.move, active.move].filter((move) => move != null);
      const connection = explainLineStep(
        [...setup, ...availableLine],
        setup.length + nextStep,
      );
      postCommentary(
        `${move.san}. ` +
          (connection ??
            explainContinuation(
              move,
              new Chess(move.after),
              availableLine[nextStep - 1] ?? active.move ?? undefined,
            )),
        {
          position: active,
          line: availableLine,
          step: nextStep,
          ...(experiment ? { experiment } : {}),
        },
      );
    }
  }

  function viewCommentaryPosition(
    anchor: CommentaryAnchor,
    animateReply = false,
  ) {
    if (coaching.status === "checking") return;
    if (commentaryFen(anchor) === displayed.fen()) {
      if (comparisonMove) selectComparison(null);
      return;
    }
    setReturnPoint(
      (previous) => previous ?? { position: active, step: demoStep, coaching },
    );
    visit(anchor.position);
    setCoaching({
      status: "ready",
      line: anchor.line,
      shownMove: anchor.step === null ? anchor.position.move : null,
      text: "",
      ...(anchor.experiment ? { experiment: anchor.experiment } : {}),
      ...(anchor.moveComparison && { moveComparison: anchor.moveComparison }),
    });
    if (
      animateReply &&
      anchor.step !== null &&
      anchor.step > 0 &&
      !prefersReducedMotion()
    ) {
      setDemoStep(anchor.step - 1);
      setReplyAnimation({ lastStep: anchor.step });
    } else setDemoStep(anchor.step);
    stage.current
      ?.querySelector(".review-board")
      ?.scrollIntoView({ block: "nearest" });
  }

  function returnToMyPosition() {
    if (!returnPoint) return;
    visit(returnPoint.position);
    setCoaching(returnPoint.coaching);
    setDemoStep(returnPoint.step);
    setReturnPoint(null);
  }

  const focusedMove =
    demoMove ?? (coaching.status === "ready" ? coaching.shownMove : null);
  const parent = nodes.find((node) => node.id === active.parent);
  const previousMove =
    demoStep === null
      ? parent?.move
      : demoStep === 0
        ? active.move
        : line[demoStep - 1];
  const observation = focusedMove
    ? explainContinuation(focusedMove, displayed, previousMove ?? undefined)
    : "";
  const movingChallenge =
    explanationPlayback?.stage === "challenge"
      ? explanationPlayback.explanation
      : undefined;
  const challengeVisual: AnswerVisual | undefined = movingChallenge && {
    fen: movingChallenge.move.after,
    cue: {
      arrows: [
        {
          from: movingChallenge.move.to,
          to: movingChallenge.exchange.target,
          kind: "threat",
        },
      ],
    },
    squares: [movingChallenge.move.to, movingChallenge.exchange.target],
  };
  const currentAnswer = challengeVisual ?? answerVisual;
  const visibleAnswer =
    discussionOpen &&
    !introFrame &&
    !spotting &&
    !comparisonMove &&
    currentAnswer?.fen === displayed.fen()
      ? currentAnswer
      : undefined;
  const focusSquares =
    visibleAnswer?.squares ??
    (hintMove && pieceHint
      ? [hintMove.from]
      : focusedMove
        ? rookFocusSquares(displayed, focusedMove, observation)
        : []);
  const triedMove =
    coaching.status === "ready" && active.id === root.id && demoStep === null
      ? coaching.triedMove
      : undefined;
  const moveCue = replyAnimation
    ? undefined
    : comparisonMove
      ? { arrows: [moveArrow(comparisonMove)] }
      : (visibleAnswer?.cue ??
        (scan ? { arrows: scan.arrows } : undefined) ??
        (triedMove
          ? { arrows: [{ ...moveArrow(triedMove), kind: "tried" }] }
          : undefined) ??
        (!introFrame && !spotting && focusedMove
          ? (boardMoveCue(displayed, focusedMove, previousMove ?? undefined) ??
            (demoMove ? { arrows: [moveArrow(demoMove)] } : undefined))
          : undefined));
  const pawnExchange =
    whatIf?.stage === "preview" &&
    !replyAnimation &&
    !availableLine[nextStep] &&
    demoMove
      ? openedPawnExchange(displayed, demoMove)
      : undefined;
  function showPawnExchange() {
    if (!pawnExchange || demoStep === null || !whatIf) return;
    const exchangeLine = [
      ...line.slice(0, demoStep + 1),
      pawnExchange.capture,
      pawnExchange.recapture,
    ];
    const preview = {
      position: active,
      line: exchangeLine,
      step: exchangeLine.length - 1,
    };
    viewCommentaryPosition(preview, true);
    setWhatIf({ stage: "preview", setup: whatIf.setup });
    postCommentary(
      `If ${pawnExchange.capture.san}, ${pawnExchange.recapture.san} takes the pawn back.`,
      preview,
    );
  }
  const escapeSquares =
    !comparisonMove && displayed.isCheckmate() ? moveCue?.squares : undefined;
  const selectedEscape =
    inspectedEscape?.move === focusedMove
      ? escapeSquares?.find(({ square }) => square === inspectedEscape.square)
      : undefined;
  function showExplanationStep(
    explanation: ExchangeExplanation,
    step: "challenge" | "capture" | "recapture",
  ) {
    const { anchor, exchange, move } = explanation;
    if (anchor.step === null || coaching.status === "checking") return;
    setExplanationPlayback(null);
    const base = anchor.line.slice(0, anchor.step + 1);
    const previewLine =
      step === "challenge"
        ? base
        : step === "capture"
          ? [...base, exchange.capture]
          : [...base, exchange.capture, exchange.recapture];
    const preview = {
      position: anchor.position,
      line: previewLine,
      step: previewLine.length - 1,
    };
    viewCommentaryPosition(preview, step === "recapture");
    setWhatIf({
      stage: "preview",
      setup: {
        position: anchor.position,
        line: base.slice(0, -1),
        step: anchor.step - 1,
      },
    });
    if (step === "challenge")
      setAnswerVisual({
        fen: move.after,
        cue: {
          arrows: [{ from: move.to, to: exchange.target, kind: "threat" }],
        },
        squares: [move.to, exchange.target],
      });
  }
  function selectBoardSquare(square: Square) {
    if (comparisonMove) inspectSquare(square);
    else if (escapeSquares && focusedMove) {
      if (escapeSquares.some((escape) => escape.square === square))
        setInspectedEscape({ move: focusedMove, square });
    } else selectSquare(square);
  }
  const turnText = displayed.isGameOver()
    ? displayed.isCheckmate()
      ? "Checkmate"
      : "Draw"
    : displayed.turn() === "w"
      ? "White to move"
      : "Black to move";
  async function discuss(id: number, question: string) {
    stopChat();
    const controller = new AbortController();
    chatRequest.current = controller;
    let explanation: ExchangeExplanation | undefined;
    function showReply(text: string, nano = false) {
      const sentAt = Date.now();
      setTurns((previous) => {
        const index = previous.findIndex(
          (turn) => turn.id === id && turn.role === "player",
        );
        if (index === -1) return previous;
        const reply = {
          id,
          role: "rook",
          text,
          sentAt,
          nano,
          explanation,
        } as const;
        const next = previous[index + 1];
        if (next?.id === id && next.role === "rook")
          return nano
            ? previous.with(index + 1, { ...reply, sentAt: next.sentAt })
            : previous;
        return previous.toSpliced(index + 1, 0, reply);
      });
    }
    setChatBusy(true);
    if (!spotting && coach.current === null) {
      coach.current = createRookExplorationCoach();
      void coach.current?.initialize().catch(() => undefined);
    }
    try {
      const square = SQUARES.find((item) =>
        new RegExp("\\b" + item + "\\b", "i").test(question),
      );
      let facts = "";
      let continuation: readonly string[] = [];
      let visual: Omit<AnswerVisual, "fen"> | undefined;
      let replyPreview: CommentaryAnchor | undefined;
      const requestedMove =
        /^(?:what if (?:i |we )?(?:play |played )?|i(?:’|'| a)m thinking (?:about |of )?|try )([a-h][1-8][a-h][1-8][qrbn]?|(?:[kqrbn])?[a-h1-8]{0,2}x?[a-h][1-8](?:=[qrbn])?|o-o(?:-o)?)[+#]?[?.!,]*$/i
          .exec(question)?.[1]
          ?.toLowerCase();
      const candidate =
        requestedMove &&
        displayed
          .moves({ verbose: true })
          .find(
            ({ lan, san }) =>
              lan.toLowerCase() === requestedMove ||
              san.toLowerCase().replace(/[+#]$/, "") === requestedMove,
          );
      let evalScore: number | undefined;
      let direct = true;
      // Rook asked the learner something, so a statement is their answer
      // even when it names a square.
      const answering = !looksLikeQuestion(question);
      if (spotting && answering && !asksForHint(question)) {
        reveal();
        return;
      }
      const verdictMove =
        active.id === root.id && coaching.status === "ready"
          ? coaching.missedOpeningMove
          : undefined;
      if (verdictMove && /^why\b/i.test(question)) {
        await investigate(advance(root, verdictMove), true);
        return;
      }
      if (openingChallenge && active.id === root.id && answering) {
        showReply(
          "Play the move you have in mind on the board and I’ll check it.",
        );
        return;
      }
      const capture = rookCaptureAnswer(
        question,
        displayed,
        spotting ? line[0] : undefined,
      );
      if (capture !== undefined) {
        facts = capture.text;
        if (capture.captures) {
          visual = {
            cue: { arrows: capture.captures.map(moveArrow) },
            squares: [...new Set(capture.captures.map(({ to }) => to))],
          };
        }
      } else if (/\bmaterial\b/i.test(question)) {
        const balance = materialBalance(displayed.fen());
        facts =
          balance === 0
            ? "Material is level."
            : `${balance > 0 ? "White" : "Black"} is ahead by ${String(Math.abs(balance))} ${Math.abs(balance) === 1 ? "pawn’s worth of material" : "points of material"}.`;
      } else if (spotting && square === undefined && !asksForHint(question)) {
        // The learner answered what they intended. Show the checked reply.
        reveal();
        return;
      } else if (spotting && square === undefined) {
        const revealLabel = compact ? "Next move" : "Show reply";
        const hasCheck = displayed
          .moves({ verbose: true })
          .some(({ san }) => /[+#]$/.test(san));
        facts = hasCheck
          ? `Start by looking for checks your opponent can give. Try one on the board, or use ${revealLabel}.`
          : `Look at which pieces your opponent attacks now. Try their reply on the board, or use ${revealLabel}.`;
      } else if (requestedMove && !spotting) {
        if (!candidate) {
          facts =
            "That move isn’t legal from the displayed position. Try selecting the piece to see its legal moves.";
        } else {
          visual = {
            cue: { arrows: [moveArrow(candidate)] },
            squares: [candidate.from, candidate.to],
          };
          const board = new Chess(candidate.after);
          const result = board.isGameOver()
            ? null
            : await analyzeReply(candidate.after, controller.signal);
          controller.signal.throwIfAborted();
          const reply = result?.line[0];
          if (reply) {
            const response = board.move(reply);
            const previewLine = [
              ...(demoStep === null ? [] : line.slice(0, demoStep + 1)),
              candidate,
              response,
            ];
            replyPreview = {
              position: active,
              line: previewLine,
              step: previewLine.length - 1,
            };
            const consequence = explainContinuation(response, board, candidate);
            continuation = [candidate.san, response.san];
            const prefix = `After ${candidate.san}, Stockfish found ${response.san}.`;
            facts = `${prefix} ${consequence}`;
            const exchange = openedPawnExchange(board, response);
            if (
              exchange &&
              consequence === explainOpenedPawnExchange(response, exchange)
            )
              explanation = {
                prefix,
                move: response,
                anchor: replyPreview,
                exchange,
              };
          } else {
            facts = explainContinuation(candidate, board);
          }
        }
      } else if (square) {
        const controllers = squareControllers(displayed, square);
        const names = (color: "w" | "b") =>
          controllers
            .filter((piece) => piece.color === color)
            .map((piece) => pieceNames[piece.type] + " on " + piece.square);
        const white = names("w");
        const black = names("b");
        facts = `Pieces attacking ${square}: White ${white.join(", ") || "none"}. Black ${black.join(", ") || "none"}.`;
        visual = {
          cue: {
            arrows: controllers.map((piece) => ({
              from: piece.square,
              to: square,
              kind: piece.color === "w" ? "control" : "threat",
            })),
          },
          squares: [square],
        };
      } else if (
        observation &&
        !/\b(?:what (?:comes|happens) next|show me (?:a|the) line|next move)\b/i.test(
          question,
        )
      ) {
        direct = false;
        facts = observation;
      } else if (displayed.isGameOver()) {
        facts = displayed.isCheckmate()
          ? "This position is checkmate. Rewind to explore another move."
          : "This position is drawn. Rewind to try a different line.";
      } else {
        direct = false;
        const result = await analyzeReply(displayed.fen(), controller.signal);
        controller.signal.throwIfAborted();
        const board = new Chess(displayed.fen());
        if (result?.line.length) {
          evalScore = result.evaluationCpFromSideToMove;
          rememberScore(displayed, evalScore);
          const checked = result.line.map((move) => board.move(move));
          continuation = checked.map(({ san }) => san);
          if (
            demoStep === null &&
            lineLength === 0 &&
            !experiment &&
            coaching.status !== "checking"
          ) {
            setCoaching({
              status: "ready",
              line: checked,
              shownMove: null,
              text: "",
            });
          }
          const first = checked[0];
          if (first) {
            facts =
              "I’ve checked a line from this position. Use Next move to explore it.";
            visual = {
              cue: { arrows: [moveArrow(first)] },
              squares: [first.from, first.to],
            };
          }
        }
      }
      const answer =
        facts ||
        "I couldn’t check a reply here. You can try a move or ask about a square.";
      showReply(answer);
      if (!spotting && !controller.signal.aborted) {
        if (replyPreview) {
          if (explanation && replyPreview.step !== null) {
            const exchangeLine = [
              ...replyPreview.line,
              explanation.exchange.capture,
              explanation.exchange.recapture,
            ];
            viewCommentaryPosition(
              { ...replyPreview, line: exchangeLine },
              true,
            );
            setExplanationPlayback({
              explanation,
              captureStep: replyPreview.step + 1,
              stage: "reply",
            });
          } else viewCommentaryPosition(replyPreview, true);
          setWhatIf({
            stage: "preview",
            setup: {
              position: replyPreview.position,
              line: replyPreview.line.slice(0, -1),
              step: replyPreview.line.length - 2,
            },
          });
        } else if (visual) setAnswerVisual({ ...visual, fen: displayed.fen() });
      }
      if (spotting || direct) return;
      const prompt = await coach.current?.ask(
        {
          fen: displayed.fen(),
          moves: [
            ...active.line,
            ...line.slice(0, (demoStep ?? -1) + 1).map(({ san }) => san),
          ],
          continuation,
          observation: answer,
          evaluationCp: evalScore,
          message: question,
          priorTurns: turns
            .slice(-6)
            .map(({ role, text }) => role + ": " + text),
          topic,
        },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (prompt && !answer.includes(prompt))
        showReply(answer + "\n\n" + prompt, true);
    } catch {
      if (!controller.signal.aborted)
        showReply(
          "I couldn’t finish checking that. Ask again or try a move on the board.",
        );
    } finally {
      if (chatRequest.current === controller) setChatBusy(false);
    }
  }

  const note = coaching.status === "ready" ? coaching.text : "";
  useEffect(() => {
    askingAboutMove.current = spotting;
    if (!spotting) heldToast.current = null;
  }, [spotting]);
  // Hands-free: Rook reads its question aloud, then listens for the answer.
  const spokenQuestion = experiment?.stage === "spot" ? note : "";
  const { readAloud } = narration;
  const listen = useRef(voice.start);
  useEffect(() => {
    listen.current = voice.start;
  });
  useEffect(() => {
    if (!handsFree || !spokenQuestion) return;
    readAloud(spokenQuestion, () => {
      if (handsFreeOn.current) void listen.current();
    });
  }, [handsFree, spokenQuestion, readAloud]);
  const lastTurn = turns.at(-1);
  const spokenReply = lastTurn?.role === "rook" ? lastTurn : undefined;
  useEffect(() => {
    if (handsFree && spokenReply) readAloud(spokenReply.text);
  }, [handsFree, spokenReply, readAloud]);
  const missedOpeningMove =
    active.id === root.id && coaching.status === "ready"
      ? coaching.missedOpeningMove
      : undefined;
  const openingMessage =
    !spotting && demoStep === null
      ? (openingChallenge ? note : "") ||
        (active.id === root.id
          ? (puzzle?.motifCue ??
            (openingChallenge
              ? "You missed a better move here. Can you find it?"
              : ""))
          : "")
      : "";
  const rewindsPosition =
    experiment !== undefined || (puzzle !== undefined && demoStep === null);
  const atBranch = demoStep === null && parent !== undefined;
  const rewindLabel = rewindsPosition
    ? "Rewind"
    : atBranch
      ? "Back to start"
      : returnPoint
        ? "Leave checked line"
        : "Back to my position";

  const showReplyControl =
    discussionOpen && spotting && turns.at(-1)?.role === "rook";
  const composerControls = !compact && turns.length > 0 && (
    <div className="rook-exploration__composer-controls">
      {showReplyControl && (
        <button
          type="button"
          className="rook-exploration__chat-reveal"
          onClick={() => {
            reveal();
          }}
        >
          Show reply
        </button>
      )}
      <button
        type="button"
        className="rook-exploration__chat-toggle"
        aria-expanded={discussionOpen}
        aria-label={discussionOpen ? "Hide conversation" : "Show conversation"}
        onClick={() => {
          setDiscussion(discussionOpen ? "closed" : "open");
        }}
      >
        {discussionOpen ? "Hide chat" : "Show chat"}
      </button>
    </div>
  );

  const showHeading = !compact && !isSidePanel;
  const hideConversation = compact && discussionOpen;
  const discussionLabel = hideConversation
    ? "Hide conversation"
    : "Discuss position";

  // One Stockfish reading feeds the score under the board; the bar beside
  // the board follows whatever position the board shows. A practice puzzle
  // has no bar: a reading would hint the answer.
  const reading = usePositionAssessment(
    displayed.fen(),
    assessPosition ?? undefined,
    {
      known: scores.get(displayed.fen()),
      paused: coaching.status === "checking",
    },
  );
  const boardFen = comparisonMove?.after ?? introFrame?.fen ?? displayed.fen();
  const barReading = useEvalBar(
    boardFen,
    assessPosition && !puzzle ? assessPosition : undefined,
  );
  const balance =
    assessPosition && !puzzle ? (barReading ?? "reserved") : undefined;
  const evaluation = (
    <RookEvaluation
      state={assessPosition ? reading.now : { kind: "unavailable" }}
      hidden={comparisonMove !== undefined}
    />
  );

  const boardIntro = (
    <>
      {introFrame ? (
        <div
          className="board-action-row rook-exploration__transport"
          role="group"
          aria-label="Game replay intro"
        >
          <p className="rook-exploration__move">
            {introFrame.lastMoveSan ?? "Starting position"}
          </p>
          <button
            type="button"
            className="review-action"
            onClick={() => {
              setIntroIndex(null);
              onIntroComplete?.();
            }}
          >
            Skip replay
          </button>
        </div>
      ) : !isSidePanel ? (
        evaluation
      ) : null}
    </>
  );
  const previewActions = (
    <>
      {!introFrame && !comparisonMove && returnPoint && (
        <div className="rook-exploration__position-return">
          <button type="button" onClick={returnToMyPosition}>
            <span aria-hidden="true">↩</span>
            Return to my position
          </button>
          {whatIf?.stage === "preview" && !replyAnimation && (
            <button
              type="button"
              onClick={() => {
                tryDifferentMove(whatIf.setup);
              }}
            >
              Try a different move
            </button>
          )}
        </div>
      )}
    </>
  );
  const boardCues = (
    <>
      {selectedEscape && (
        <p className="rook-exploration__cue" role="status">
          {selectedEscape.label}
        </p>
      )}
      {!isSidePanel && previewActions}
      {whatIf?.stage === "trying" && (
        <p className="rook-exploration__cue" role="status">
          Try a move. Rook will show Stockfish’s reply.
        </p>
      )}
      {whatIf?.stage === "checking" && (
        <p className="rook-exploration__cue" role="status">
          <LoadingText>Checking the reply…</LoadingText>
        </p>
      )}
      {scan && (
        <div
          className="rook-exploration__cue rook-exploration__scan"
          role="status"
          aria-label="Check, capture, threat scan"
        >
          <p>Check, capture, threat scan:</p>
          <ul>
            {scan.rows.map(({ kind, label, moves }) => (
              <li key={label} data-scan-kind={kind}>
                <span
                  className="rook-exploration__scan-key"
                  aria-hidden="true"
                />
                <strong>{label}:</strong> {moves}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hintMessage && (
        <p className="rook-exploration__cue" role="status">
          {hintMessage}
        </p>
      )}
      {!introFrame && spotting && note && (
        <div className="rook-board-message rook-reply-challenge" role="status">
          <RookMessage>
            <p>{note}</p>
          </RookMessage>
        </div>
      )}
    </>
  );
  const openingGuidance = (
    <>
      {!introFrame &&
        (openingChallenge !== undefined || openingMessage !== "") && (
          <div className="rook-opening-feedback">
            <div
              className="rook-board-message rook-opening-feedback__message"
              role="status"
              aria-label="Rook’s guidance"
              aria-atomic="true"
            >
              {openingMessage && (
                <RookMessage>
                  <p>{openingMessage}</p>
                </RookMessage>
              )}
            </div>
            {missedOpeningMove && (
              <button
                type="button"
                className="review-action"
                onClick={() => {
                  void investigate(advance(root, missedOpeningMove), true);
                }}
              >
                Why not {missedOpeningMove.san}?
              </button>
            )}
          </div>
        )}
    </>
  );
  const practiceSaveConfirmation = (
    <>
      {onMistake && (
        <div
          className="rook-practice-toast"
          role="status"
          aria-label="Practice update"
          aria-atomic="true"
        >
          {practiceToast && (
            <>
              <SkillSeal
                unitId={practiceToast.unitId}
                className="rook-practice-toast__seal"
              />
              <div>
                <p>
                  <strong>Saved {practiceToast.move} to Practice</strong>
                </p>
                <p className="rook-practice-toast__path">
                  {practiceToast.location}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
  const boardFeedback = (
    <>
      {strongerSearch === "unconfirmed" && (
        <p className="rook-exploration__cue" role="status">
          The deeper search couldn’t confirm a stronger move.
        </p>
      )}
      {inspectedSquare && squareInspection && (
        <div
          className="rook-exploration__square-inspection"
          role="status"
          aria-label="Square control"
        >
          <strong>Control of {inspectedSquare}</strong>
          <dl>
            {(["found", "reference"] as const).map((view) => (
              <div key={view}>
                <dt>{view === "found" ? foundLabel : referenceLabel}</dt>
                <dd>
                  {squareInspection[view].length ? (
                    <ul>
                      {squareInspection[view].map(({ type, color, square }) => (
                        <li key={square}>
                          <span
                            aria-label={`${color === "w" ? "White" : "Black"} ${pieceNames[type]} on ${square}`}
                            role="img"
                          >
                            <span
                              className="rook-exploration__control-piece"
                              aria-hidden="true"
                            >
                              {pieceSymbols[color][type]}
                            </span>
                            <span aria-hidden="true">{square}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "No pieces"
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {!isSidePanel && openingGuidance}
      {puzzleMove && (puzzleMove === "accepted" || !spotting) && (
        <p className="rook-exploration__cue" role="status">
          {puzzleMove === "accepted"
            ? "Good move"
            : "Try another move from the starting position."}
        </p>
      )}
    </>
  );
  const supportingActions = (
    <>
      {pawnExchange && (
        <NextMovePill label="See exchange" onClick={showPawnExchange} />
      )}
      {(experiment?.stage === "revealed" ||
        experiment?.stage === "unchecked") && (
        <BusyButton
          className="rook-exploration__transport-button board-action--quiet"
          busy={strongerSearch === "checking"}
          onClick={() => {
            void showStrongerLine(experiment);
          }}
        >
          {experiment.stage === "unchecked"
            ? "Check for a stronger move"
            : "Show stronger line"}
        </BusyButton>
      )}
    </>
  );
  const compareAction = (
    <>
      {moveComparison && (
        <button
          type="button"
          className={
            isSidePanel
              ? "rook-exploration__transport-button rook-exploration__compare-pill"
              : "rook-exploration__transport-button"
          }
          aria-expanded={comparisonMove !== undefined}
          disabled={voiceActive}
          onClick={() => {
            if (isSidePanel && !comparisonMove) setDiscussion("open");
            selectComparison(comparisonMove ? null : "found");
          }}
        >
          {comparisonMove ? "Done" : "Compare moves"}
        </button>
      )}
    </>
  );
  const comparisonChoices = moveComparison && comparisonMove && (
    <>
      <button
        type="button"
        className="rook-exploration__transport-button"
        aria-pressed={comparisonView === "found"}
        onClick={() => {
          selectComparison("found");
        }}
      >
        {foundLabel} · {moveComparison.found.san}
      </button>
      <button
        type="button"
        className="rook-exploration__transport-button"
        aria-pressed={comparisonView === "reference"}
        onClick={() => {
          selectComparison("reference");
        }}
      >
        {referenceLabel} · {moveComparison.reference.san}
      </button>
    </>
  );
  const comparisonLegend = comparisonMove && moveComparison && (
    <p className="rook-exploration__move rook-exploration__control-legend">
      {controlChanges?.size ? (
        <>
          <span className="rook-exploration__control-label">
            Your side controls the square
          </span>
          <span className="rook-exploration__control-gained">
            + {moveComparison.found.san} only
          </span>
          <span className="rook-exploration__control-lost">
            − {moveComparison.reference.san} only
          </span>
        </>
      ) : (
        "Your side controls the same squares."
      )}
    </p>
  );
  const checkedComparisonReply = comparisonView
    ? moveComparison?.checkedReplies?.[comparisonView]
    : null;
  const otherComparisonView =
    comparisonView === "found" ? "reference" : "found";
  const comparisonScores = moveComparison?.checkedReplyScores;
  const comparisonExplanation =
    comparisonMove && moveComparison && comparisonView
      ? explainComparedMove(
          comparisonMove,
          moveComparison[otherComparisonView],
          checkedComparisonReply,
          comparisonScores
            ? {
                selected: comparisonScores[comparisonView],
                other: comparisonScores[otherComparisonView],
              }
            : undefined,
        )
      : null;
  const chatComparison = isSidePanel && !introFrame && moveComparison && (
    <div
      role="group"
      aria-label={comparisonMove ? "Move comparison" : "Compare in chat"}
      data-comparing={comparisonMove !== undefined}
      className="board-action-row rook-exploration__transport rook-exploration__chat-comparison"
    >
      {compareAction}
      {comparisonChoices}
      {comparisonExplanation && comparisonMove && (
        <div
          className="rook-exploration__comparison-explanation"
          role="status"
          aria-label="Selected move explanation"
        >
          <RookMessage>
            <p>
              <strong>Why {comparisonMove.san}?</strong> {comparisonExplanation}
            </p>
          </RookMessage>
        </div>
      )}
      {comparisonLegend}
    </div>
  );
  const promotionChoices = (
    <>
      {promotion.length > 0 && (
        <div
          className="rook-exploration__promotions"
          role="group"
          aria-label="Choose promotion"
        >
          {promotion.map((move) => (
            <button
              type="button"
              key={move.lan}
              className="review-action piece-choice"
              aria-label={move.san}
              title={move.san}
              disabled={
                whatIf?.stage === "checking" ||
                coaching.status === "checking" ||
                strongerSearch === "checking"
              }
              onClick={() => {
                play(move);
              }}
            >
              <PromotionPiece
                piece={move.promotion ?? "q"}
                color={move.color}
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
  const conversation = (
    <>
      {discussionOpen && (
        <div className="rook-exploration__chat-drawer" ref={chatLog}>
          <div
            className="rook-exploration__turns"
            role="log"
            aria-label="Conversation with Rook"
          >
            {turns.map((turn) => {
              const key = turn.role + String(turn.id);
              const anchor = turn.anchor;
              const explanation = turn.explanation;
              const message = (
                <RookMessage
                  key={key}
                  player={turn.role === "player"}
                  sentAt={turn.sentAt}
                  {...(turn.nano ? { context: "With Gemini Nano" } : {})}
                >
                  {anchor ? (
                    <button
                      type="button"
                      className="rook-exploration__commentary-jump"
                      disabled={coaching.status === "checking"}
                      onClick={() => {
                        viewCommentaryPosition(anchor);
                      }}
                    >
                      <span>
                        {anchor.heading && <strong>{anchor.heading}. </strong>}
                        {turn.text}
                      </span>
                      <small>
                        View position <span aria-hidden="true">↗</span>
                      </small>
                    </button>
                  ) : explanation ? (
                    <p className="rook-explanation-steps">
                      <span
                        aria-current={
                          explanationPlayback?.explanation === explanation &&
                          explanationPlayback.stage === "reply"
                            ? "step"
                            : undefined
                        }
                      >
                        {explanation.prefix}
                      </span>{" "}
                      <button
                        type="button"
                        aria-current={
                          explanationPlayback?.explanation === explanation &&
                          explanationPlayback.stage === "challenge"
                            ? "step"
                            : undefined
                        }
                        onClick={() => {
                          showExplanationStep(explanation, "challenge");
                        }}
                      >
                        {explanation.move.to} challenges{" "}
                        {explanation.exchange.target}.
                      </button>
                      {" If "}
                      <button
                        type="button"
                        aria-current={
                          explanationPlayback?.explanation === explanation &&
                          explanationPlayback.stage === "capture"
                            ? "step"
                            : undefined
                        }
                        onClick={() => {
                          showExplanationStep(explanation, "capture");
                        }}
                      >
                        {explanation.exchange.capture.san}
                      </button>
                      {", "}
                      <button
                        type="button"
                        aria-current={
                          explanationPlayback?.explanation === explanation &&
                          explanationPlayback.stage === "recapture"
                            ? "step"
                            : undefined
                        }
                        onClick={() => {
                          showExplanationStep(explanation, "recapture");
                        }}
                      >
                        {explanation.exchange.recapture.san}
                      </button>
                      {" takes the pawn back."}
                    </p>
                  ) : (
                    <p>{turn.text}</p>
                  )}
                </RookMessage>
              );
              return turn.commentary ? (
                <div
                  key={key}
                  role="group"
                  data-wording-version={anchor?.wordingVersion}
                  aria-label={
                    anchor?.plan
                      ? "Rook’s line explanation"
                      : "Rook’s move explanation"
                  }
                >
                  {message}
                </div>
              ) : (
                message
              );
            })}
          </div>
          {chatBusy && turns.at(-1)?.role === "player" && (
            <div
              className="rook-exploration__typing"
              role="status"
              aria-label="Rook is typing"
            >
              <LoadingMark />
            </div>
          )}
          {isSidePanel && returnPoint && (
            <div className="rook-exploration__chat-actions">
              {previewActions}
            </div>
          )}
        </div>
      )}
    </>
  );
  function submitQuestion(question: string, spoken = false) {
    if (
      !question ||
      (voiceActive && !spoken) ||
      (chatBusy && !spoken) ||
      whatIf?.stage === "checking" ||
      coaching.status === "checking"
    )
      return;
    narration.cancel();
    // A follow-up question leaves the comparison and returns to the board.
    if (comparisonMove) selectComparison(null);
    const id = nextChatId.current++;
    const sentAt = Date.now();
    setTurns((previous) => [
      ...previous,
      { id, role: "player", text: question, sentAt },
    ]);
    setMessage("");
    setDiscussion("open");
    chatInput.current?.focus({ preventScroll: true });
    if (
      /^(?:(?:can|could|would) you )?(?:reset|restart|(?:go|rewind) back|rewind)(?: (?:to (?:the )?(?:start|original position)|(?:one|two|\d+) (?:moves?|plies)))?[?.!]*$/i.test(
        question,
      )
    ) {
      const steps = /\b(one|two|\d+) (?:moves?|plies)/i
        .exec(question)?.[1]
        ?.toLowerCase();
      let target = /start|original|reset|restart/i.test(question)
        ? root
        : active;
      const count =
        steps === "two" ? 2 : Number(steps === "one" ? 1 : (steps ?? 1));
      const fromPreview =
        demoStep !== null && !/start|original|reset|restart/i.test(question);
      if (fromPreview && count <= demoStep + 1) {
        stopChat();
        clearSelection();
        setDemoStep(count === demoStep + 1 ? null : demoStep - count);
        return;
      }
      const liveSteps = fromPreview ? count - demoStep - 1 : count;
      for (
        let index = 0;
        index < Math.min(liveSteps, nodes.length) && target.parent !== null;
        index++
      ) {
        target = nodes.find((node) => node.id === target.parent) ?? root;
      }
      visit(target);
      return;
    }
    void discuss(id, question);
  }

  const composer = (
    <form
      hidden={!isSidePanel && comparisonMove !== undefined}
      onSubmit={(event) => {
        event.preventDefault();
        submitQuestion(message.trim());
      }}
    >
      <div className="rook-exploration__ask rook-chat__composer">
        <input
          id="rook-exploration-question"
          aria-label="Ask Rook"
          ref={chatInput}
          placeholder="Ask Rook"
          onFocus={() => {
            if (isSidePanel) setDiscussion("open");
          }}
          value={message}
          maxLength={400}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
        <button
          type="button"
          className="rook-exploration__mic rook-exploration__hands-free"
          aria-label="Hands-free voice"
          title="Hands-free voice: Rook reads aloud and listens after asking"
          aria-pressed={handsFree}
          onClick={() => {
            const on = !handsFree;
            handsFreeOn.current = on;
            setHandsFree(on);
            narration.cancel();
            voice.cancel();
            if (on) {
              narration.prepare();
              if (isSidePanel) setDiscussion("open");
            }
          }}
        >
          <HandsFreeIcon />
        </button>
        <button
          type="button"
          className="rook-exploration__mic"
          aria-label={listening ? "Finish speaking" : "Talk to Rook"}
          title={listening ? "Finish speaking" : "Talk to Rook"}
          aria-pressed={listening}
          disabled={startingVoice || finishingVoice}
          onClick={() => {
            if (listening) {
              voice.stop();
            } else {
              narration.cancel();
              if (isSidePanel) setDiscussion("open");
              void voice.start();
            }
          }}
        >
          <span
            className={listening ? "rook-chat__stop" : "rook-chat__mic"}
            aria-hidden="true"
          />
        </button>
        <BusyButton
          type="submit"
          className="rook-chat__send rook-send-icon"
          aria-label="Ask"
          title="Send question to Rook"
          busy={chatBusy}
          disabled={
            !message.trim() ||
            whatIf?.stage === "checking" ||
            coaching.status === "checking" ||
            voiceActive
          }
        >
          <SendIcon />
        </BusyButton>
      </div>
    </form>
  );
  return (
    <section
      ref={stage}
      className={
        compact
          ? "game-review rook-exploration rook-exploration--compact"
          : "game-review rook-exploration"
      }
      aria-label="Explore with Rook"
    >
      {onClose && <BoardBack label={closeLabel} onBack={onClose} />}
      {import.meta.env.DEV && (
        <button
          type="button"
          className="rook-exploration__dev-copy"
          onClick={() => {
            const pgn = explorationPgn(
              fen,
              active.line,
              originMoveUci,
              comparisonMove?.after ?? introFrame?.fen ?? displayed.fen(),
            );
            void navigator.clipboard.writeText(pgn).then(
              () => {
                setPgnCopy("copied");
              },
              () => {
                setPgnCopy("failed");
              },
            );
          }}
        >
          {pgnCopy === "copied"
            ? "PGN copied"
            : pgnCopy === "failed"
              ? "Copy failed"
              : "Copy PGN (dev)"}
        </button>
      )}
      {showHeading && (
        <header className="rook-exploration__heading">
          <h2>Explore with Rook</h2>
        </header>
      )}
      <TrainingStage
        showIntro={false}
        board={
          <>
            <ReviewBoard
              balance={balance}
              fen={boardFen}
              orientation={orientation}
              animateMove={replyAnimation !== null}
              lastMoveUci={
                comparisonMove || visibleAnswer
                  ? null
                  : introFrame
                    ? introFrame.lastMoveUci
                    : (focusedMove?.lan ?? active.move?.lan ?? originMoveUci)
              }
              focusSquares={
                replyAnimation
                  ? []
                  : comparisonMove
                    ? inspectedAttackers
                    : focusSquares
              }
              moveCue={moveCue}
              overlay={practiceSaveConfirmation}
              hintSquares={
                visibleAnswer
                  ? undefined
                  : scan
                    ? undefined
                    : firstHint?.squares
              }
              controlChanges={comparisonMove ? controlChanges : undefined}
              controlTarget={inspectedSquare}
              controlMoveLabel={
                practiceComparison ? "the solved move" : "the better move"
              }
              selectedSquare={
                comparisonMove
                  ? (inspectedSquare ?? null)
                  : (selectedEscape?.square ?? selected)
              }
              legalTargets={options.map((move) => move.to)}
              onSquareSelect={selectBoardSquare}
              disabled={
                introFrame !== undefined ||
                replyAnimation !== null ||
                whatIf?.stage === "checking" ||
                coaching.status === "checking" ||
                strongerSearch === "checking"
              }
            />
            {boardIntro}
            {!isSidePanel && boardCues}
            <div
              hidden={
                introFrame !== undefined ||
                (isSidePanel && comparisonMove !== undefined)
              }
              className="board-action-row board-action-row--anchored rook-exploration__transport"
              role="group"
              aria-label={comparisonMove ? "Move comparison" : "Board playback"}
              data-comparing={comparisonMove !== undefined}
            >
              {!comparisonMove && (
                <>
                  {hintMove && (
                    <HintButton
                      level={hintLevel}
                      levels={forcingScanHint ? 3 : 2}
                      onClick={() => {
                        // After a mistake the last hint shows the reply.
                        if (spotting && hintLevel === 1 + hintOffset) {
                          setHintLevel(0);
                          reveal();
                          return;
                        }
                        setHintLevel((level) =>
                          level === 0
                            ? 1
                            : level === 1
                              ? 2
                              : forcingScanHint
                                ? 3
                                : 2,
                        );
                      }}
                    />
                  )}
                  {(!compact || !spotting) && (demoStep !== null || parent) && (
                    <button
                      type="button"
                      className="rook-exploration__transport-button board-action--quiet"
                      aria-label="Previous move"
                      title="Previous move"
                      disabled={
                        replyAnimation !== null ||
                        strongerSearch === "checking" ||
                        whatIf?.stage === "checking"
                      }
                      onClick={() => {
                        stopChat();
                        clearSelection();
                        setWhatIf(null);
                        if (demoStep !== null)
                          setDemoStep(demoStep === 0 ? null : demoStep - 1);
                        else if (parent) visit(experiment?.rewind ?? parent);
                      }}
                    >
                      <span
                        className="rook-playback-icon rook-playback-icon--previous"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                  {availableLine[nextStep] && (
                    <NextMovePill
                      onClick={playOneMove}
                      disabled={
                        replyAnimation !== null || strongerSearch === "checking"
                      }
                    />
                  )}
                  {!isSidePanel && supportingActions}
                  {(demoStep !== null ||
                    experiment !== undefined ||
                    atBranch) && (
                    <button
                      type="button"
                      className="rook-exploration__transport-button board-action--quiet"
                      aria-label={rewindLabel}
                      title={rewindLabel}
                      onClick={() => {
                        if (experiment) visit(experiment.rewind);
                        else if (atBranch) visit(root);
                        else {
                          stopChat();
                          clearSelection();
                          setDemoStep(null);
                        }
                      }}
                    >
                      <span
                        className="rook-playback-icon rook-playback-icon--rewind"
                        aria-hidden="true"
                      />
                      {compact && rewindsPosition && (
                        <span className="rook-rewind-label">Rewind</span>
                      )}
                    </button>
                  )}
                  <RookConversationButton
                    label={discussionLabel}
                    expanded={discussionOpen}
                    onClick={() => {
                      if (hideConversation) {
                        setDiscussion("closed");
                        return;
                      }
                      setDiscussion("open");
                      chatInput.current?.focus({ preventScroll: true });
                    }}
                  />
                </>
              )}
              {!isSidePanel && compareAction}
              {!isSidePanel && comparisonChoices}
              {comparisonMove ? (
                comparisonLegend
              ) : (
                <p className="board-turn" aria-live="polite">
                  {demoMove && demoStep !== null && (
                    <>
                      {String(demoStep + 1)} of {String(lineLength)} ·{" "}
                      {demoMove.san} ·{" "}
                    </>
                  )}
                  {turnText}
                  {coaching.status === "checking" && (
                    <>
                      {" "}
                      · <LoadingText>Rook is checking</LoadingText>
                    </>
                  )}
                </p>
              )}
            </div>
            {!isSidePanel && boardFeedback}
          </>
        }
        eyebrow=""
        title="Explore with Rook"
        description={turnText}
      >
        {!isSidePanel && promotionChoices}
        <section
          className="rook-exploration__discussion"
          hidden={introFrame !== undefined}
          data-comparing={isSidePanel && comparisonMove !== undefined}
          aria-label="Discuss with Rook"
        >
          <div className="rook-exploration__composer-dock rook-board-dock">
            {!isSidePanel && conversation}
            {composerControls}
            {isSidePanel ? (
              <RookBoardShelf
                open={discussionOpen}
                conversation={conversation}
                actions={chatComparison}
                composer={composer}
                inputStatus={
                  !comparisonMove && <RookSpeechStatus voice={voice} />
                }
                guidance={
                  <>
                    {comparisonMove && boardFeedback}
                    {boardCues}
                    {openingGuidance}
                    {evaluation}
                  </>
                }
                notes={
                  <>
                    {!discussionOpen && previewActions}
                    {!comparisonMove && boardFeedback}
                  </>
                }
              />
            ) : (
              composer
            )}
            {!isSidePanel && <RookSpeechStatus voice={voice} />}
          </div>
        </section>
        {isSidePanel && (
          <>
            {promotionChoices}
            {!introFrame && !comparisonMove && supportingActions}
          </>
        )}
        {puzzle?.source && (
          <details className="board-reference">
            <summary>Sources</summary>
            {puzzle.source}
          </details>
        )}
        {!introFrame && !comparisonMove && reviewTools && (
          <div className="rook-exploration__review-tools">{reviewTools}</div>
        )}
      </TrainingStage>
    </section>
  );
}
