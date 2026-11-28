import { Chess, DEFAULT_POSITION, SQUARES, type Square } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AnalysisEngine,
  PositionAnalysis,
} from "../../application/analyze-game/analysis-engine";
import type { BoardArrow } from "../../domain/analysis/board-move-cues";
import { terminalAssessment } from "../../domain/game/board-balance";
import {
  CHECKING,
  barReading,
  type BarReading,
} from "../../domain/game/eval-bar";
import type { PlayerColor } from "../../domain/game/types";
import {
  checkFen,
  engineLines,
  moveVerdict,
  type EngineLine,
  type MoveVerdict,
  uciMove,
} from "../../domain/next-move/next-move";
import { ChessBoard, type BoardBadge } from "../board/ChessBoard";
import { pieceSymbols } from "../board/board-pieces";
import { RookBubble } from "../../shared/rook/RookBubble";
import { RookCharacter, type RookMood } from "../../shared/rook/RookCharacter";
import { Button, Pill, Sheet } from "../../shared/ui/primitives";
import { PieceSetup } from "./PieceSetup";
import "./next-move.css";

// The next-move tool (docs/design/chessigma-parity.md, increment 1). Any
// position, Stockfish's three best moves, and what a played move does.
// Never opened from a game in progress, so rated play stays unassisted.

export const START_DEPTH = 18;
const DEEPER_BY = 4;
const MAX_DEPTH = 34;
const LINES = 3;
// The depth caps the search; this only stops a stuck worker.
const SEARCH_BUDGET_MS = 120_000;

// How the latest search for a position at a depth ended. A position with no
// ending at the current depth, and no analysis that deep, is being searched.
interface Ended {
  readonly fen: string;
  readonly target: number;
  readonly kind: "done" | "stopped" | "failed";
}

interface Step {
  readonly uci: string;
  readonly fen: string;
}

interface Played {
  readonly fromFen: string;
  readonly uci: string;
  readonly toFen: string;
}

const PROMOTIONS = ["q", "r", "b", "n"] as const;
type Promotion = (typeof PROMOTIONS)[number];
const PROMOTION_NAME: Readonly<Record<Promotion, string>> = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

function square(name: string): Square | undefined {
  return SQUARES.find((candidate) => candidate === name);
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

function applyUci(fen: string, uci: string): string | undefined {
  try {
    const board = new Chess(fen);
    board.move(uciMove(uci));
    return board.fen();
  } catch {
    return undefined;
  }
}

function gameOver(fen: string): string | undefined {
  const board = new Chess(fen);
  if (board.isCheckmate())
    return board.turn() === "w" ? "Black has mated" : "White has mated";
  if (board.isStalemate()) return "Stalemate";
  if (board.isInsufficientMaterial()) return "Draw · not enough material";
  if (board.isDraw()) return "Draw";
  return undefined;
}

function deeper(
  known: PositionAnalysis | undefined,
  update: PositionAnalysis,
): boolean {
  return (
    (update.candidates[0]?.depth ?? 0) > (known?.candidates[0]?.depth ?? 0)
  );
}

const MOOD: Readonly<Record<NonNullable<MoveVerdict["tier"]>, RookMood>> = {
  best: "happy",
  missed: "warm",
  worse: "cool",
  costly: "cool",
};

export function NextMoveScreen({
  createEngine,
  onClose,
  closeLabel = "Back to Play",
  initialFen = DEFAULT_POSITION,
  initialOrientation = "white",
}: {
  // A dedicated engine for this screen, disposed when it closes.
  readonly createEngine: () => AnalysisEngine;
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly initialFen?: string;
  readonly initialOrientation?: PlayerColor;
}) {
  const [root, setRoot] = useState(initialFen);
  const [path, setPath] = useState<readonly Step[]>([]);
  const [cursor, setCursor] = useState(0);
  const [orientation, setOrientation] =
    useState<PlayerColor>(initialOrientation);
  const [selected, setSelected] = useState<Square>();
  const [promotion, setPromotion] = useState<{
    readonly from: Square;
    readonly to: Square;
  }>();
  const [played, setPlayed] = useState<Played>();
  const [target, setTarget] = useState(START_DEPTH);
  // The deepest analysis seen for each position, kept for the whole visit so
  // stepping back is instant and a played move can be judged.
  const [analyses, setAnalyses] = useState<
    ReadonlyMap<string, PositionAnalysis>
  >(new Map());
  const [ended, setEnded] = useState<Ended>();
  const [expanded, setExpanded] = useState<number>();
  const [sheet, setSheet] = useState(false);
  const [setup, setSetup] = useState(false);
  const [fenText, setFenText] = useState("");
  const [copied, setCopied] = useState(false);
  const engine = useRef<AnalysisEngine>(undefined);
  const known = useRef(new Map<string, PositionAnalysis>());
  const stop = useRef<() => void>(undefined);

  useEffect(() => {
    const created = createEngine();
    engine.current = created;
    return () => {
      engine.current = undefined;
      created.dispose();
    };
  }, [createEngine]);

  const fen = cursor === 0 ? root : (path[cursor - 1]?.fen ?? root);
  const over = useMemo(() => gameOver(fen), [fen]);

  useEffect(() => {
    const searcher = engine.current;
    if (over !== undefined || searcher === undefined) return;
    if ((known.current.get(fen)?.candidates[0]?.depth ?? 0) >= target) return;
    const controller = new AbortController();
    const remember = (update: PositionAnalysis) => {
      if (!deeper(known.current.get(fen), update)) return;
      known.current.set(fen, update);
      setAnalyses(new Map(known.current));
    };
    stop.current = () => {
      controller.abort();
      setEnded({ fen, target, kind: "stopped" });
    };
    void searcher
      .analyze({
        fen,
        depth: target,
        multiPv: LINES,
        timeBudgetMs: SEARCH_BUDGET_MS,
        signal: controller.signal,
        onProgress: (update) => {
          if (!controller.signal.aborted) remember(update);
        },
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok) remember(result.value);
        setEnded({
          fen,
          target,
          kind: result.ok
            ? "done"
            : known.current.has(fen)
              ? "stopped"
              : "failed",
        });
      });
    return () => {
      controller.abort();
      stop.current = undefined;
    };
  }, [fen, target, over]);

  const shown = analyses.get(fen);
  const lines: readonly EngineLine[] = useMemo(
    () => (shown ? engineLines(fen, shown) : []),
    [fen, shown],
  );
  const best = lines[0];
  const depth = shown?.candidates[0]?.depth ?? 0;
  const ending =
    ended?.fen === fen && ended.target === target ? ended.kind : undefined;
  const finished = ending === "done" || depth >= target;
  const failed = ending === "failed";
  const searching = over === undefined && ending === undefined && !finished;
  const turn = new Chess(fen).turn();

  // Rook's line on the last move played on the board, once the search after
  // it has finished (or at once after mate or stalemate).
  const verdict =
    played?.toFen === fen && (finished || over !== undefined)
      ? moveVerdict({
          fen: played.fromFen,
          playedUci: played.uci,
          before: analyses.get(played.fromFen),
          after: over === undefined ? shown : undefined,
        })
      : undefined;

  function goTo(nextRoot: string) {
    setRoot(nextRoot);
    setPath([]);
    setCursor(0);
    setPlayed(undefined);
    setSelected(undefined);
    setTarget(START_DEPTH);
    setExpanded(undefined);
  }

  function playMove(uci: string) {
    const next = applyUci(fen, uci);
    if (next === undefined) return;
    setPath([...path.slice(0, cursor), { uci, fen: next }]);
    setCursor(cursor + 1);
    setPlayed({ fromFen: fen, uci, toFen: next });
    setSelected(undefined);
    setTarget(START_DEPTH);
    setExpanded(undefined);
  }

  function playLine(line: EngineLine, upTo: number) {
    const steps = line.moves
      .slice(0, upTo + 1)
      .map(({ uci, fen: after }) => ({ uci, fen: after }));
    setPath([...path.slice(0, cursor), ...steps]);
    setCursor(cursor + steps.length);
    setPlayed(undefined);
    setSelected(undefined);
    setTarget(START_DEPTH);
    setExpanded(undefined);
  }

  function step(to: number) {
    setCursor(Math.max(0, Math.min(path.length, to)));
    setPlayed(undefined);
    setSelected(undefined);
    setTarget(START_DEPTH);
  }

  function selectSquare(target: Square) {
    if (over !== undefined) return;
    if (selected && legalTargets(fen, selected).includes(target)) {
      const piece = new Chess(fen).get(selected);
      if (
        piece?.type === "p" &&
        (target.endsWith("8") || target.endsWith("1"))
      ) {
        setPromotion({ from: selected, to: target });
        return;
      }
      playMove(`${selected}${target}`);
      return;
    }
    const piece = new Chess(fen).get(target);
    setSelected(piece?.color === turn ? target : undefined);
  }

  const switched = useMemo(() => {
    const parts = fen.split(" ");
    parts[1] = turn === "w" ? "b" : "w";
    parts[3] = "-";
    return checkFen(parts.join(" "));
  }, [fen, turn]);

  const arrows: BoardArrow[] = lines.flatMap(({ rank, moves }) => {
    const first = moves[0];
    const from = first && square(first.uci.slice(0, 2));
    const to = first && square(first.uci.slice(2, 4));
    return from && to
      ? [{ from, to, kind: rank === 1 ? "engine-best" : "engine-line" }]
      : [];
  });
  const badges: BoardBadge[] = [];
  for (const { rank, moves } of lines) {
    const to = moves[0] && square(moves[0].uci.slice(2, 4));
    if (to && !badges.some((badge) => badge.square === to))
      badges.push({
        square: to,
        text: String(rank),
        tone: rank === 1 ? "brass" : "jade",
        label: `Engine move ${String(rank)}`,
      });
  }

  const fenCheck = fenText.trim() === "" ? undefined : checkFen(fenText);
  // The shared Stockfish bar, always vertical beside the board.
  const balance: BarReading =
    over !== undefined
      ? barReading(terminalAssessment(new Chess(fen)) ?? { kind: "draw" })
      : best
        ? barReading({ kind: "estimate", whiteCentipawns: best.cpForWhite })
        : CHECKING;

  const mood: RookMood = searching
    ? "think"
    : verdict?.tier
      ? MOOD[verdict.tier]
      : "idle";

  if (setup)
    return (
      <PieceSetup
        initialFen={fen}
        onCancel={() => {
          setSetup(false);
        }}
        onDone={(next) => {
          setSetup(false);
          goTo(next);
        }}
      />
    );

  return (
    <div className="next-move">
      <div className="next-move__top">
        <button
          type="button"
          className="next-move__close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <span aria-hidden="true">✕</span>
        </button>
        <h1 className="next-move__title">Next move</h1>
        <button
          type="button"
          className={`next-move__side next-move__side--${turn}`}
          disabled={!switched.ok}
          aria-label={`${turn === "w" ? "White" : "Black"} to move. Switch side to move.`}
          onClick={() => {
            if (switched.ok) goTo(switched.value);
          }}
        >
          <i aria-hidden="true" />
          {turn === "w" ? "White" : "Black"}
        </button>
        <Pill
          className="next-move__flip"
          aria-label="Flip board"
          onClick={() => {
            setOrientation(orientation === "white" ? "black" : "white");
          }}
        >
          <span aria-hidden="true">⇅</span>
        </Pill>
      </div>

      <div className="next-move__board-column">
        <ChessBoard
          className="next-move__board"
          fen={fen}
          label="Next move board"
          orientation={orientation}
          animateMove
          lastMoveUci={cursor > 0 ? path[cursor - 1]?.uci : null}
          selectedSquare={selected ?? null}
          legalTargets={selected ? legalTargets(fen, selected) : []}
          onSquareSelect={selectSquare}
          balance={balance}
          extraArrows={arrows}
          badges={badges}
          overlay={
            promotion && (
              <div
                className="next-move__promotion"
                role="group"
                aria-label="Promote to"
              >
                {PROMOTIONS.map((piece) => (
                  <button
                    key={piece}
                    type="button"
                    aria-label={`Promote to ${PROMOTION_NAME[piece]}`}
                    onClick={() => {
                      setPromotion(undefined);
                      playMove(`${promotion.from}${promotion.to}${piece}`);
                    }}
                  >
                    <span
                      className={`next-move__glyph next-move__glyph--${turn}`}
                      aria-hidden="true"
                    >
                      {pieceSymbols.b[piece]}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="next-move__promotion-cancel"
                  aria-label="Cancel promotion"
                  onClick={() => {
                    setPromotion(undefined);
                    setSelected(undefined);
                  }}
                >
                  ✕
                </button>
              </div>
            )
          }
        />

        <div className="next-move__controls">
          <Pill
            onClick={() => {
              step(0);
            }}
            disabled={cursor === 0}
          >
            ↺ Reset
          </Pill>
          <Pill
            aria-label="Back one move"
            disabled={cursor === 0}
            onClick={() => {
              step(cursor - 1);
            }}
          >
            ‹
          </Pill>
          <Pill
            aria-label="Forward one move"
            disabled={cursor >= path.length}
            onClick={() => {
              step(cursor + 1);
            }}
          >
            ›
          </Pill>
          <Pill
            className="next-move__set"
            onClick={() => {
              setFenText("");
              setCopied(false);
              setSheet(true);
            }}
          >
            Set position
          </Pill>
        </div>
      </div>

      <div className="next-move__panel">
        <section
          className={`next-move__best${searching ? " next-move__best--thinking" : ""}`}
          aria-live="polite"
          aria-label="Best move"
        >
          <span className="next-move__best-label">
            {over ? "GAME OVER" : searching ? "THINKING" : "BEST MOVE"}
          </span>
          <strong className="next-move__best-move">
            {over ?? best?.moves[0]?.san ?? (failed ? "—" : "…")}
            {searching && best && <small> so far</small>}
          </strong>
          {best && !over && (
            <span
              className={`next-move__eval${best.cpForWhite < 0 ? " next-move__eval--black" : ""}`}
            >
              {best.label}
            </span>
          )}
        </section>
        <div className="next-move__rook">
          <RookCharacter mood={mood} />
          <RookBubble tone={verdict || searching ? "default" : "muted"}>
            {searching && played?.toFen === fen
              ? "Looking…"
              : verdict
                ? verdict.caption
                : failed
                  ? "Stockfish couldn't look at this position. Try Go deeper."
                  : "Play a move and I'll tell you what it does."}
          </RookBubble>
        </div>
        {verdict && !searching && (
          <p
            className={`next-move__verdict next-move__verdict--${verdict.tier ?? "unknown"}`}
          >
            {verdict.chip}
          </p>
        )}

        {!over && (
          <div className="next-move__depth">
            <div className="next-move__meter">
              <span>
                Depth {depth}
                {searching ? ` of ${String(target)}` : ""}
              </span>
              <div className="next-move__meter-track">
                <i
                  style={{
                    width: `${String(Math.min(1, depth / target) * 100)}%`,
                  }}
                />
              </div>
            </div>
            {searching ? (
              <Pill
                onClick={() => {
                  stop.current?.();
                }}
              >
                Stop
              </Pill>
            ) : (
              <Pill
                disabled={target >= MAX_DEPTH}
                onClick={() => {
                  setTarget(
                    Math.min(MAX_DEPTH, Math.max(target, depth) + DEEPER_BY),
                  );
                }}
              >
                Go deeper
              </Pill>
            )}
          </div>
        )}

        <ol className="next-move__lines" aria-label="Stockfish lines">
          {lines.map((line) => {
            const open = expanded === line.rank;
            return (
              <li
                key={line.rank}
                className={`next-move__line${line.rank === 1 ? " next-move__line--best" : ""}${open ? " next-move__line--open" : ""}`}
              >
                <span className="next-move__rank" aria-hidden="true">
                  {line.rank}
                </span>
                <span
                  className={`next-move__eval next-move__eval--small${line.cpForWhite < 0 ? " next-move__eval--black" : ""}`}
                >
                  {line.label}
                </span>
                <span className="next-move__moves">
                  {line.moves.map((move, index) => (
                    <button
                      key={`${String(index)}:${move.uci}`}
                      type="button"
                      className={`next-move__move next-move__move--${move.color}`}
                      aria-label={`Play line ${String(line.rank)} up to ${move.san}`}
                      onClick={() => {
                        playLine(line, index);
                      }}
                    >
                      {move.san}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  className="next-move__expand"
                  aria-expanded={open}
                  aria-label={`${open ? "Hide" : "Show"} all of line ${String(line.rank)}`}
                  onClick={() => {
                    setExpanded(open ? undefined : line.rank);
                  }}
                >
                  <span aria-hidden="true">⌄</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="next-move__fen">
          <code>{fen}</code>
        </div>
      </div>

      <Sheet
        open={sheet}
        tone="calm"
        title="Set position"
        className="next-move-sheet"
        onClose={() => {
          setSheet(false);
        }}
      >
        <label className="next-move-sheet__label" htmlFor="next-move-fen">
          Paste a FEN
        </label>
        <textarea
          id="next-move-fen"
          className={`next-move-sheet__fen${fenCheck && !fenCheck.ok ? " next-move-sheet__fen--error" : ""}`}
          value={fenText}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={fenCheck !== undefined && !fenCheck.ok}
          aria-describedby="next-move-fen-error"
          placeholder={DEFAULT_POSITION}
          onChange={(event) => {
            setFenText(event.target.value);
          }}
        />
        <p
          className="next-move-sheet__error"
          id="next-move-fen-error"
          aria-live="polite"
        >
          {fenCheck && !fenCheck.ok
            ? `${fenCheck.error} Check the FEN and paste it again.`
            : ""}
        </p>
        <Button
          wide
          disabled={!fenCheck?.ok}
          onClick={() => {
            if (!fenCheck?.ok) return;
            setSheet(false);
            goTo(fenCheck.value);
          }}
        >
          Analyse this position
        </Button>
        <div className="next-move-sheet__row">
          <Button
            variant="ghost"
            onClick={() => {
              setSheet(false);
              setSetup(true);
            }}
          >
            Set up pieces
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSheet(false);
              goTo(DEFAULT_POSITION);
            }}
          >
            Start position
          </Button>
        </div>
        <Button
          variant="ghost"
          wide
          onClick={() => {
            void navigator.clipboard.writeText(fen).then(
              () => {
                setCopied(true);
              },
              () => {
                setCopied(false);
              },
            );
          }}
        >
          {copied ? "Copied ✓" : "Copy current FEN"}
        </Button>
      </Sheet>
    </div>
  );
}
