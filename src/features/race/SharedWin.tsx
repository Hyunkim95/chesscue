import { LoadingState } from "../../shared/loading/LoadingState";
import { BusyButton } from "../../shared/ui/primitives";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { ChessBoard } from "../board/ChessBoard";
import { goalLabel, type SharedWin } from "../../domain/race/elo-race";
import {
  buildGameReplay,
  buildVariationFrames,
} from "../../domain/analysis/replay-game";
import type { GameRecord } from "../../domain/game/types";
import type { AccountSession } from "../../infrastructure/firebase/account-session";
import { useRaceLinks } from "./use-race-links";
import { CopyLink } from "./RaceView";

export function ShareWin({
  game,
  session,
  uid,
}: {
  game: GameRecord;
  session: AccountSession | null;
  uid: string | null;
}) {
  const { links } = useRaceLinks(session, uid);
  const ownMoves = useMemo(() => {
    const replay = buildGameReplay(game);
    if (
      !replay.ok ||
      !game.playerColor ||
      game.result !== game.playerColor + "-win"
    )
      return [];
    const playerStarts =
      new Chess(game.initialFen).turn() ===
      (game.playerColor === "white" ? "w" : "b");
    return game.moves.filter((_, i) => (i % 2 === 0) === playerStarts);
  }, [game]);
  const [ply, setPly] = useState(ownMoves.at(-1)?.ply ?? 1);
  const [race, setRace] = useState("");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!ownMoves.length) return null;
  return (
    <details className="share-win">
      <summary>Share this win</summary>
      <label>
        Position to share
        <select
          value={ply}
          onChange={(e) => {
            setPly(Number(e.target.value));
            setUrl("");
          }}
        >
          {ownMoves.map((m) => (
            <option key={m.ply} value={m.ply}>
              Move {Math.ceil(m.ply / 2)} · {m.san}
            </option>
          ))}
        </select>
      </label>
      {!!links.length && (
        <label>
          Include race
          <select
            value={race}
            onChange={(e) => {
              setRace(e.target.value);
              setUrl("");
            }}
          >
            <option value="">Just this win</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>
                {goalLabel(l.goal)}
              </option>
            ))}
          </select>
        </label>
      )}
      <BusyButton
        className="review-action"
        busy={busy}
        onClick={() => {
          setBusy(true);
          setMessage("");
          void (async () => {
            if (session && uid) {
              const id = await session.races.share(game.id, ply, race || null);
              setUrl(location.origin + location.pathname + "#win/" + id);
            } else {
              const index = ply - 1;
              const fen = game.moves[index - 1]?.fenAfter ?? game.initialFen;
              const line = game.moves.slice(index).map((m) => m.uci);
              const replay = buildVariationFrames(fen, line);
              const final = replay.ok ? replay.frames.at(-1) : null;
              if (
                !final ||
                !new Chess(final.fen).isCheckmate() ||
                line.length > 128
              )
                throw new Error(
                  "Select a position within 128 plies of checkmate to share this guest win.",
                );
              setUrl(
                location.origin +
                  location.pathname +
                  "#mate/" +
                  encodeURIComponent(JSON.stringify({ fen, line })),
              );
            }
          })()
            .catch((e: unknown) => {
              setMessage(
                e instanceof Error ? e.message : "Could not share this win.",
              );
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        Create win link
      </BusyButton>
      {url && <CopyLink label="Shared win link" url={url} />}{" "}
      {message && <p role="alert">{message}</p>}
    </details>
  );
}

function guestMate(encoded: string): SharedWin {
  if (encoded.length > 6000) throw new Error("Invalid link");
  const { fen, line } = z
    .object({
      fen: z.string().max(120),
      line: z
        .array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/))
        .min(1)
        .max(128),
    })
    .parse(JSON.parse(decodeURIComponent(encoded)));
  const replay = buildVariationFrames(fen, line);
  const final = replay.ok ? replay.frames.at(-1) : null;
  const side = new Chess(fen).turn();
  if (
    !final ||
    !new Chess(final.fen).isCheckmate() ||
    new Chess(final.fen).turn() === side
  )
    throw new Error("Invalid finish");
  return {
    fen,
    line,
    side: side === "w" ? "white" : "black",
    race: null,
    elo: null,
    raceElo: null,
    target: null,
    name: "A ChessCue player",
  };
}
export function SharedWinView({
  id,
  guest,
  session,
  unavailable,
  onPlay,
}: {
  id: string;
  guest: boolean;
  unavailable: boolean;
  session: AccountSession | null;
  onPlay: () => void;
}) {
  const [win, setWin] = useState<SharedWin | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    if (guest || session) {
      void Promise.resolve()
        .then(() => (guest ? guestMate(id) : session?.races.win(id)))
        .then((w) => {
          if (!w || !buildVariationFrames(w.fen, w.line).ok)
            throw new Error("Invalid line");
          if (live) setWin(w);
        })
        .catch(() => {
          if (live) setError(true);
        });
    }
    return () => {
      live = false;
    };
  }, [id, guest, session]);
  return (
    <main className="content-shell race-view">
      <h1>Shared win</h1>
      {win ? (
        <WinPosition win={win} />
      ) : error || unavailable ? (
        <p>This win link is unavailable.</p>
      ) : (
        <LoadingState>Loading the position…</LoadingState>
      )}
      <button className="primary-link" onClick={onPlay}>
        Play your own game
      </button>{" "}
      {win?.race && <a href={"#race/" + win.race}>View race invitation</a>}
    </main>
  );
}
function WinPosition({ win }: { win: SharedWin }) {
  const [fen, setFen] = useState(win.fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [feedback, setFeedback] = useState("");
  const [step, setStep] = useState(0);
  const board = new Chess(fen);
  const targets = selected
    ? board.moves({ square: selected, verbose: true }).map((m) => m.to)
    : [];
  const replay = buildVariationFrames(win.fen, win.line);
  return (
    <>
      <p>
        {win.name} won as {win.side}.
        {win.elo === null ? "" : " " + win.elo.toString() + " Elo"}
        {win.target === null
          ? win.raceElo === null
            ? ""
            : ` · Race best ${win.raceElo.toString()} Elo when shared`
          : " · Race goal " +
            win.target.toString() +
            (win.raceElo === null
              ? ""
              : " · " + win.raceElo.toString() + " Elo when shared")}
      </p>
      <p>Try a move, then see how the game continued.</p>
      <ChessBoard
        label="Shared win position"
        orientation={win.side}
        fen={fen}
        selectedSquare={selected}
        legalTargets={targets}
        onSquareSelect={(sq) => {
          if (selected && targets.includes(sq)) {
            board.move({ from: selected, to: sq, promotion: "q" });
            setFen(board.fen());
            setFeedback("Your move: " + (board.history().at(-1) ?? ""));
            setSelected(null);
          } else setSelected(board.get(sq)?.color === board.turn() ? sq : null);
        }}
      />
      <p aria-live="polite">{feedback}</p>
      <button
        className="review-action"
        disabled={!replay.ok || step >= win.line.length}
        onClick={() => {
          const frame = replay.ok ? replay.frames[step + 1] : null;
          if (frame) {
            setFen(frame.fen);
            setStep(step + 1);
            setSelected(null);
            setFeedback("Played: " + (frame.lastMoveSan ?? ""));
          }
        }}
      >
        {step ? "Next recorded move" : "Reveal played move"}
      </button>{" "}
      <button
        className="review-action"
        onClick={() => {
          setStep(0);
          setFen(win.fen);
          setSelected(null);
          setFeedback("");
        }}
      >
        Reset position
      </button>
    </>
  );
}
