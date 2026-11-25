import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";

import type { GameEngine } from "../../application/ports/game-engine";
import type { GameRepository } from "../../application/ports/game-repository";
import {
  OneShotGameCompletionObserver,
  type GameCompletedCallback,
} from "../../application/play-game/game-completion";
import {
  acceptPlayerMove,
  bringInCoach,
  requestCpuReply,
  resumeTutorGame,
  resignTutorGame,
  startTutorGame,
  type PlaySession,
} from "../../application/play-game/play-game";
import {
  FOCUS_OPENING_POLICY_VERSION,
  focusOpeningCandidates,
  type CurriculumTheme,
} from "../../domain/curriculum";
import {
  savedCoachMoments,
  type CoachMoment,
} from "../../domain/game/coach-moments";
import {
  tutorGameMode,
  type GameId,
  type PositionId,
  type TutorGameMode,
} from "../../domain/game/types";
import { ok } from "../../shared/result/result";
import { RookChat } from "./RookChat";
import { RookLauncher } from "./RookLauncher";
import "./play-game.css";

const BOARD_SQUARES: readonly Square[] = [
  "a8",
  "b8",
  "c8",
  "d8",
  "e8",
  "f8",
  "g8",
  "h8",
  "a7",
  "b7",
  "c7",
  "d7",
  "e7",
  "f7",
  "g7",
  "h7",
  "a6",
  "b6",
  "c6",
  "d6",
  "e6",
  "f6",
  "g6",
  "h6",
  "a5",
  "b5",
  "c5",
  "d5",
  "e5",
  "f5",
  "g5",
  "h5",
  "a4",
  "b4",
  "c4",
  "d4",
  "e4",
  "f4",
  "g4",
  "h4",
  "a3",
  "b3",
  "c3",
  "d3",
  "e3",
  "f3",
  "g3",
  "h3",
  "a2",
  "b2",
  "c2",
  "d2",
  "e2",
  "f2",
  "g2",
  "h2",
  "a1",
  "b1",
  "c1",
  "d1",
  "e1",
  "f1",
  "g1",
  "h1",
];

const BOARD_ROWS = Array.from({ length: 8 }, (_, rowIndex) =>
  BOARD_SQUARES.slice(rowIndex * 8, rowIndex * 8 + 8),
);

type EngineStatus = "starting" | "ready" | "failed";
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
  readonly noteScope?: string;
  readonly resumeGameId?: GameId;
  readonly onModeChange?: (mode: TutorGameMode) => void;
  readonly onCoachJoined?: (gameId: GameId) => void;
}

export function PlayGameScreen({
  engine,
  repository,
  createGameId,
  createPositionId,
  now = systemNow,
  targetElo: initialTargetElo = 1480,
  focusTheme = "development",
  focusTitle = "Hold the center",
  focus = "Hold the center. Keep the tension before exchanging central pawns.",
  onGameCompleted,
  mode,
  noteScope = "adaptive-chess-tutor",
  resumeGameId,
  onModeChange,
  onCoachJoined,
}: PlayGameScreenProps) {
  // Incoming account syncs and switching this game to unrated must preserve its opponent.
  const [targetElo] = useState(initialTargetElo);
  const [launch] = useState(() => ({ mode, resumeGameId }));
  const [modePickerOpen, setModePickerOpen] = useState(false);

  const [session, setSession] = useState<PlaySession | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("starting");
  const [selected, setSelected] = useState<Square | null>(null);
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
    (gameMode: TutorGameMode | undefined) =>
      startTutorGame({
        id: createGameId(),
        playerColor: "white",
        curriculumVersion: "1.0.0",
        configurationVersion: "1.0.0",
        ...(gameMode === "rated"
          ? {}
          : {
              trainingFocus: focusTheme,
              openingPolicyVersion: FOCUS_OPENING_POLICY_VERSION,
            }),
        ...(gameMode === undefined
          ? {}
          : { mode: gameMode, opponentElo: targetElo }),
        now: now(),
        repository,
      }),
    [createGameId, focusTheme, now, repository, targetElo],
  );

  const record = session?.record;
  const currentMode =
    mode === undefined || record === undefined
      ? mode
      : (tutorGameMode(record) ?? "rated");
  useEffect(() => {
    if (currentMode !== "coached" || !coachNotesEnabled || record === undefined)
      return;
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
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [coachNotesEnabled, currentMode, noteScope, record]);

  const createNewGame = useCallback(
    async (startNotice: string) => {
      setSaving(true);
      setSelected(null);
      setCoachNotesOpen(false);
      const started = await start(currentMode ?? undefined);
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
    [currentMode, start],
  );

  const requestCpu = useCallback(
    async (current: PlaySession) => {
      const abort = new AbortController();
      searchAbort.current = abort;
      setNotice("CPU thinking…");
      const origin = current.record.origin;
      const openingCandidates =
        origin.type === "tutor" && origin.mode === "rated"
          ? []
          : focusOpeningCandidates({
              focus: focusTheme,
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
    const abort = new AbortController();
    const isAborted = (): boolean => abort.signal.aborted;
    const bootstrap = async () => {
      const initializedPromise = engine.initialize(abort.signal);
      const requested =
        launch.resumeGameId === undefined
          ? ok(null)
          : await repository.get(launch.resumeGameId);
      const active = !requested.ok
        ? requested
        : requested.value !== null &&
            requested.value.completedAt === null &&
            tutorGameMode(requested.value) === launch.mode
          ? requested
          : await repository.getLatestInProgress(launch.mode);
      if (isAborted()) return;
      if (!active.ok) {
        setNotice("Your saved game could not be loaded. Try again.");
        return;
      }
      const started =
        active.value === null
          ? await start(launch.mode)
          : resumeTutorGame(active.value);
      const initialized = await initializedPromise;
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
  }, [engine, launch, repository, requestCpu, start]);

  const chooseSquare = async (square: Square) => {
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
        setNotice(`${pieceName(piece.type)} selected on ${square}`);
      }
      return;
    }

    if (piece?.color === "w") {
      setSelected(square);
      setNotice(`${pieceName(piece.type)} selected on ${square}`);
      return;
    }

    setSaving(true);
    const moved = await acceptPlayerMove({
      session,
      move: {
        from: selected,
        to: square,
        ...(needsPromotion(game, selected, square) ? { promotion: "q" } : {}),
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

  const game = new Chess(session?.state.fen);
  const active =
    session?.state.phase === "player-turn" &&
    engineStatus === "ready" &&
    !saving;

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
    setModePickerOpen(false);
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
    const panel = rookPanel.current;
    if (!coachNotesOpen || panel === null) return;
    const { top, bottom } = panel.getBoundingClientRect();
    if (top >= window.innerHeight - 75 || bottom <= 0) {
      panel.scrollIntoView({ block: "nearest" });
    }
    panel
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  }, [coachNotesOpen]);
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
  return (
    <main className="play-shell">
      <header className="play-header">
        <div>
          <p className="play-kicker">
            {currentMode === "coached"
              ? "Coached game · Unrated"
              : currentMode === "rated"
                ? "Unassisted"
                : "Focus game"}
          </p>
          <h1>
            {currentMode === "coached"
              ? "Play with Rook"
              : currentMode === "rated"
                ? "Rated game"
                : focusTitle}
          </h1>
          {currentMode !== "rated" && record?.coachJoinedAtPly === undefined ? (
            <p className="play-focus">{focus}</p>
          ) : null}
          {onModeChange && (
            <div className="play-mode">
              <button
                type="button"
                className="quiet-action"
                aria-expanded={modePickerOpen}
                disabled={!active}
                onClick={() => {
                  setModePickerOpen(!modePickerOpen);
                }}
              >
                Change game mode
              </button>
              {modePickerOpen && (
                <div
                  className="play-mode__options"
                  role="group"
                  aria-label="Game mode"
                >
                  <button
                    type="button"
                    className="quiet-action"
                    disabled={!active || currentMode === "rated"}
                    onClick={() => {
                      onModeChange("rated");
                    }}
                  >
                    Rated
                  </button>
                  <button
                    type="button"
                    className="quiet-action"
                    disabled={!active || currentMode === "coached"}
                    onClick={() => {
                      onModeChange("coached");
                    }}
                  >
                    Coached
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="opponent-card" aria-label="Adaptive CPU">
          <span>Adaptive CPU</span>
          <strong>
            {record?.origin.type === "tutor"
              ? (record.origin.opponentElo ?? targetElo)
              : targetElo}
          </strong>
        </div>
      </header>

      <section className="game-layout" aria-label="Chess game">
        <div>
          <div className="turn-status" role="status" aria-live="polite">
            <span
              className={`status-dot status-${engineStatus}`}
              aria-hidden="true"
            />
            {notice}
          </div>
          <div
            className="chessboard"
            role="grid"
            aria-label="Chess board, White side"
          >
            {BOARD_ROWS.map((row, rowIndex) => (
              <div className="board-row" role="row" key={row[0]}>
                {row.map((square, columnIndex) => {
                  const piece = game.get(square);
                  const dark = (rowIndex + columnIndex) % 2 === 1;
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      key={square}
                      className={`board-square ${dark ? "square-dark" : "square-light"} ${selected === square ? "square-selected" : ""}`}
                      aria-label={squareLabel(square, piece)}
                      aria-selected={selected === square}
                      disabled={!active}
                      onClick={() => {
                        void chooseSquare(square);
                      }}
                    >
                      <span className="piece" aria-hidden="true">
                        {pieceGlyph(piece)}
                      </span>
                      <span className="coordinate" aria-hidden="true">
                        {square}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <aside
          className="game-panel"
          aria-label="Game controls and move history"
        >
          {currentMode === "rated" &&
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
          ) : null}
          {showRook && coachNotesOpen ? (
            <section
              ref={rookPanel}
              id="active-rook-chat"
              className="rook-chat"
              aria-label="Rook chat"
            >
              <RookChat
                key={record.id}
                game={record}
                moments={notes}
                scope={noteScope}
                observations={coachNotesEnabled}
                onObservations={(enabled) => {
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
            </section>
          ) : null}
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
          ) : (
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
          )}
        </aside>
      </section>
      {showRook && (
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

function needsPromotion(game: Chess, from: Square, to: Square): boolean {
  const piece = game.get(from);
  return piece?.type === "p" && (to.endsWith("8") || to.endsWith("1"));
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

function squareLabel(
  square: Square,
  piece: { readonly color: Color; readonly type: PieceSymbol } | undefined,
): string {
  if (piece === undefined) return `Empty ${square}`;
  return `${piece.color === "w" ? "White" : "Black"} ${pieceName(piece.type)} on ${square}`;
}

function pieceName(piece: PieceSymbol): string {
  const names: Record<PieceSymbol, string> = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  };
  return names[piece];
}

function pieceGlyph(
  piece: { readonly color: Color; readonly type: PieceSymbol } | undefined,
): string {
  if (piece === undefined) return "";
  const glyphs: Record<Color, Record<PieceSymbol, string>> = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  };
  return glyphs[piece.color][piece.type];
}
