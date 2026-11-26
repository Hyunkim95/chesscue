import { starterPack } from "../../domain/material/pack";
import { fenSchema } from "./study-history";
import { z } from "zod";
import { useEntryState } from "../../shared/navigation/history-entry";
import {
  RookMessage,
  RookChatHeader,
  RookComposer,
} from "../../shared/rook/RookMessage";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Chess, type Square, type PieceSymbol } from "chess.js";
import { moveNotation } from "../../domain/study/historical-game";
import { ChessBoard } from "../board/ChessBoard";
import { analyzeReviewReply } from "../../application/analyze-game/analyze-review-reply";
import { StockfishAnalysisEngine } from "../../infrastructure/engine/stockfish-analysis-engine";
import { detectOnDeviceCapability } from "../../infrastructure/ai/on-device-capability";
import type { StudyAI } from "../../infrastructure/ai/study-gemini";
import type { PlayerColor } from "../../domain/game/types";
import type { StudyLesson } from "../../domain/study/roadmap";
import {
  boardFacts,
  editPosition,
  localIntent,
  type StudyTurn,
  type StudyIntent,
} from "../../domain/study/position";

type NanoState =
  | "checking"
  | "unavailable"
  | "downloadable"
  | "preparing"
  | "ready"
  | "available";
export function PositionChat({
  ai,
  lesson,
  question,
  orientation = "white",
  backLabel = "Back to roadmap",
  sources,
  connection,
  replay = false,
  alternateBoard,
  onBack,
}: {
  ai: StudyAI | null;
  lesson: StudyLesson;
  question: string;
  orientation?: PlayerColor;
  backLabel?: string;
  sources?: ReactNode;
  connection?: ReactNode;
  replay?: boolean;
  alternateBoard?: ReactNode;
  onBack: () => void;
}) {
  const content = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    content.current?.scrollIntoView({ block: "start" });
  }, []);
  const boardKey =
    "board:" + starterPack.runId + ":" + lesson.title + ":" + lesson.fen;
  const [fen, setFen] = useEntryState(boardKey, fenSchema, lesson.fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<Square | null>(null);
  const [trail, setTrail] = useEntryState(
    boardKey + ":undo",
    z.array(fenSchema),
    [],
  );
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<(StudyTurn & { context: string })[]>([]);
  const [nano, setNano] = useState<NanoState>("checking");
  const [download, setDownload] = useState(0);
  const [notice, setNotice] = useState("");
  const [thinking, setThinking] = useState(false);
  const [engineLine, setLine] = useState("");
  const [showGame, setShowGame] = useState(false);
  const live = useRef(true),
    active = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    let current = true;
    void detectOnDeviceCapability().then((result) => {
      if (current)
        setNano(
          result.status === "available"
            ? "available"
            : result.status === "downloadable" ||
                result.status === "downloading"
              ? "downloadable"
              : "unavailable",
        );
    });
    return () => {
      current = false;
      live.current = false;
      active.current?.abort();
    };
  }, []);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [turns]);
  const board = new Chess(fen);
  const line = useMemo(() => {
    if (!replay) return [];
    const recorded = new Chess(lesson.fen);
    return lesson.continuation.map((san) => recorded.move(san));
  }, [lesson.fen, lesson.continuation, replay]);
  const nextRecorded = line.find((move) => move.before === fen);
  const legal = selected
    ? board.moves({ square: selected, verbose: true })
    : [];
  function change(next: string) {
    setTrail((items) => [...items, fen]);
    setFen(next);
    setSelected(null);
    setPromotion(null);
    setLine("");
    setShowGame(false);
  }
  function play(to: Square, piece?: PieceSymbol) {
    if (!selected) return;
    change(
      board.move({ from: selected, to, ...(piece ? { promotion: piece } : {}) })
        .after,
    );
  }
  function choose(s: Square) {
    if (legal.some((m) => m.to === s)) {
      if (legal.some((m) => m.to === s && m.promotion)) setPromotion(s);
      else play(s);
    } else {
      setPromotion(null);
      setSelected(board.get(s)?.color === board.turn() ? s : null);
    }
  }
  async function prepare() {
    if (!ai) return false;
    setNano("preparing");
    setNotice("");
    try {
      await ai.prepare((value) => {
        if (live.current) setDownload(Math.round(value * 100));
      });
      if (live.current) setNano("ready");
      return true;
    } catch {
      if (live.current) {
        setNano("available");
        setNotice(
          "Gemini Nano could not start. Built-in position commands are available.",
        );
      }
      return false;
    }
  }
  async function send() {
    const text = message.trim();
    if (!text || thinking) return;
    const run = new AbortController();
    active.current = run;
    const current = () => !run.signal.aborted;
    setThinking(true);
    setNotice("");
    setMessage("");
    const context =
      fen === lesson.fen
        ? lesson.title
        : `Move ${String(board.moveNumber())} · ${board.turn() === "w" ? "White" : "Black"} to move`;
    setTurns((prev) => [...prev, { speaker: "You", text, context }]);
    const engine = new StockfishAnalysisEngine();
    try {
      const useNano =
        nano === "ready" || (nano === "available" && (await prepare()));
      if (!current()) return;
      const line = await analyzeReviewReply(engine, fen, run.signal);
      if (!current()) return;
      const facts = boardFacts(fen, line, text);
      let intent: StudyIntent,
        speaker: StudyTurn["speaker"] = "Study library";
      if (ai && useNano) {
        try {
          intent = await ai.chat(
            {
              message: text,
              fen,
              facts,
              lesson:
                fen === lesson.fen ? lesson.insight : "Custom study position.",
              history: turns
                .slice(-6)
                .map(({ speaker, text }) => ({ speaker, text })),
            },
            AbortSignal.any([run.signal, AbortSignal.timeout(90000)]),
          );
          speaker = "Gemini Nano";
        } catch {
          intent = localIntent(text, fen, lesson, facts);
          if (current())
            setNotice(
              "Nano could not verify a reply. Using built-in position commands.",
            );
        }
      } else intent = localIntent(text, fen, lesson, facts);
      if (!current()) return;
      let response: string;
      if (intent.action === "answer") {
        response = intent.answer;
        setLine(facts.engineLine.join(" "));
      } else {
        const next =
          intent.action === "setup"
            ? intent.fen
            : editPosition(fen, intent.from, intent.to);
        if (next) {
          change(next);
          if (intent.action === "setup" && intent.verifiedLine) {
            setLine(boardFacts(next, intent.verifiedLine).engineLine.join(" "));
          } else if (/what|why|does|change.*plan|evaluate/i.test(text)) {
            const nextLine = await analyzeReviewReply(engine, next, run.signal);
            if (!current()) return;
            setLine(boardFacts(next, nextLine).engineLine.join(" "));
          }
          response =
            intent.action === "edit"
              ? "Study setup changed from " +
                intent.from +
                " to " +
                intent.to +
                "."
              : "Position set up. Try a move or ask about the plan.";
        } else
          response =
            "That edit would produce an invalid setup or replace an occupied square. Choose an empty destination.";
      }
      setTurns((prev) => [...prev, { speaker, text: response, context }]);
    } catch {
      if (current()) setNotice("The position could not be studied. Try again.");
    } finally {
      engine.dispose();
      if (current()) setThinking(false);
    }
  }
  return (
    <section
      ref={content}
      className="content-shell study-shell"
      aria-label="Lessons and position practice"
    >
      <button className="study-back" onClick={onBack}>
        <span aria-hidden="true">‹ </span>
        {backLabel}
      </button>
      <h2 tabIndex={-1}>
        {fen === lesson.fen || replay ? lesson.title : "Study position"}
      </h2>
      <div className="study-columns study-workbench">
        <section aria-label="Practice position" className="study-board">
          <ChessBoard
            label="Study board"
            orientation={orientation}
            fen={fen}
            onSquareSelect={choose}
            selectedSquare={selected}
            legalTargets={legal.map((m) => m.to)}
            disabled={thinking}
          />
          {promotion && (
            <div className="study-actions">
              Promote to{" "}
              {(["q", "r", "b", "n"] as const).map((p, i) => (
                <button
                  className="review-action"
                  key={p}
                  onClick={() => {
                    play(promotion, p);
                  }}
                >
                  {["Queen", "Rook", "Bishop", "Knight"][i]}
                </button>
              ))}
            </div>
          )}
          <div className="study-actions">
            {nextRecorded && (
              <button
                type="button"
                className="primary-link"
                disabled={thinking}
                onClick={() => {
                  change(nextRecorded.after);
                }}
              >
                Play {moveNotation(nextRecorded)}
              </button>
            )}
            {line.at(-1)?.after === fen && (
              <span role="status">End of recorded line</span>
            )}
            <strong>
              {board.isGameOver()
                ? board.isCheckmate()
                  ? "Checkmate"
                  : "Draw"
                : board.turn() === "w"
                  ? "White to move"
                  : "Black to move"}
            </strong>
            <button
              className="review-action"
              disabled={thinking || trail.length === 0}
              onClick={() => {
                const last = trail.at(-1);
                if (last) {
                  setFen(last);
                  setTrail(trail.slice(0, -1));
                  setSelected(null);
                  setPromotion(null);
                  setLine("");
                  setShowGame(false);
                }
              }}
            >
              Undo
            </button>
            <button
              className="review-action"
              disabled={thinking || fen === lesson.fen}
              onClick={() => {
                change(lesson.fen);
              }}
            >
              Reset position
            </button>
          </div>
          {fen === lesson.fen && (
            <details
              open={showGame}
              onToggle={(e) => {
                setShowGame(e.currentTarget.open);
              }}
            >
              <summary>What happened in the game?</summary>
              <p>{lesson.insight}</p>
              <p>{lesson.continuation.join(" ")}</p>
            </details>
          )}
          {fen !== lesson.fen && alternateBoard}
          {sources}
          {engineLine && (
            <p>
              <strong>Stockfish line</strong> {engineLine}
            </p>
          )}
        </section>
        <div className="study-sidebar">
          {fen === lesson.fen && connection}
          <section className="study-panel study-chat">
            <RookChatHeader
              context={fen === lesson.fen ? lesson.title : "Study position"}
            />
            <div
              ref={transcript}
              className="rook-chat__messages"
              role="log"
              aria-label="Study conversation"
            >
              {turns.length === 0 && (
                <RookMessage>
                  {fen === lesson.fen
                    ? question
                    : "Ask about this position or describe a change to the board."}
                </RookMessage>
              )}
              {turns.map((turn, i) => (
                <RookMessage
                  key={i}
                  player={turn.speaker === "You"}
                  context={turn.context}
                >
                  <p>{turn.text}</p>
                  {turn.speaker !== "You" && (
                    <small className="rook-chat__byline">
                      {turn.speaker === "Study library"
                        ? "Built-in position commands"
                        : turn.speaker}
                    </small>
                  )}
                </RookMessage>
              ))}
            </div>
            <RookComposer
              value={message}
              onChange={setMessage}
              onSend={() => {
                void send();
              }}
              disabled={thinking}
            />
            {thinking && (
              <button
                type="button"
                className="review-action"
                onClick={() => {
                  active.current?.abort();
                  setThinking(false);
                  setNotice("Request cancelled.");
                }}
              >
                Cancel
              </button>
            )}

            {(notice || thinking) && (
              <p role="status">{thinking ? "Rook is thinking…" : notice}</p>
            )}
            <details className="rook-chat__source">
              <summary>Study tools</summary>
              {nano === "ready" ? (
                <p>Gemini Nano · On this device</p>
              ) : (
                <>
                  <p>
                    {nano === "unavailable" || !ai
                      ? "Built-in position commands · Nano unavailable on this device"
                      : nano === "checking"
                        ? "Checking Gemini Nano…"
                        : "Built-in position commands · Gemini Nano can chat on this device"}
                  </p>
                  {ai &&
                    ["available", "downloadable", "preparing"].includes(
                      nano,
                    ) && (
                      <button
                        className="review-action"
                        disabled={nano === "preparing" || thinking}
                        onClick={() => void prepare()}
                      >
                        {nano === "preparing"
                          ? "Preparing Nano · " + String(download) + "%"
                          : nano === "downloadable"
                            ? "Download Gemini Nano"
                            : "Enable Gemini Nano"}
                      </button>
                    )}
                </>
              )}
            </details>
          </section>
        </div>
      </div>
    </section>
  );
}
