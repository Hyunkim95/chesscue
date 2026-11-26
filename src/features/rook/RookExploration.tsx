import { Chess, SQUARES, type Move, type Square } from "chess.js";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { RookMessage, SendIcon } from "../../shared/rook/RookMessage";
import type { AssessPosition } from "../../application/analyze-game/assess-position";
import type { PlayerColor } from "../../domain/game/types";
import { materialBalance } from "../../domain/game/board-balance";
import { createRookExplorationCoach } from "../../infrastructure/ai/rook-exploration-gemini";
import { pieceNames } from "../board/board-pieces";
import { useRookSpeech } from "../play/use-rook-speech";
import { explainContinuation } from "../review/explain-continuation";
import { ReviewBoard } from "../review/ReviewBoard";
import { TrainingStage, type AnalyzeReply } from "../review/GuidedMoveFeedback";
import type { ReviewMistakeEvidence } from "../../domain/analysis/review-mistake";
import { REVIEW_MOVE_TOLERANCE_CP } from "../../domain/analysis/review-training";
import {
  classifyExperiment,
  isMateScore,
  moveLossCp,
} from "../../domain/analysis/classify-experiment";
import { RookEvaluation } from "./RookEvaluation";
import { rookCaptureAnswer } from "./rook-capture-answer";
import "./rook-exploration.css";

interface Position {
  readonly id: number;
  readonly parent: number | null;
  readonly fen: string;
  readonly move: Move | null;
  readonly line: readonly string[];
}

interface Experiment {
  readonly stage: "spot" | "retry" | "revealed" | "found";
  readonly bestReplyScore: number;
  readonly position: Position;
  readonly rewind: Position;
}

interface CommentaryAnchor {
  readonly position: Position;
  readonly line: readonly Move[];
  readonly step: number | null;
  readonly experiment?: Experiment;
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
      readonly experiment?: Experiment;
    };

interface ReturnPoint {
  readonly position: Position;
  readonly step: number | null;
  readonly coaching: Coaching;
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

export function RookExploration({
  fen,
  orientation,
  analyzeReply,
  assessPosition,
  topic,
  compact = false,
  originMoveUci = null,
  originCaption,
  closeLabel = "Close exploration",
  onMistake,
  puzzle,
  onClose,
}: {
  readonly fen: string;
  readonly orientation: PlayerColor;
  readonly analyzeReply: AnalyzeReply;
  readonly assessPosition?: AssessPosition | null | undefined;
  readonly topic?: string;
  readonly compact?: boolean;
  readonly originMoveUci?: string | null;
  readonly originCaption?: string;
  readonly closeLabel?: string;
  readonly onMistake?: ((evidence: ReviewMistakeEvidence) => void) | undefined;
  readonly puzzle?: {
    readonly question: string;
    readonly onMove: (uci: string) => boolean;
    readonly source: ReactNode;
  };
  readonly onClose?: (() => void) | undefined;
}) {
  const root: Position = { id: 0, parent: null, fen, move: null, line: [] };
  const [nodes, setNodes] = useState<readonly Position[]>([root]);
  const positions = useRef(nodes);
  const [active, setActive] = useState(root);
  const [puzzleMove, setPuzzleMove] = useState<"accepted" | "try-again" | null>(
    null,
  );
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<readonly Move[]>([]);
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
      nano?: boolean;
    }[]
  >([]);
  const [chatBusy, setChatBusy] = useState(false);
  const nextChatId = useRef(0);
  const chatInput = useRef<HTMLInputElement>(null);
  const chatLog = useRef<HTMLDivElement>(null);
  const voice = useRookSpeech((text) => {
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
  const [coaching, setCoaching] = useState<Coaching>({ status: "idle" });
  const [returnPoint, setReturnPoint] = useState<ReturnPoint | null>(null);
  const returnControl = useRef<HTMLButtonElement>(null);
  const pending = useRef<AbortController | null>(null);
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
  }

  function postCommentary(text: string, anchor?: CommentaryAnchor) {
    const turn = {
      id: nextChatId.current++,
      role: "rook",
      text,
      sentAt: Date.now(),
      commentary: true,
      anchor,
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

  async function investigate(
    next: Position,
    onLearnerSide: boolean,
    verifiedOpening = false,
  ) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setDemoStep(null);
    setCoaching({ status: "checking" });
    try {
      const board = new Chess(next.fen);
      if (board.isGameOver()) {
        setCoaching({
          status: "ready",
          line: [],
          shownMove: board.isCheckmate() ? next.move : null,
          text: "",
        });
        postCommentary(
          board.isCheckmate()
            ? "Nice find. That’s checkmate."
            : "The game ends in a draw. Rewind to explore another line.",
          { position: next, line: [], step: null },
        );
        return;
      }
      const result = await analyzeReply(next.fen, controller.signal);
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
      const beforeMove = next.move;
      const before =
        beforeMove && !verifiedOpening
          ? await analyzeReply(beforeMove.before, controller.signal, true)
          : null;
      const verdict =
        beforeMove && !verifiedOpening
          ? classifyExperiment(beforeMove.lan, before, result)
          : "continue";
      controller.signal.throwIfAborted();
      const replyMove = board.move(reply);
      const verifiedMoves = [
        replyMove,
        ...result.line.slice(1).map((uci) => board.move(uci)),
      ];
      const prior = positions.current.find(({ id }) => id === next.parent);
      if (verdict === "spot" && prior) {
        if (
          onLearnerSide &&
          beforeMove &&
          before &&
          before.line[0] !== beforeMove.lan
        ) {
          onMistake?.({
            fen: beforeMove.before,
            attemptedMove: beforeMove.lan,
            before: { ...before, line: [...before.line] },
            after: { ...result, line: [...result.line] },
          });
        }
        setCoaching({
          status: "ready",
          line: verifiedMoves,
          shownMove: null,
          text: onLearnerSide
            ? `Are you sure? Find ${orientation === "white" ? "Black" : "White"}’s reply to your move.`
            : "Are you sure? Find the reply for the side to move.",
          experiment: {
            stage: "spot",
            position: next,
            rewind: prior,
            bestReplyScore: result.evaluationCpFromSideToMove,
          },
        });
        return;
      }
      const playReply = onLearnerSide && verdict !== "standout";
      const shownMove = playReply ? replyMove : next.move;
      const shownPosition = playReply ? advance(next, replyMove) : next;
      const checkedLine = playReply ? verifiedMoves.slice(1) : verifiedMoves;
      setCoaching({
        status: "ready",
        line: checkedLine,
        shownMove,
        text: "",
      });
      if (shownMove) {
        const playerNote =
          playReply && beforeMove
            ? `You played ${beforeMove.san}. ` +
              explainContinuation(
                beforeMove,
                new Chess(beforeMove.after),
                prior?.move ?? undefined,
              ) +
              "\n\n"
            : verdict === "standout"
              ? "Nice find. "
              : "";
        const replyNote = playReply ? `I played ${shownMove.san}. ` : "";
        postCommentary(
          playerNote +
            replyNote +
            explainContinuation(
              shownMove,
              new Chess(shownMove.after),
              (playReply ? beforeMove : prior?.move) ?? undefined,
            ),
          { position: shownPosition, line: checkedLine, step: null },
        );
      }
    } catch {
      if (!controller.signal.aborted) {
        setCoaching({ status: "ready", line: [], shownMove: null, text: "" });
        postCommentary(
          "Stockfish couldn’t check this position. Ask again to retry.",
        );
      }
    }
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
    stopChat();
    setActive(next);
    if (next.id === 0) setPuzzleMove(null);
    setSelected(null);
    setPromotion([]);
    setDemoStep(null);
    setCoaching({ status: "idle" });
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
              experiment.bestReplyScore,
              result.evaluationCpFromSideToMove,
            ) > REVIEW_MOVE_TOLERANCE_CP
          ) {
            const missedMate =
              experiment.bestReplyScore > 0 &&
              isMateScore(experiment.bestReplyScore);
            setCoaching({
              ...prompt,
              experiment: { ...experiment, stage: "retry" },
              text: missedMate
                ? move.san + " misses the forced mate. Try another reply."
                : "Stockfish found a stronger reply for " +
                  (move.color === "w" ? "White" : "Black") +
                  ". Try another move.",
            });
            return;
          }
          continuation = result.line.map((uci) => after.move(uci));
        }
      } catch {
        if (!controller.signal.aborted)
          setCoaching({
            ...prompt,
            experiment: { ...experiment, stage: "retry" },
            text: "Stockfish couldn’t verify that reply. Try again or use Show me.",
          });
        return;
      }
    }
    const shownPosition = advance(experiment.position, move);
    const foundExperiment = { ...experiment, stage: "found" } as const;
    setCoaching({
      ...prompt,
      line: continuation,
      shownMove: move,
      text: "",
      experiment: foundExperiment,
    });
    postCommentary(
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

  function play(move: Move) {
    stopChat();
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
    const openingAccepted =
      puzzle && from.id === 0 ? puzzle.onMove(move.lan) : undefined;
    if (openingAccepted !== undefined) {
      setPuzzleMove(openingAccepted ? "accepted" : "try-again");
    }
    const next = advance(from, move);
    const learner = orientation === "white" ? "w" : "b";
    void investigate(next, move.color === learner, openingAccepted === true);
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
    if (!compact || (!discussionOpen && experiment?.stage !== "retry")) return;
    const boardStage = stage.current?.querySelector(
      ".game-review__board-stage",
    );
    const dock = stage.current?.querySelector(
      ".rook-exploration__composer-dock",
    );
    const grid = boardStage?.querySelector<HTMLElement>(".review-board");
    if (!boardStage || !dock || !grid) return;
    const fitBoard = () => {
      const available = dock.getBoundingClientRect().top;
      const controlsHeight =
        boardStage.getBoundingClientRect().height -
        grid.getBoundingClientRect().height;
      grid.style.setProperty(
        "--rook-board-room",
        String(Math.floor(available - controlsHeight - 12)) + "px",
      );
      const board = boardStage.getBoundingClientRect();
      if (board.top >= 0 && board.bottom <= available) return;
      const headingTop =
        stage.current?.getBoundingClientRect().top ?? board.top;
      // Include the position heading when the board and its controls still fit.
      const top =
        board.bottom - headingTop + 12 <= available ? headingTop : board.top;
      window.scrollBy(0, top - 6);
    };
    fitBoard();
    const observer = new ResizeObserver(fitBoard);
    observer.observe(dock);
    observer.observe(boardStage);
    return () => {
      observer.disconnect();
      grid.style.removeProperty("--rook-board-room");
    };
  }, [compact, discussionOpen, experiment?.stage, turns]);
  function reveal() {
    if (coaching.status !== "ready" || !experiment || !spotting) return;
    const reply = coaching.line[0];
    if (!reply) return;
    visit(experiment.position);
    const revealedExperiment = { ...experiment, stage: "revealed" } as const;
    setCoaching({
      ...coaching,
      text: "",
      experiment: revealedExperiment,
    });
    setDemoStep(0);
    postCommentary(
      `I played ${reply.san}. ` +
        explainContinuation(
          reply,
          new Chess(reply.after),
          experiment.position.move ?? undefined,
        ),
      {
        position: experiment.position,
        line: coaching.line,
        step: 0,
        experiment: revealedExperiment,
      },
    );
    stage.current?.scrollIntoView({ block: "start" });
  }

  function clearSelection() {
    setSelected(null);
    setPromotion([]);
  }

  const nextStep = (demoStep ?? -1) + 1;
  function playOneMove() {
    stopChat();
    clearSelection();
    if (spotting) {
      reveal();
    } else {
      const move = line[nextStep];
      if (!move) return;
      setDemoStep(nextStep);
      postCommentary(
        `${move.san}. ` +
          explainContinuation(
            move,
            new Chess(move.after),
            line[nextStep - 1] ?? active.move ?? undefined,
          ),
        {
          position: active,
          line,
          step: nextStep,
          ...(experiment ? { experiment } : {}),
        },
      );
    }
  }

  function viewCommentaryPosition(anchor: CommentaryAnchor) {
    if (
      coaching.status === "checking" ||
      commentaryFen(anchor) === displayed.fen()
    )
      return;
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
    });
    setDemoStep(anchor.step);
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

  useLayoutEffect(() => {
    if (!returnPoint || !compact) return;
    const button = returnControl.current?.getBoundingClientRect();
    const dock = stage.current
      ?.querySelector(".rook-exploration__composer-dock")
      ?.getBoundingClientRect();
    if (button && dock && button.bottom > dock.top - 8) {
      window.scrollBy({
        top: button.bottom - dock.top + 8,
        behavior: "instant",
      });
    }
  }, [compact, returnPoint]);

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
  const focusSquares = focusedMove
    ? rookFocusSquares(displayed, focusedMove, observation)
    : [];
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
    function showReply(text: string, nano = false) {
      const sentAt = Date.now();
      setTurns((previous) => {
        const index = previous.findIndex(
          (turn) => turn.id === id && turn.role === "player",
        );
        if (index === -1) return previous;
        const reply = { id, role: "rook", text, sentAt, nano } as const;
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
      const capture = rookCaptureAnswer(
        question,
        displayed,
        spotting ? line[0] : undefined,
      );
      if (capture !== undefined) {
        facts = capture;
      } else if (/\bmaterial\b/i.test(question)) {
        const balance = materialBalance(displayed.fen());
        facts =
          balance === 0
            ? "Material is level."
            : `${balance > 0 ? "White" : "Black"} is ahead by ${String(Math.abs(balance))} ${Math.abs(balance) === 1 ? "pawn’s worth of material" : "points of material"}.`;
      } else if (spotting && square === undefined) {
        const hasCheck = displayed
          .moves({ verbose: true })
          .some(({ san }) => /[+#]$/.test(san));
        facts = hasCheck
          ? "Start by looking for checks your opponent can give. Try one on the board, or use Show reply."
          : "Look at which pieces your opponent attacks now. Try their reply on the board, or use Show reply.";
      } else if (requestedMove && !spotting) {
        if (!candidate) {
          facts =
            "That move isn’t legal from the displayed position. Try selecting the piece to see its legal moves.";
        } else {
          const board = new Chess(candidate.after);
          const result = board.isGameOver()
            ? null
            : await analyzeReply(candidate.after, controller.signal);
          controller.signal.throwIfAborted();
          const reply = result?.line[0];
          if (reply) {
            const response = board.move(reply);
            const consequence = explainContinuation(response, board, candidate);
            continuation = [candidate.san, response.san];
            facts = `After ${candidate.san}, Stockfish found ${response.san}. ${consequence}`;
          } else {
            facts = explainContinuation(candidate, board);
          }
        }
      } else if (square) {
        const attackers = (color: "w" | "b") =>
          displayed.attackers(square, color).flatMap((from) => {
            const piece = displayed.get(from);
            return piece ? [pieceNames[piece.type] + " on " + from] : [];
          });
        const white = attackers("w");
        const black = attackers("b");
        facts = `Pieces attacking ${square}: White ${white.join(", ") || "none"}. Black ${black.join(", ") || "none"}.`;
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
          if (first)
            facts =
              "I’ve checked a line from this position. Use Play one move to explore it.";
        }
      }
      const answer =
        facts ||
        "I couldn’t check a reply here. You can try a move or ask about a square.";
      showReply(answer);
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

  const composerHeading = (
    <div className="rook-exploration__composer-heading">
      <label htmlFor="rook-exploration-question">Ask Rook</label>
      {discussionOpen && spotting && turns.at(-1)?.role === "rook" && (
        <button
          type="button"
          className="rook-exploration__chat-reveal"
          onClick={reveal}
        >
          Show reply
        </button>
      )}
      {turns.length > 0 && (
        <button
          type="button"
          className="rook-exploration__chat-toggle"
          aria-expanded={discussionOpen}
          aria-label={
            discussionOpen ? "Hide conversation" : "Show conversation"
          }
          onClick={() => {
            setDiscussion(discussionOpen ? "closed" : "open");
          }}
        >
          {discussionOpen ? "Hide chat" : "Show chat"}
        </button>
      )}
    </div>
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
      <header className="rook-exploration__heading">
        {onClose && (
          <button
            type="button"
            className="review-navigation__icon"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            <span aria-hidden="true">←</span>
          </button>
        )}
        <h2>{puzzle ? "Find the first move" : "Explore with Rook"}</h2>
        {puzzle ? (
          <p>{puzzle.question}</p>
        ) : (
          compact && (
            <p>
              You’re {orientation === "white" ? "White" : "Black"} ·{" "}
              {originCaption ?? "Move " + String(new Chess(fen).moveNumber())}
            </p>
          )
        )}
      </header>
      <TrainingStage
        showIntro={false}
        board={
          <>
            <RookEvaluation
              fen={displayed.fen()}
              assess={assessPosition}
              knownScore={scores.get(displayed.fen())}
              checking={coaching.status === "checking"}
            />
            <ReviewBoard
              fen={displayed.fen()}
              orientation={orientation}
              lastMoveUci={
                focusedMove?.lan ?? active.move?.lan ?? originMoveUci
              }
              focusSquares={focusSquares}
              selectedSquare={selected}
              legalTargets={options.map((move) => move.to)}
              onSquareSelect={selectSquare}
              disabled={coaching.status === "checking"}
            />
            {returnPoint && (
              <div className="rook-exploration__position-return">
                <button
                  type="button"
                  ref={returnControl}
                  onClick={returnToMyPosition}
                >
                  <span aria-hidden="true">↩</span>
                  Return to my position
                </button>
              </div>
            )}
            {spotting && note && (
              <p className="rook-exploration__cue" role="status">
                {note}
              </p>
            )}
            <div
              className="rook-exploration__transport"
              role="group"
              aria-label="Board playback"
            >
              {(!compact || !spotting) && (
                <button
                  type="button"
                  className="rook-exploration__transport-button"
                  aria-label="Previous move"
                  title="Previous move"
                  disabled={demoStep === null && !parent}
                  onClick={() => {
                    stopChat();
                    clearSelection();
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
              <button
                type="button"
                className="rook-exploration__transport-button rook-exploration__transport-button--play"
                aria-label={spotting ? "Show me" : "Play one move"}
                title={spotting ? "Show me" : "Play one move"}
                disabled={nextStep >= lineLength}
                onClick={playOneMove}
              >
                <span
                  className="rook-playback-icon rook-playback-icon--play"
                  aria-hidden="true"
                />
                {compact && spotting && "Show me"}
              </button>
              {(demoStep !== null || experiment !== undefined || atBranch) && (
                <button
                  type="button"
                  className="rook-exploration__transport-button"
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
                  {compact && rewindsPosition && "Rewind"}
                </button>
              )}
              <button
                type="button"
                className="rook-exploration__transport-button"
                aria-label="Discuss position"
                title="Discuss position"
                onClick={() => {
                  setDiscussion("open");
                  chatInput.current?.focus({ preventScroll: true });
                }}
              >
                <span
                  className="rook-playback-icon rook-playback-icon--chat"
                  aria-hidden="true"
                />
              </button>
              <p className="rook-exploration__move" aria-live="polite">
                {demoMove && demoStep !== null && (
                  <>
                    {String(demoStep + 1)} of {String(lineLength)} ·{" "}
                    {demoMove.san} ·{" "}
                  </>
                )}
                {turnText}
                {coaching.status === "checking" && " · Rook is checking"}
                {spotting && !compact && " · Find the reply"}
              </p>
            </div>
            {puzzleMove && (puzzleMove === "accepted" || !spotting) && (
              <p className="rook-exploration__cue" role="status">
                {puzzleMove === "accepted"
                  ? "Good move"
                  : "Try another move from the starting position."}
              </p>
            )}
          </>
        }
        eyebrow=""
        title="Explore with Rook"
        description={turnText}
      >
        {promotion.map((move) => (
          <button
            type="button"
            key={move.lan}
            onClick={() => {
              play(move);
            }}
          >
            {move.san}
          </button>
        ))}
        {puzzle?.source && (
          <details className="side-panel-puzzle-source">
            <summary>Sources</summary>
            {puzzle.source}
          </details>
        )}
        <section
          className="rook-exploration__discussion"
          aria-label="Discuss with Rook"
        >
          <div className="rook-exploration__composer-dock">
            {compact && composerHeading}
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
                            <span>{turn.text}</span>
                            <small>
                              View position <span aria-hidden="true">↗</span>
                            </small>
                          </button>
                        ) : (
                          <p>{turn.text}</p>
                        )}
                      </RookMessage>
                    );
                    return turn.commentary ? (
                      <div
                        key={key}
                        role="group"
                        aria-label="Rook’s move explanation"
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
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </div>
                )}
              </div>
            )}
            {!compact && composerHeading}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const question = message.trim();
                if (!question || voiceActive || coaching.status === "checking")
                  return;
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
                    steps === "two"
                      ? 2
                      : Number(steps === "one" ? 1 : (steps ?? 1));
                  const fromPreview =
                    demoStep !== null &&
                    !/start|original|reset|restart/i.test(question);
                  if (fromPreview && count <= demoStep + 1) {
                    stopChat();
                    clearSelection();
                    setDemoStep(
                      count === demoStep + 1 ? null : demoStep - count,
                    );
                    return;
                  }
                  const liveSteps = fromPreview ? count - demoStep - 1 : count;
                  for (
                    let index = 0;
                    index < Math.min(liveSteps, nodes.length) &&
                    target.parent !== null;
                    index++
                  ) {
                    target =
                      nodes.find((node) => node.id === target.parent) ?? root;
                  }
                  visit(target);
                  return;
                }
                void discuss(id, question);
              }}
            >
              <div className="rook-exploration__ask">
                <input
                  id="rook-exploration-question"
                  ref={chatInput}
                  placeholder="Share your thinking"
                  value={message}
                  maxLength={400}
                  onChange={(event) => {
                    setMessage(event.target.value);
                  }}
                />
                <button
                  type="button"
                  className="rook-exploration__mic"
                  aria-label={listening ? "Finish speaking" : "Talk to Rook"}
                  title={listening ? "Finish speaking" : "Talk to Rook"}
                  aria-pressed={listening}
                  disabled={startingVoice || finishingVoice}
                  onClick={() => {
                    if (listening) voice.stop();
                    else void voice.start();
                  }}
                >
                  <span
                    className={listening ? "rook-chat__stop" : "rook-chat__mic"}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="submit"
                  className="rook-send-icon"
                  aria-label="Ask"
                  title="Send question to Rook"
                  disabled={
                    !message.trim() ||
                    coaching.status === "checking" ||
                    voiceActive
                  }
                >
                  <SendIcon />
                </button>
              </div>
            </form>
            {voiceActive && (
              <div className="rook-exploration__voice-status">
                <span role="status">
                  {voice.state.status === "listening"
                    ? voice.state.text || "Listening…"
                    : voice.state.status === "installing"
                      ? "Downloading offline speech…"
                      : startingVoice
                        ? "Opening microphone…"
                        : "Finishing speech…"}
                </span>
                <button type="button" onClick={voice.cancel}>
                  Cancel
                </button>
              </div>
            )}
            {voice.state.status === "setup" && (
              <div className="rook-exploration__voice-status">
                <span role="status">Offline speech is unavailable.</span>
                {voice.state.download && navigator.onLine && (
                  <button
                    type="button"
                    onClick={() => {
                      void voice.start("install");
                    }}
                  >
                    Download speech
                  </button>
                )}
                {navigator.onLine && (
                  <>
                    <span>
                      Online speech uses your browser’s speech service.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void voice.start("online");
                      }}
                    >
                      Use online speech
                    </button>
                  </>
                )}
              </div>
            )}
            {voice.state.status === "error" && (
              <p className="rook-exploration__voice-status" role="status">
                {voice.state.message}
              </p>
            )}
          </div>
        </section>
      </TrainingStage>
    </section>
  );
}
