import { Chess, type Square } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import {
  analyzeGameReport,
  type GameReport,
} from "../../application/analyze-game/analyze-game-report";
import {
  reportMoveGrades,
  reportWinChance,
} from "../../domain/analysis/move-grades";
import { buildGameReplay } from "../../domain/analysis/replay-game";
import { barReading } from "../../domain/game/eval-bar";
import type { GameRecord, PlayerColor } from "../../domain/game/types";
import { StockfishAnalysisEngine } from "../../infrastructure/engine/stockfish-analysis-engine";
import { LoadingText } from "../../shared/loading/LoadingState";
import { useEntryState } from "../../shared/navigation/history-entry";
import { Button, Pill } from "../../shared/ui/primitives";
import { ChessBoard } from "../board/ChessBoard";
import { pieceNames } from "../board/board-pieces";
import { PromotionPiece } from "../board/PromotionPiece";
import "./game-report.css";

type ReportState =
  | {
      readonly kind: "checking";
      readonly completed: number;
      readonly total: number;
    }
  | { readonly kind: "ready"; readonly report: GameReport }
  | { readonly kind: "failed"; readonly message: string };

const reports = new Map<string, GameReport>();
const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const graphY = (cp: number) => 80 - reportWinChance(cp) * 0.78;
const reportPosition = z.object({
  ply: z.number().int().nonnegative(),
  mode: z.enum(["played", "before", "best"]),
});

function formatEvaluation(cp: number): string {
  if (Math.abs(cp) >= 90_000)
    return cp > 0 ? "White has mate" : "Black has mate";
  return `${cp >= 0 ? "+" : "−"}${(Math.abs(cp) / 100).toFixed(1)}`;
}

function Accuracy({
  report,
  side,
}: {
  readonly report: GameReport;
  readonly side: PlayerColor;
}) {
  const moves = report.moves.filter((move) => move.side === side);
  const average =
    moves.length > 0
      ? percent.format(
          moves.reduce((sum, move) => sum + move.accuracy, 0) / moves.length,
        ) + "%"
      : "—";
  return (
    <div>
      <dt>{side === "white" ? "White" : "Black"} accuracy</dt>
      <dd>{average}</dd>
    </div>
  );
}

export function GameReportScreen({
  game,
  owner,
  title,
  opening,
  onExplore,
}: {
  readonly game: GameRecord;
  readonly owner: string;
  readonly title: string | undefined;
  readonly opening: string | undefined;
  readonly onExplore: (fen: string, orientation: PlayerColor) => void;
}) {
  const key = useMemo(
    () =>
      JSON.stringify([
        "report/1",
        owner,
        game.id,
        game.initialFen,
        game.moves.map(({ uci }) => uci),
      ]),
    [owner, game],
  );
  const replay = useMemo(() => buildGameReplay(game), [game]);
  const [position, setPosition] = useEntryState(
    "report.position",
    reportPosition,
    { ply: 0, mode: "played" },
  );
  const ply = Math.min(position.ply, game.moves.length);
  const mode = ply === 0 ? "played" : position.mode;
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<Square | null>(null);
  const [feedback, setFeedback] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReportState>(() => {
    const report = reports.get(key);
    return report
      ? { kind: "ready", report }
      : { kind: "checking", completed: 0, total: game.moves.length + 1 };
  });
  useEffect(() => {
    const cached = reports.get(key);
    if (cached) return;
    const controller = new AbortController();
    const engine = new StockfishAnalysisEngine();
    const timer = setTimeout(() => {
      void analyzeGameReport(
        game,
        engine,
        controller.signal,
        (completed, total) => {
          setState({ kind: "checking", completed, total });
        },
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          if (!result.ok) {
            setState({ kind: "failed", message: result.error });
            return;
          }
          if (reports.size >= 8) {
            const first = reports.keys().next().value;
            if (first !== undefined) reports.delete(first);
          }
          reports.set(key, result.value);
          setState({ kind: "ready", report: result.value });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setState({
              kind: "failed",
              message: "Stockfish could not complete this report.",
            });
        })
        .finally(() => {
          engine.dispose();
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
      engine.dispose();
    };
  }, [attempt, game, key]);

  if (!replay.ok) return <p role="alert">{replay.message}</p>;

  const report = state.kind === "ready" ? state.report : undefined;
  const move = report?.moves[ply - 1];
  const frame = replay.frames[mode === "before" ? Math.max(0, ply - 1) : ply];
  if (!frame) return null;
  const orientation = game.playerColor ?? "white";
  const fen = mode === "best" && move ? move.bestFen : frame.fen;
  const lastMoveUci =
    mode === "best" && move ? move.bestUci : frame.lastMoveUci;
  const evaluation =
    report?.evaluations[mode === "before" ? Math.max(0, ply - 1) : ply];
  const mistakes = report?.moves.filter(
    ({ grade }) => grade === "Mistake" || grade === "Blunder",
  );
  const stepX = 280 / Math.max(1, game.moves.length);
  const cursorX = ply * stepX;
  const practice = mode === "before" && move?.side === game.playerColor;
  const legal = practice ? new Chess(fen).moves({ verbose: true }) : [];
  const legalTargets = legal
    .filter(({ from }) => from === selected)
    .map(({ to }) => to);
  const balance =
    evaluation !== undefined && mode !== "best" && !practice
      ? barReading({ kind: "estimate", whiteCentipawns: evaluation })
      : "reserved";

  function select(next: number, display: typeof mode = "played") {
    setPosition({ ply: next, mode: display });
    setSelected(null);
    setPromotion(null);
    setFeedback("");
  }

  function tryMove(uci: string) {
    if (!move) return;
    if (uci === move.bestUci) {
      select(ply, "best");
      setFeedback("You found Stockfish’s move.");
    } else {
      setSelected(null);
      setPromotion(null);
      setFeedback(
        "Stockfish checked a different move for this report. Try again or analyze this position.",
      );
    }
  }

  function selectSquare(square: Square) {
    const choices = legal.filter(
      ({ from, to }) => from === selected && to === square,
    );
    if (choices.length > 1) setPromotion(square);
    else if (choices[0]) tryMove(choices[0].lan);
    else
      setSelected(
        selected !== square && legal.some(({ from }) => from === square)
          ? square
          : null,
      );
  }

  return (
    <main className="board-split game-report">
      <div className="board-split__main">
        <ChessBoard
          fen={fen}
          orientation={orientation}
          lastMoveUci={lastMoveUci}
          label="Game report board"
          balance={balance}
          selectedSquare={selected}
          legalTargets={legalTargets}
          onSquareSelect={practice && promotion === null ? selectSquare : null}
        />
        <p className="game-report__position">
          {mode === "best" && move
            ? `Stockfish’s alternative: ${move.bestSan}`
            : mode === "before" && move
              ? `Position before ${move.san}`
              : (frame.lastMoveSan ?? "Starting position")}
        </p>
        {practice && (
          <p className="game-report__position">
            Find the better move on the board.
          </p>
        )}
        {feedback && <p role="status">{feedback}</p>}
        {promotion !== null && (
          <div
            className="game-report__controls"
            role="group"
            aria-label="Choose promotion"
          >
            {legal
              .filter(({ from, to }) => from === selected && to === promotion)
              .map(
                (choice) =>
                  choice.promotion && (
                    <Pill
                      key={choice.lan}
                      aria-label={`Promote to ${pieceNames[choice.promotion]}`}
                      onClick={() => {
                        tryMove(choice.lan);
                      }}
                    >
                      <PromotionPiece
                        color={choice.color}
                        piece={choice.promotion}
                      />
                    </Pill>
                  ),
              )}
            <Pill
              onClick={() => {
                setPromotion(null);
              }}
            >
              Cancel
            </Pill>
          </div>
        )}
        <div
          className="game-report__controls"
          role="group"
          aria-label="Report playback"
        >
          <Pill
            disabled={ply === 0}
            onClick={() => {
              select(ply - 1);
            }}
          >
            Previous move
          </Pill>
          <Pill
            disabled={ply >= game.moves.length}
            onClick={() => {
              select(ply + 1);
            }}
          >
            Next move
          </Pill>
        </div>
        {mode !== "played" && (
          <Pill
            onClick={() => {
              select(ply);
            }}
          >
            Show played move
          </Pill>
        )}
        {mode === "before" && move && (
          <Pill
            onClick={() => {
              select(ply, "best");
            }}
          >
            Show better move
          </Pill>
        )}
        {mode === "before" && (
          <Button
            variant="ghost"
            onClick={() => {
              onExplore(fen, orientation);
            }}
          >
            Analyze this position
          </Button>
        )}
      </div>
      <div className="board-split__aside">
        {title && <p className="game-report__match">{title}</p>}
        {opening && <p className="game-report__match">{opening}</p>}
        {state.kind === "checking" && (
          <p role="status">
            <LoadingText>
              Checking positions · {state.completed} of {state.total}
            </LoadingText>
          </p>
        )}
        {state.kind === "failed" && (
          <div>
            <p role="alert">{state.message}</p>
            <Pill
              onClick={() => {
                setState({
                  kind: "checking",
                  completed: 0,
                  total: game.moves.length + 1,
                });
                setAttempt((count) => count + 1);
              }}
            >
              Retry report
            </Pill>
          </div>
        )}
        {report && (
          <>
            <dl className="game-report__accuracy">
              <Accuracy report={report} side="white" />
              <Accuracy report={report} side="black" />
            </dl>
            <svg
              className="game-report__graph"
              viewBox="0 0 280 82"
              role="img"
              aria-label="Stockfish evaluation through the game. White advantage is above the center line."
            >
              <line
                className="game-report__axis"
                x1="0"
                x2="280"
                y1="41"
                y2="41"
              />
              <polyline
                points={report.evaluations
                  .map(
                    (cp, index) =>
                      `${String(index * stepX)},${String(graphY(cp))}`,
                  )
                  .join(" ")}
              />
              <line
                className="game-report__cursor"
                x1={cursorX}
                x2={cursorX}
                y1="0"
                y2="82"
              />
              {mistakes?.map(({ ply }) => {
                const cp = report.evaluations[ply];
                return cp === undefined ? null : (
                  <circle
                    key={ply}
                    className="game-report__mistake-dot"
                    r="2.5"
                    cx={ply * stepX}
                    cy={graphY(cp)}
                  />
                );
              })}
            </svg>
            {evaluation !== undefined && mode !== "best" && !practice && (
              <p className="game-report__evaluation">
                White perspective · {formatEvaluation(evaluation)}
              </p>
            )}
            {mode === "played" && move && (
              <p>
                {move.san} · {move.grade}
              </p>
            )}
            <details>
              <summary>Move grades</summary>
              <table className="game-report__grades">
                <thead>
                  <tr>
                    <th scope="col">Grade</th>
                    <th scope="col">White</th>
                    <th scope="col">Black</th>
                  </tr>
                </thead>
                <tbody>
                  {reportMoveGrades.map((grade) => (
                    <tr key={grade}>
                      <th scope="row">{grade}</th>
                      <td>
                        {
                          report.moves.filter(
                            (move) =>
                              move.grade === grade && move.side === "white",
                          ).length
                        }
                      </td>
                      <td>
                        {
                          report.moves.filter(
                            (move) =>
                              move.grade === grade && move.side === "black",
                          ).length
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
        <label className="game-report__slider">
          Game position
          <input
            type="range"
            min={0}
            max={game.moves.length}
            value={ply}
            aria-valuetext={
              ply === 0 ? "Starting position" : `Ply ${String(ply)}`
            }
            onChange={(event) => {
              select(event.currentTarget.valueAsNumber);
            }}
          />
        </label>
        {mistakes && mistakes.length > 0 && (
          <section
            aria-label="Mistakes to review"
            className="game-report__mistakes"
          >
            <h2>Mistakes to review</h2>
            <ul>
              {mistakes.map((entry) => (
                <li key={entry.ply}>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      select(entry.ply, "before");
                    }}
                  >
                    {Math.ceil(entry.ply / 2)}
                    {entry.side === "white" ? "." : "…"} {entry.san} ·{" "}
                    {entry.grade}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
