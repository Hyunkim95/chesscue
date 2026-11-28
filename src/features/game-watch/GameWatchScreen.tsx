import { SQUARES } from "chess.js";
import { useEffect, useMemo, useState } from "react";

import { buildGameReplay } from "../../domain/analysis/replay-game";
import type { BoardArrow } from "../../domain/analysis/board-move-cues";
import { barReading } from "../../domain/game/eval-bar";
import type { GameRecord } from "../../domain/game/types";
import {
  watchCaption,
  watchStop,
  type WatchMarker,
} from "../../domain/session/game-watch";
import { LoadingText } from "../../shared/loading/LoadingState";
import { RookBubble, RookSays } from "../../shared/rook/RookBubble";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import { Button, Pill, StatRow, StatTile } from "../../shared/ui/primitives";
import { ChessBoard } from "../board/ChessBoard";
import "./game-watch.css";

// What the game's checks have found so far.
export type WatchMarkers =
  | { readonly kind: "checking" }
  | { readonly kind: "ready"; readonly markers: readonly WatchMarker[] }
  | { readonly kind: "failed" };

export type WatchEvaluations =
  | {
      readonly kind: "checking";
      readonly completed: number;
      readonly total: number;
    }
  | { readonly kind: "ready"; readonly evaluations: readonly number[] }
  | { readonly kind: "failed" };

// Where to pick the replay up again: at the moment last tried, or paused on
// the move last analyzed.
export interface WatchResume {
  readonly kind: "marker" | "paused";
  readonly ply: number;
}

type Playback =
  | { readonly kind: "playing"; readonly ply: number }
  | { readonly kind: "paused"; readonly ply: number }
  // At a marker, on the position before the player's move.
  | { readonly kind: "stopped"; readonly marker: WatchMarker }
  // The end of the game is the report.
  | { readonly kind: "ended" };

const STEP_MS = 1_000;

const square = (name: string) => SQUARES.find((entry) => entry === name);

function playedArrow(uci: string): BoardArrow[] {
  const from = square(uci.slice(0, 2));
  const to = square(uci.slice(2, 4));
  return from && to ? [{ from, to, kind: "ghost-missed" }] : [];
}

export function GameWatchScreen({
  game,
  title,
  subtitle,
  opponent,
  markers,
  evaluations,
  resume,
  onTry,
  onAnalyze,
}: {
  readonly game: GameRecord;
  // "You beat Ahmed".
  readonly title: string;
  readonly subtitle: string;
  readonly opponent: string | undefined;
  readonly markers: WatchMarkers;
  readonly evaluations: WatchEvaluations;
  readonly resume?: WatchResume | undefined;
  readonly onTry: (ply: number) => void;
  // Opens the next-move tool on the position shown.
  readonly onAnalyze?: (fen: string, ply: number) => void;
}) {
  const replay = useMemo(() => buildGameReplay(game), [game]);
  const total = game.moves.length;
  const found = useMemo(
    () => (markers.kind === "ready" ? markers.markers : []),
    [markers],
  );
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [passed, setPassed] = useState<ReadonlySet<number>>(() => new Set());
  const [playback, setPlayback] = useState<Playback>(() => {
    if (resume === undefined) return { kind: "playing", ply: 0 };
    const marker =
      resume.kind === "marker"
        ? found.find(({ ply }) => ply === resume.ply)
        : undefined;
    if (marker) return { kind: "stopped", marker };
    return {
      kind: "paused",
      ply: Math.max(0, resume.kind === "marker" ? resume.ply - 1 : resume.ply),
    };
  });

  // The marker whose position comes right after `ply`, if not yet seen.
  const stopAfter = (ply: number, seen: ReadonlySet<number>) =>
    found.find((marker) => marker.ply - 1 === ply && !seen.has(marker.ply));

  useEffect(() => {
    if (playback.kind !== "playing") return;
    const timer = window.setTimeout(() => {
      const next = playback.ply + 1;
      if (next > total) {
        setPlayback({ kind: "ended" });
        return;
      }
      const marker = found.find(
        (entry) => entry.ply - 1 === next && !passed.has(entry.ply),
      );
      setPlayback(
        marker ? { kind: "stopped", marker } : { kind: "playing", ply: next },
      );
    }, STEP_MS / speed);
    return () => {
      window.clearTimeout(timer);
    };
  }, [playback, speed, passed, found, total]);

  if (!replay.ok) return <p role="alert">{replay.message}</p>;

  const ply =
    playback.kind === "ended"
      ? total
      : playback.kind === "stopped"
        ? playback.marker.ply - 1
        : playback.ply;
  const frame = replay.frames[ply];
  const wins = found.filter(({ kind }) => kind === "win");
  const misses = found.filter(({ kind }) => kind === "miss");
  const counts =
    markers.kind === "ready"
      ? `★ ${String(wins.length)} · ${String(misses.length)} missed`
      : markers.kind === "checking"
        ? "Finding your moments…"
        : "Moments unavailable";

  function stopAt(marker: WatchMarker) {
    setPlayback({ kind: "stopped", marker });
  }
  function keepWatching(marker: WatchMarker) {
    setPassed((seen) => new Set([...seen, marker.ply]));
    setPlayback({ kind: "playing", ply: marker.ply - 1 });
  }
  function restart() {
    setPassed(new Set());
    const marker = stopAfter(0, new Set());
    setPlayback(
      marker ? { kind: "stopped", marker } : { kind: "playing", ply: 0 },
    );
  }
  const nextMarker = found.find((marker) => marker.ply - 1 > ply);

  const timeline = (
    <Timeline
      total={total}
      ply={ply}
      markers={found}
      evaluations={evaluations}
      onMarker={stopAt}
    />
  );

  if (playback.kind === "ended")
    return (
      <div className="game-watch game-watch--report">
        <h1 className="game-watch__result">
          {title}
          <small>{subtitle}</small>
        </h1>
        {timeline}
        <StatRow>
          <StatTile value={`★ ${String(wins.length)}`} label="taken" />
          <StatTile value={misses.length} label="missed" />
          <StatTile value={Math.ceil(total / 2)} label="moves" />
        </StatRow>
        <section aria-labelledby="game-watch-moments">
          <h2 id="game-watch-moments" className="game-watch__label">
            Your moments
          </h2>
          {markers.kind === "checking" ? (
            <p role="status">
              <LoadingText>Rook is still checking this game</LoadingText>
            </p>
          ) : found.length === 0 ? (
            <p className="game-watch__quiet">
              {markers.kind === "failed"
                ? "Rook couldn't check this game. Open it again to retry."
                : "Nothing here needed a second look."}
            </p>
          ) : (
            <ol className="game-watch__moments">
              {found.map((marker) => (
                <li key={marker.ply}>
                  <button
                    type="button"
                    onClick={() => {
                      onTry(marker.ply);
                    }}
                  >
                    <span
                      className={`game-watch__dot game-watch__dot--${marker.kind}`}
                      aria-hidden="true"
                    >
                      {marker.kind === "win" ? "★" : ""}
                    </span>
                    <span className="game-watch__moment">
                      {marker.moveLabel} · {marker.san}
                      <small>
                        {marker.kind === "win"
                          ? "A chance you took"
                          : "Something stronger was here"}
                      </small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
        <Button wide onClick={restart}>
          Watch again
        </Button>
      </div>
    );

  const stopped = playback.kind === "stopped" ? playback.marker : undefined;
  const played = game.moves.find((move) => move.ply === ply);
  const evaluation =
    evaluations.kind === "ready" ? evaluations.evaluations[ply] : undefined;
  // The side that made the move shown: the side to move before it.
  const mover = replay.frames[ply - 1]?.fen.split(" ")[1];
  const caption = stopped
    ? watchStop({
        marker: stopped,
        previousSan: frame?.lastMoveSan ?? undefined,
        opponent,
      })
    : played
      ? watchCaption({
          san: played.san,
          byPlayer: (mover === "w") === (game.playerColor === "white"),
          opponent,
        })
      : "Here's how the game went.";

  return (
    <div className="game-watch board-split">
      <div className="board-split__main">
        <h1 className="game-watch__title">
          {title}
          <small>
            {stopped
              ? `${stopped.moveLabel} · ${game.playerColor === "black" ? "Black" : "White"} to move`
              : subtitle}
          </small>
        </h1>
        <ChessBoard
          fen={frame?.fen}
          label={`${title}, after ${String(ply)} moves`}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={frame?.lastMoveUci}
          animateMove
          extraArrows={
            stopped?.kind === "miss"
              ? playedArrow(
                  game.moves.find((move) => move.ply === stopped.ply)?.uci ??
                    "",
                )
              : []
          }
          previewTag={
            stopped?.kind === "miss" ? `You played ${stopped.san}` : undefined
          }
          balance={
            evaluation === undefined
              ? "reserved"
              : barReading({ kind: "estimate", whiteCentipawns: evaluation })
          }
        />
      </div>
      <div className="board-split__aside">
        {timeline}
        <div className="game-watch__caption">
          <span>
            {ply === 0 ? "Start" : `Move ${String(Math.ceil(ply / 2))}`}
          </span>
          <span>{counts}</span>
        </div>
        <RookSays>
          <RookCharacter
            mood={stopped ? (stopped.kind === "win" ? "warm" : "hmm") : "idle"}
          />
          <RookBubble>{caption}</RookBubble>
        </RookSays>
        {stopped ? (
          <div
            className="game-watch__choices"
            role="group"
            aria-label="This moment"
          >
            <Button
              onClick={() => {
                onTry(stopped.ply);
              }}
            >
              Try it
            </Button>
            <Pill
              onClick={() => {
                keepWatching(stopped);
              }}
            >
              Keep watching
            </Pill>
          </div>
        ) : (
          <div
            className="game-watch__controls"
            role="group"
            aria-label="Playback"
          >
            <Pill aria-label="Watch from the start" onClick={restart}>
              ⏮
            </Pill>
            <Pill
              aria-label={playback.kind === "playing" ? "Pause" : "Play"}
              onClick={() => {
                setPlayback(
                  playback.kind === "playing"
                    ? { kind: "paused", ply }
                    : { kind: "playing", ply },
                );
              }}
            >
              {playback.kind === "playing" ? "⏸" : "▶"}
            </Pill>
            <Pill
              aria-label={`Speed ${String(speed)}×`}
              onClick={() => {
                setSpeed(speed === 1 ? 2 : 1);
              }}
            >
              {speed}×
            </Pill>
            <Pill
              disabled={nextMarker === undefined}
              onClick={() => {
                if (nextMarker) stopAt(nextMarker);
                else setPlayback({ kind: "ended" });
              }}
            >
              ⏭ Next moment
            </Pill>
          </div>
        )}
        {playback.kind === "paused" && frame && onAnalyze && (
          <Button
            variant="ghost"
            onClick={() => {
              onAnalyze(frame.fen, ply);
            }}
          >
            Analyze this position
          </Button>
        )}
      </div>
    </div>
  );
}

// The game's evaluation line, the report's graph, with the moments on it.
function Timeline({
  total,
  ply,
  markers,
  evaluations,
  onMarker,
}: {
  readonly total: number;
  readonly ply: number;
  readonly markers: readonly WatchMarker[];
  readonly evaluations: WatchEvaluations;
  readonly onMarker: (marker: WatchMarker) => void;
}) {
  const at = (index: number) => (index / Math.max(1, total)) * 100;
  // White's advantage is up, capped at three pawns either way.
  const y = (cp: number) => 23 - (Math.max(-600, Math.min(600, cp)) / 600) * 19;
  const points =
    evaluations.kind === "ready"
      ? evaluations.evaluations
          .map((cp, index) => `${String(at(index) * 2.8)},${String(y(cp))}`)
          .join(" ")
      : undefined;
  return (
    <div className="game-watch__timeline">
      <svg
        viewBox="0 0 280 46"
        preserveAspectRatio="none"
        role="img"
        aria-label={
          evaluations.kind === "ready"
            ? "Stockfish's evaluation through the game. White's advantage is above the line."
            : evaluations.kind === "checking"
              ? `Stockfish is checking the game: ${String(evaluations.completed)} of ${String(evaluations.total)} positions.`
              : "The evaluation is unavailable."
        }
      >
        <line className="game-watch__axis" x1="0" x2="280" y1="23" y2="23" />
        {points && (
          <>
            <polygon
              className="game-watch__area"
              points={`0,23 ${points} 280,23`}
            />
            <polyline className="game-watch__line" points={points} />
          </>
        )}
      </svg>
      <span
        className="game-watch__head"
        style={{ left: `${String(at(ply))}%` }}
        aria-hidden="true"
      />
      {markers.map((marker) => (
        <button
          key={marker.ply}
          type="button"
          className={`game-watch__marker game-watch__marker--${marker.kind}`}
          style={{ left: `${String(at(marker.ply - 1))}%` }}
          aria-label={`${marker.moveLabel}: ${marker.kind === "win" ? "a chance you took" : "a chance you missed"}`}
          onClick={() => {
            onMarker(marker);
          }}
        >
          <span aria-hidden="true">{marker.kind === "win" ? "★" : ""}</span>
        </button>
      ))}
    </div>
  );
}
