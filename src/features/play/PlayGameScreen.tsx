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
  requestCpuReply,
  resignTutorGame,
  startTutorGame,
  type PlaySession,
} from "../../application/play-game/play-game";
import {
  FOCUS_OPENING_POLICY_VERSION,
  focusOpeningCandidates,
  type CurriculumTheme,
} from "../../domain/curriculum";
import type { GameId, PositionId } from "../../domain/game/types";
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
}

export function PlayGameScreen({
  engine,
  repository,
  createGameId,
  createPositionId,
  now = systemNow,
  targetElo = 1480,
  focusTheme = "development",
  focusTitle = "Hold the center",
  focus = "Hold the center. Keep the tension before exchanging central pawns.",
  onGameCompleted,
}: PlayGameScreenProps) {
  const [session, setSession] = useState<PlaySession | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("starting");
  const [selected, setSelected] = useState<Square | null>(null);
  const [notice, setNotice] = useState("Preparing your opponent…");
  const [saving, setSaving] = useState(false);
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

  const createNewGame = useCallback(
    async (startNotice: string) => {
      setSaving(true);
      setSelected(null);
      const started = await startTutorGame({
        id: createGameId(),
        playerColor: "white",
        curriculumVersion: "1.0.0",
        configurationVersion: "1.0.0",
        trainingFocus: focusTheme,
        openingPolicyVersion: FOCUS_OPENING_POLICY_VERSION,
        now: now(),
        repository,
      });
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
    [createGameId, focusTheme, now, repository],
  );

  useEffect(() => {
    const abort = new AbortController();
    const bootstrap = async () => {
      const [initialized, started] = await Promise.all([
        engine.initialize(abort.signal),
        startTutorGame({
          id: createGameId(),
          playerColor: "white",
          curriculumVersion: "1.0.0",
          configurationVersion: "1.0.0",
          trainingFocus: focusTheme,
          openingPolicyVersion: FOCUS_OPENING_POLICY_VERSION,
          now: now(),
          repository,
        }),
      ]);
      if (abort.signal.aborted) return;
      if (started.ok) setSession(started.value);
      if (!started.ok) {
        setNotice(
          "This game could not be saved. Check browser storage and try again.",
        );
        return;
      }
      if (initialized.ok) {
        setEngineStatus("ready");
        setNotice("Your move");
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
  }, [createGameId, engine, focusTheme, now, repository]);

  const requestCpu = async (current: PlaySession) => {
    const abort = new AbortController();
    searchAbort.current = abort;
    setNotice("CPU thinking…");
    const openingCandidates = focusOpeningCandidates({
      focus: focusTheme,
      fen: current.state.fen,
      moves: current.state.moves.map(({ uci }) => uci),
    });
    const reply = await requestCpuReply({
      session: current,
      engine,
      repository,
      positionId: createPositionId(),
      targetElo,
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
  };

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

  return (
    <main className="play-shell">
      <header className="play-header">
        <div>
          <p className="play-kicker">Focus game</p>
          <h1>{focusTitle}</h1>
          <p className="play-focus">{focus}</p>
        </div>
        <div
          className="opponent-card"
          aria-label={`Adaptive CPU rated ${targetElo.toString()}`}
        >
          <span>Adaptive CPU</span>
          <strong>{targetElo}</strong>
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
