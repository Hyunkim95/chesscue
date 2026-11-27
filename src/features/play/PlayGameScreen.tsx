import { LoadingMark, LoadingText } from "../../shared/loading/LoadingState";
import { Chess, type Move, type Square } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";

import type { GameEngine } from "../../application/ports/game-engine";
import type { AssessPosition } from "../../application/analyze-game/assess-position";
import type { ReviewReply } from "../../application/analyze-game/analyze-review-reply";
import type { GameRepository } from "../../application/ports/game-repository";
import {
  OneShotGameCompletionObserver,
  type GameCompletedCallback,
} from "../../application/play-game/game-completion";
import {
  acceptPlayerMove,
  bringInCoach,
  findUnfinishedTutorGame,
  requestCpuReply,
  resumeTutorGame,
  resignTutorGame,
  startTutorGame,
  type PlaySession,
} from "../../application/play-game/play-game";
import {
  FOCUS_OPENING_POLICY_VERSION,
  curriculumThemes,
  focusOpeningCandidates,
  type CurriculumTheme,
} from "../../domain/curriculum";
import {
  coachObservationCheck,
  savedCoachMoments,
  type CoachMoment,
} from "../../domain/game/coach-moments";
import { STOCKFISH_ELO_FLOOR } from "../../domain/game/beginner-opponent";
import { PLACEMENT_GAMES } from "../../domain/game/rating";
import {
  tutorGameMode,
  type GameId,
  type PositionId,
  type TutorGameMode,
} from "../../domain/game/types";
import {
  beforeMoveHint,
  legalBoardLine,
  moveArrow,
} from "../../domain/analysis/board-move-cues";
import { ChessBoard } from "../board/ChessBoard";
import { HintButton, NextMovePill } from "../board/BoardHintControls";
import { BoardBalance } from "../board/BoardBalance";
import { pieceNames } from "../board/board-pieces";
import { PromotionPiece } from "../board/PromotionPiece";
import { RookChat } from "./RookChat";
import { RookLauncher } from "./RookLauncher";
import {
  RookConversationButton,
  RookMessage,
} from "../../shared/rook/RookMessage";
import "./play-game.css";

type EngineStatus = "starting" | "ready" | "failed";
type PreviewLevel = 1 | 2 | "move";
type CoachPreview =
  | { readonly key: string; readonly status: "checking" | "unavailable" }
  | {
      readonly key: string;
      readonly status: "ready";
      readonly move: Move;
      readonly level: PreviewLevel;
    };
const systemNow = () => new Date().toISOString();

export interface PlayGameScreenProps {
  readonly engine: GameEngine;
  readonly repository: GameRepository;
  readonly createGameId: () => GameId;
  readonly createPositionId: () => PositionId;
  readonly now?: () => string;
  readonly targetElo?: number;
  readonly focusTheme?: CurriculumTheme;
  readonly focusTitle?: string;
  readonly focus?: string;
  readonly onGameCompleted?: GameCompletedCallback;
  readonly mode?: TutorGameMode;
  readonly assessPosition?: AssessPosition | null;
  readonly analyzeCoachMove?: (
    fen: string,
    signal: AbortSignal,
  ) => Promise<ReviewReply | null>;
  readonly analyzeCoachObservation?: PlayGameScreenProps["analyzeCoachMove"];
  readonly onChangeMode?: () => void;
  readonly resumeGameId?: GameId | undefined;
  readonly onCoachJoined?: (gameId: GameId) => void;
  readonly readyToStart?: boolean;
  readonly placementCount?: number | null;
  readonly noteScope?: string;
  readonly compact?: boolean;
}

export function PlayGameScreen({
  engine,
  repository,
  createGameId,
  createPositionId,
  now = systemNow,
  targetElo = 1480,
  focusTheme = "development",
  focusTitle = "Training focus",
  focus = "",
  onGameCompleted,
  mode,
  assessPosition = null,
  analyzeCoachMove,
  analyzeCoachObservation,
  onChangeMode,
  resumeGameId,
  onCoachJoined,
  readyToStart = true,
  placementCount = null,
  compact = false,
  noteScope = "adaptive-chess-tutor",
}: PlayGameScreenProps) {
  const [launch] = useState(() => ({ mode, resumeGameId }));
  const [session, setSession] = useState<PlaySession | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("starting");
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotionTo, setPromotionTo] = useState<Square | null>(null);
  const [coachPreview, setCoachPreview] = useState<CoachPreview | null>(null);
  const coachPreviewAbort = useRef<AbortController | null>(null);
  const boardStage = useRef<HTMLDivElement>(null);
  const promotionGroup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (promotionTo) promotionGroup.current?.querySelector("button")?.focus();
  }, [promotionTo]);
  const [notice, setNotice] = useState("Preparing your opponent…");
  const [saving, setSaving] = useState(false);
  const [coachNotesEnabled, setCoachNotesEnabled] = useState(() => {
    try {
      return localStorage.getItem("chesscue-coach-notes") !== "off";
    } catch {
      return true;
    }
  });
  const [coachNotesOpen, setCoachNotesOpen] = useState(false);
  const [readCoachPly, setReadCoachPly] = useState<{
    gameId: GameId;
    ply: number;
  } | null>(null);
  const rookToggle = useRef<HTMLButtonElement>(null);
  const rookPanel = useRef<HTMLElement>(null);
  const coachNotesPreference = useRef(coachNotesEnabled);
  const [coachNotes, setCoachNotes] = useState<{
    readonly gameId: GameId;
    readonly moments: readonly CoachMoment[];
  } | null>(null);
  const noteCache = useRef<{
    readonly gameId: GameId;
    readonly ply: number;
    readonly moments: readonly CoachMoment[];
  } | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const [completionObserver] = useState(
    () => new OneShotGameCompletionObserver(onGameCompleted),
  );

  useEffect(() => {
    completionObserver.setCallback(onGameCompleted);
  }, [completionObserver, onGameCompleted]);

  const initializeEngine = useCallback(
    async (signal: AbortSignal) => {
      const initialized = await engine.initialize(signal);
      if (signal.aborted) return false;
      if (initialized.ok) {
        setEngineStatus("ready");
        setNotice("Your move");
        return true;
      } else {
        setEngineStatus("failed");
        setNotice("The opponent could not start. Try again.");
        return false;
      }
    },
    [engine],
  );

  const start = useCallback(
    () =>
      startTutorGame({
        id: createGameId(),
        playerColor: "white",
        curriculumVersion: "1.0.0",
        configurationVersion: "1.0.0",
        ...(launch.mode === "rated"
          ? {}
          : {
              trainingFocus: focusTheme,
              openingPolicyVersion: FOCUS_OPENING_POLICY_VERSION,
            }),
        ...(launch.mode === undefined
          ? {}
          : { mode: launch.mode, opponentElo: targetElo }),
        ...(launch.mode === "coached"
          ? { coachNotesAtStart: coachNotesPreference.current }
          : {}),
        now: now(),
        repository,
      }),
    [createGameId, focusTheme, launch.mode, now, repository, targetElo],
  );

  const record = session?.record;
  const currentMode =
    mode === undefined || record === undefined ? mode : tutorGameMode(record);
  useEffect(() => {
    if (currentMode !== "coached" || !coachNotesEnabled || record === undefined)
      return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const previous =
        noteCache.current?.gameId === record.id ? noteCache.current : null;
      if (previous === null) {
        try {
          const savedPly = Number(
            localStorage.getItem(
              `chesscue-rook-read:${noteScope}:${record.id}`,
            ),
          );
          setReadCoachPly({
            gameId: record.id,
            ply: Number.isSafeInteger(savedPly) ? savedPly : 0,
          });
        } catch {
          setReadCoachPly(null);
        }
      }
      const moments = [
        ...(previous?.moments ?? []),
        ...savedCoachMoments(record, previous?.ply ?? 0),
      ];
      const found = { gameId: record.id, ply: record.moves.length, moments };
      noteCache.current = found;
      setCoachNotes(found);
      if (
        analyzeCoachObservation === undefined ||
        moments.some((moment) => moment.ply >= found.ply - 1)
      )
        return;
      const check = coachObservationCheck(record);
      if (check === null) return;
      void analyzeCoachObservation(check.afterFen, controller.signal)
        .then(async (after) => {
          if (controller.signal.aborted || after === null) return;
          const before = await analyzeCoachObservation(
            check.beforeFen,
            controller.signal,
          );
          controller.signal.throwIfAborted();
          const moment = check.verify(
            { ...after, line: after.evidenceLine ?? after.line },
            before && { ...before, line: before.evidenceLine ?? before.line },
          );
          if (moment === null) return;
          const checked = { ...found, moments: [...moments, moment] };
          noteCache.current = checked;
          setCoachNotes(checked);
        })
        .catch(() => {
          // Advisory notes can be skipped if Stockfish cannot verify the line.
        });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    analyzeCoachObservation,
    coachNotesEnabled,
    currentMode,
    noteScope,
    record,
  ]);

  const createNewGame = useCallback(
    async (startNotice: string) => {
      setSaving(true);
      setSelected(null);
      setPromotionTo(null);
      setCoachNotesOpen(false);
      const started = await start();
      setSaving(false);
      if (started.ok) {
        setSession(started.value);
        setNotice(startNotice);
      } else {
        setNotice(
          "This game could not be saved. Check browser storage and try again.",
        );
      }
    },
    [start],
  );

  const requestCpu = useCallback(
    async (current: PlaySession) => {
      const abort = new AbortController();
      searchAbort.current = abort;
      setNotice("CPU thinking…");
      const origin = current.record.origin;
      const storedFocus =
        origin.type === "tutor" ? origin.trainingFocus : undefined;
      const openingCandidates =
        origin.type === "tutor" && origin.mode === "rated"
          ? []
          : focusOpeningCandidates({
              focus:
                curriculumThemes.find((theme) => theme === storedFocus) ??
                focusTheme,
              ...(origin.type === "tutor" &&
              origin.openingPolicyVersion !== undefined
                ? { policyVersion: origin.openingPolicyVersion }
                : {}),
              fen: current.state.fen,
              moves: current.state.moves.map(({ uci }) => uci),
            });
      const reply = await requestCpuReply({
        session: current,
        engine,
        repository,
        positionId: createPositionId(),
        targetElo:
          origin.type === "tutor"
            ? (origin.opponentElo ?? targetElo)
            : targetElo,
        timeBudgetMs: 1200,
        ...(openingCandidates.length === 0
          ? {}
          : { searchMoves: openingCandidates }),
        now,
        signal: abort.signal,
        completionObserver,
      });
      if (searchAbort.current === abort) searchAbort.current = null;
      if (reply.ok) {
        setSession(reply.value);
        setNotice(statusFor(reply.value));
        return;
      }
      if (reply.error.cause.code === "cancelled") return;
      setEngineStatus("failed");
      setNotice("The CPU stopped unexpectedly. Your position is safe.");
    },
    [
      completionObserver,
      createPositionId,
      engine,
      focusTheme,
      now,
      repository,
      targetElo,
    ],
  );

  useEffect(() => {
    if (!readyToStart) return;
    const abort = new AbortController();
    const isAborted = (): boolean => abort.signal.aborted;
    const bootstrap = async () => {
      const initializedPromise = engine.initialize(abort.signal);
      const active = await findUnfinishedTutorGame(
        repository,
        launch.mode,
        launch.resumeGameId,
      );
      if (isAborted()) return;
      if (!active.ok) {
        setNotice("Your saved game could not be loaded. Try again.");
        return;
      }
      const started =
        active.value === null ? await start() : resumeTutorGame(active.value);
      if (isAborted()) return;
      if (!started.ok) {
        setNotice(
          active.value === null
            ? "This game could not be saved. Check browser storage and try again."
            : "Your saved game is invalid and could not be resumed.",
        );
        return;
      }
      setSession(started.value);
      const initialized = await initializedPromise;
      if (isAborted()) return;
      if (initialized.ok) {
        setEngineStatus("ready");
        if (started.value.state.phase === "cpu-turn") {
          await requestCpu(started.value);
        } else {
          setNotice("Your move");
        }
      } else {
        setEngineStatus("failed");
        setNotice("The opponent could not start. Try again.");
      }
    };
    void bootstrap();
    return () => {
      abort.abort();
      searchAbort.current?.abort();
    };
  }, [engine, launch, readyToStart, repository, requestCpu, start]);

  function cancelPromotion() {
    setPromotionTo(null);
    setNotice("Your move");
    requestAnimationFrame(() => {
      boardStage.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.focus();
    });
  }
  const chooseSquare = async (
    square: Square,
    promotion?: "q" | "r" | "b" | "n",
  ) => {
    if (
      session?.state.phase !== "player-turn" ||
      engineStatus !== "ready" ||
      saving
    )
      return;
    const game = new Chess(session.state.fen);
    const piece = game.get(square);

    if (selected === null) {
      if (piece?.color === "w") {
        setSelected(square);
        setNotice(`${pieceNames[piece.type]} selected on ${square}`);
      }
      return;
    }

    if (piece?.color === "w") {
      setSelected(square);
      setNotice(`${pieceNames[piece.type]} selected on ${square}`);
      return;
    }

    coachPreviewAbort.current?.abort();
    setCoachPreview(null);
    if (
      !promotion &&
      game
        .moves({ square: selected, verbose: true })
        .some((move) => move.to === square && move.promotion)
    ) {
      setPromotionTo(square);
      setNotice("Choose a promotion piece.");
      return;
    }
    setPromotionTo(null);
    setSaving(true);
    const moved = await acceptPlayerMove({
      session,
      move: {
        from: selected,
        to: square,
        ...(promotion ? { promotion } : {}),
      },
      now: now(),
      repository,
      completionObserver,
    });
    setSaving(false);
    setSelected(null);
    if (!moved.ok) {
      setNotice(
        moved.error.code === "storage"
          ? "Move not saved. Try again."
          : "That move is not legal.",
      );
      return;
    }

    setSession(moved.value);
    if (moved.value.state.phase === "cpu-turn") {
      await requestCpu(moved.value);
    } else {
      setNotice(statusFor(moved.value));
    }
  };

  const resign = async () => {
    if (
      session === null ||
      session.state.phase === "completed" ||
      session.state.phase === "resigned"
    )
      return;
    searchAbort.current?.abort();
    setSaving(true);
    const resigned = await resignTutorGame({
      session,
      now: now(),
      repository,
      completionObserver,
    });
    setSaving(false);
    if (resigned.ok) {
      setSession(resigned.value);
      setSelected(null);
      setNotice("Game resigned");
    } else {
      setNotice("Resignation could not be saved. Try again.");
    }
  };

  const retryOpponent = async () => {
    const abort = new AbortController();
    setEngineStatus("starting");
    setNotice("Preparing your opponent…");
    const ready = await initializeEngine(abort.signal);
    if (ready && session?.state.phase === "cpu-turn") await requestCpu(session);
  };

  const active =
    session?.state.phase === "player-turn" &&
    engineStatus === "ready" &&
    !saving;
  const previewFen =
    active && currentMode === "coached" && promotionTo === null
      ? session.state.fen
      : undefined;
  const previewKey =
    previewFen && record ? record.id + ":" + previewFen : undefined;
  const visiblePreview = coachPreview?.key === previewKey ? coachPreview : null;
  useEffect(
    () => () => {
      coachPreviewAbort.current?.abort();
    },
    [previewKey],
  );
  async function showCoachPreview(level: PreviewLevel) {
    if (
      !previewFen ||
      !previewKey ||
      !analyzeCoachMove ||
      visiblePreview?.status === "checking"
    )
      return;
    if (visiblePreview?.status === "ready") {
      setCoachPreview({ ...visiblePreview, level });
      return;
    }
    const request = new AbortController();
    coachPreviewAbort.current?.abort();
    coachPreviewAbort.current = request;
    setCoachPreview({ key: previewKey, status: "checking" });
    try {
      const result = await analyzeCoachMove(previewFen, request.signal);
      const [move] = legalBoardLine(previewFen, result?.line.slice(0, 1) ?? []);
      if (request.signal.aborted) return;
      setCoachPreview(
        move
          ? { key: previewKey, status: "ready", move, level }
          : { key: previewKey, status: "unavailable" },
      );
    } catch {
      if (!request.signal.aborted)
        setCoachPreview({ key: previewKey, status: "unavailable" });
    }
  }
  const checkedPreview =
    visiblePreview?.status === "ready" ? visiblePreview : null;
  const coachHint =
    checkedPreview?.level === 1
      ? beforeMoveHint(checkedPreview.move)
      : undefined;
  const enableCoach = async () => {
    if (!active || currentMode !== "rated") return;
    setSaving(true);
    const joined = await bringInCoach(session, repository);
    setSaving(false);
    if (!joined.ok) {
      setNotice("Coach could not join. Try again.");
      return;
    }
    setSession(joined.value);
    setCoachNotesOpen(false);
    setNotice("Rook joined. Your move.");
    onCoachJoined?.(joined.value.record.id);
  };
  const notes =
    coachNotesEnabled && coachNotes !== null && coachNotes.gameId === record?.id
      ? coachNotes.moments
      : [];
  const showRook = currentMode === "coached" && record !== undefined;
  const latestCoachPly = notes.at(-1)?.ply ?? 0;
  const unreadRook =
    !coachNotesOpen &&
    latestCoachPly >
      (readCoachPly?.gameId === record?.id ? (readCoachPly?.ply ?? 0) : 0);
  useEffect(() => {
    if (compact) return;
    const panel = rookPanel.current;
    if (!coachNotesOpen || panel === null) return;
    const { top, bottom } = panel.getBoundingClientRect();
    if (top >= window.innerHeight - 75 || bottom <= 0) {
      panel.scrollIntoView({ block: "nearest" });
    }
    panel
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  }, [coachNotesOpen, compact]);
  function toggleRook(open: boolean) {
    if (record === undefined) return;
    setCoachNotesOpen(open);
    setReadCoachPly((previous) => ({
      gameId: record.id,
      ply: Math.max(
        previous?.gameId === record.id ? previous.ply : 0,
        latestCoachPly,
      ),
    }));
    if (!open) {
      window.requestAnimationFrame(() => {
        rookToggle.current?.focus({ preventScroll: true });
      });
    }
    try {
      const key = `chesscue-rook-read:${noteScope}:${record.id}`;
      const stored = Number(localStorage.getItem(key));
      localStorage.setItem(
        key,
        String(
          Math.max(Number.isSafeInteger(stored) ? stored : 0, latestCoachPly),
        ),
      );
    } catch {
      /* Read state is still available in the current game. */
    }
  }
  const opponentElo =
    record?.origin.type === "tutor"
      ? (record.origin.opponentElo ?? targetElo)
      : targetElo;

  const beginner =
    record?.origin.type === "tutor"
      ? record.origin.beginnerOpponent !== undefined
      : mode === "rated" && targetElo < STOCKFISH_ELO_FLOOR;
  const opponentLabel = beginner
    ? "Beginner CPU"
    : currentMode === "rated" && placementCount !== null
      ? "Placement CPU"
      : String(opponentElo) + " Elo";

  const changeMode =
    onChangeMode === undefined ? null : (
      <button
        type="button"
        className="play-mode-link"
        disabled={
          saving ||
          engineStatus === "starting" ||
          (session?.state.phase === "cpu-turn" && engineStatus === "ready")
        }
        onClick={onChangeMode}
      >
        Change game mode
      </button>
    );
  const coachInvitation =
    currentMode === "rated" &&
    session !== null &&
    session.state.phase !== "completed" &&
    session.state.phase !== "resigned" ? (
      <button
        type="button"
        className="quiet-action coach-invitation"
        disabled={!active}
        onClick={() => {
          void enableCoach();
        }}
      >
        Continue unrated with Rook
      </button>
    ) : null;
  const moveHistory = (
    <div className="move-list">
      <div className="panel-heading">
        <span>Moves</span>
        <span>{session?.state.moves.length ?? 0} ply</span>
      </div>
      {session?.state.moves.length ? (
        <ol aria-label="Move history">
          {session.state.moves.map((move) => (
            <li key={move.ply}>{move.san}</li>
          ))}
        </ol>
      ) : (
        <p className="empty-moves">Your game begins here.</p>
      )}
    </div>
  );
  const resignAction = (
    <button
      type="button"
      className="quiet-action"
      disabled={session === null || saving}
      onClick={() => {
        void resign();
      }}
    >
      Resign game
    </button>
  );
  const playHeading = (
    <header className="play-header">
      <div>
        <p className="play-kicker" hidden={compact && currentMode === "rated"}>
          {currentMode === "rated"
            ? "Unassisted"
            : currentMode === "coached"
              ? "Coached game · Unrated"
              : "Focus game"}
        </p>
        <h1>
          {currentMode === "rated"
            ? "Rated game"
            : currentMode === "coached"
              ? "Play with Rook"
              : focusTitle}
        </h1>
        {currentMode === "rated" && placementCount !== null && (
          <p className="play-focus">
            Placement game {placementCount + 1} of {PLACEMENT_GAMES}
          </p>
        )}
        {currentMode !== "rated" && record?.coachJoinedAtPly === undefined ? (
          <p className="play-focus">
            {currentMode === "coached"
              ? `Working on ${focusTitle.toLowerCase()}`
              : focus}
          </p>
        ) : null}
        {!compact && changeMode}
      </div>
    </header>
  );
  const panelTurn = session
    ? statusFor(session)
    : engineStatus === "failed"
      ? "Opponent unavailable"
      : "Preparing your opponent…";
  const turnStatus = (
    <div
      className={compact ? "board-turn" : "turn-status"}
      role="status"
      aria-live="polite"
    >
      {engineStatus === "starting" ||
      (engineStatus === "ready" && session?.state.phase === "cpu-turn") ? (
        <LoadingMark />
      ) : !compact ? (
        <span
          className={`status-dot status-${engineStatus}`}
          aria-hidden="true"
        />
      ) : null}
      <span>{compact ? panelTurn : notice}</span>
      {compact && currentMode === "coached" && <span> · Unrated</span>}
    </div>
  );
  const boardMeta = (
    <div className="play-board-meta">
      {turnStatus}
      <div className="opponent-card" aria-label={"Opponent: " + opponentLabel}>
        <span>Adaptive CPU</span>
        <strong>{opponentLabel}</strong>
      </div>
    </div>
  );
  const hintText =
    visiblePreview &&
    (visiblePreview.status === "checking" ? (
      <LoadingText>Rook is checking…</LoadingText>
    ) : visiblePreview.status === "unavailable" ? (
      "No verified hint for this position. Try again or play your move."
    ) : checkedPreview?.level === "move" ? (
      compact ? (
        `I’d play ${checkedPreview.move.san}.`
      ) : (
        `Rook suggests ${checkedPreview.move.san}.`
      )
    ) : checkedPreview?.level === 2 ? (
      `Look at the ${pieceNames[checkedPreview.move.piece]} on ${checkedPreview.move.from}.`
    ) : (
      coachHint?.text
    ));
  const boardFeedback = (
    <>
      {compact && notice !== panelTurn && (
        <p className="play-coach-hints__status" role="status">
          {notice}
        </p>
      )}
      {active && promotionTo && (
        <div
          ref={promotionGroup}
          className="play-promotion"
          role="group"
          aria-label="Choose promotion"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              cancelPromotion();
            }
          }}
        >
          <strong>Promote to</strong>
          {(["q", "r", "b", "n"] as const).map((piece) => (
            <button
              type="button"
              className="quiet-action piece-choice"
              key={piece}
              aria-label={
                pieceNames[piece].charAt(0).toUpperCase() +
                pieceNames[piece].slice(1)
              }
              title={pieceNames[piece]}
              onClick={() => {
                void chooseSquare(promotionTo, piece);
              }}
            >
              <PromotionPiece piece={piece} color="w" />
            </button>
          ))}
          <button
            type="button"
            className="quiet-action"
            onClick={cancelPromotion}
          >
            Cancel
          </button>
        </div>
      )}
      {session !== null ? (
        <BoardBalance
          fen={session.state.fen}
          captures={session.state.captures}
          position={
            currentMode === "coached" && assessPosition !== null
              ? {
                  assess: assessPosition,
                  onDemand: true,
                  available: active,
                }
              : undefined
          }
        />
      ) : null}
      {compact && hintText && (
        <div
          className="rook-board-message play-coach-hints__cue"
          role="status"
          aria-label="Rook hint"
        >
          <RookMessage>
            <p>{hintText}</p>
          </RookMessage>
        </div>
      )}
    </>
  );
  return (
    <main
      className={
        currentMode === "coached"
          ? "play-shell play-shell--coached"
          : "play-shell"
      }
    >
      {!compact && playHeading}

      <section className="game-layout" aria-label="Chess game">
        <div className="play-board-stage" ref={boardStage}>
          {!compact && boardMeta}
          <ChessBoard
            className="play-board"
            fen={session?.state.fen}
            label="Chess board, White side"
            selectedSquare={selected}
            hintSquares={coachHint?.squares}
            focusSquares={
              checkedPreview?.level === "move" || checkedPreview?.level === 2
                ? [checkedPreview.move.from]
                : []
            }
            moveCue={
              checkedPreview?.level === "move"
                ? { arrows: [moveArrow(checkedPreview.move)] }
                : undefined
            }
            disabled={!active || promotionTo !== null}
            onSquareSelect={(square) => {
              void chooseSquare(square);
            }}
          />
          {!compact && boardFeedback}
          {(compact || (previewKey && analyzeCoachMove)) && (
            <div className={compact ? undefined : "play-coach-hints"}>
              <div
                className="board-action-row board-action-row--anchored"
                aria-label={showRook ? "Rook hints" : "Board controls"}
                role="group"
              >
                {previewKey && analyzeCoachMove && (
                  <>
                    <HintButton
                      level={
                        checkedPreview?.level === "move"
                          ? 2
                          : (checkedPreview?.level ?? 0)
                      }
                      disabled={visiblePreview?.status === "checking"}
                      onClick={() => {
                        void showCoachPreview(
                          checkedPreview?.level === 1 ? 2 : 1,
                        );
                      }}
                    />
                    <NextMovePill
                      disabled={
                        visiblePreview?.status === "checking" ||
                        checkedPreview?.level === "move"
                      }
                      onClick={() => {
                        void showCoachPreview("move");
                      }}
                    />
                  </>
                )}
                {compact && showRook && (
                  <RookConversationButton
                    buttonRef={rookToggle}
                    expanded={coachNotesOpen}
                    unread={unreadRook}
                    onClick={() => {
                      toggleRook(!coachNotesOpen);
                      if (!coachNotesOpen)
                        rookPanel.current
                          ?.querySelector("input")
                          ?.focus({ preventScroll: true });
                    }}
                  />
                )}
                {compact && turnStatus}
              </div>
              {!compact && hintText && (
                <p
                  className="play-coach-hints__status"
                  role="status"
                  aria-label="Rook hint"
                >
                  {hintText}
                </p>
              )}
            </div>
          )}
        </div>

        {showRook ? (
          <section
            ref={rookPanel}
            id="active-rook-chat"
            className={compact ? "rook-chat rook-board-dock" : "rook-chat"}
            aria-label="Rook chat"
            hidden={!compact && !coachNotesOpen}
          >
            {(compact || coachNotesOpen) && (
              <RookChat
                key={record.id}
                game={record}
                moments={notes}
                scope={noteScope}
                inline={compact}
                boardFeedback={compact ? boardFeedback : undefined}
                conversationOpen={coachNotesOpen}
                onConversationOpen={() => {
                  toggleRook(true);
                }}
                observations={coachNotesEnabled}
                onObservations={(enabled) => {
                  coachNotesPreference.current = enabled;
                  setCoachNotesEnabled(enabled);
                  try {
                    localStorage.setItem(
                      "chesscue-coach-notes",
                      enabled ? "on" : "off",
                    );
                  } catch {
                    /* The current game can still use the setting. */
                  }
                }}
                onClose={() => {
                  toggleRook(false);
                }}
              />
            )}
          </section>
        ) : null}
        <aside
          className="game-panel"
          aria-label="Game controls and move history"
        >
          {compact && !showRook && boardFeedback}
          {!compact && (
            <>
              {coachInvitation}
              {moveHistory}
            </>
          )}
          {engineStatus === "failed" ? (
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                void retryOpponent();
              }}
            >
              Retry opponent
            </button>
          ) : null}
          {session?.state.phase === "completed" ||
          session?.state.phase === "resigned" ? (
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                void createNewGame("Your move");
              }}
            >
              Start another game
            </button>
          ) : !compact ? (
            resignAction
          ) : null}
          {compact && (
            <details className="board-reference play-details">
              <summary>Game details</summary>
              {playHeading}
              <p className="play-focus">Opponent · {opponentLabel}</p>
              {changeMode}
              {coachInvitation}
              {moveHistory}
              {session?.state.phase !== "completed" &&
                session?.state.phase !== "resigned" &&
                resignAction}
            </details>
          )}
        </aside>
      </section>
      {showRook && !compact && (
        <RookLauncher
          buttonRef={rookToggle}
          open={coachNotesOpen}
          unread={unreadRook}
          speech={
            notes.at(-1)?.title ??
            "I’m here if you want to talk through a move."
          }
          storageKey={`chesscue-rook-position:${noteScope}`}
          onToggle={() => {
            toggleRook(!coachNotesOpen);
          }}
        />
      )}
    </main>
  );
}

function statusFor(session: PlaySession): string {
  if (session.state.phase === "completed") {
    if (session.state.result === "white-win") return "Checkmate. You won.";
    if (session.state.result === "black-win") return "Checkmate. The CPU won.";
    return "Game drawn.";
  }
  if (session.state.phase === "resigned") return "Game resigned";
  return session.state.phase === "player-turn" ? "Your move" : "CPU thinking…";
}
