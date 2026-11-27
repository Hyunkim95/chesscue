import { isSidePanel } from "../../shared/navigation/side-panel";
import { BoardBack } from "../../shared/navigation/BoardBack";
import { LoadingText } from "../../shared/loading/LoadingState";
import type { AssessPosition } from "../../application/analyze-game/assess-position";
import { starterPack } from "../../domain/material/pack";
import { z } from "zod";
import { useEntryState } from "../../shared/navigation/history-entry";
import { RookMessage } from "../../shared/rook/RookMessage";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
} from "react";
import { Chess, type Square } from "chess.js";
import {
  advanceLessonChallenge,
  buildLessonChallenge,
  startLessonChallenge,
} from "../../domain/study/lesson-challenge";
import type { StudyTopic } from "../../domain/study/roadmap";
import { ChessBoard } from "../board/ChessBoard";
import { NextMovePill } from "../board/BoardHintControls";
import { PromotionPiece } from "../board/PromotionPiece";
import { pieceNames } from "../board/board-pieces";
import type { AnalyzeReply } from "../review/GuidedMoveFeedback";
import { RookExploration } from "../rook/RookExploration";
import "./lesson-challenge.css";

export function LessonChallenge({
  topic,
  lessonIndex,
  onBack,
  onNext,
  analyzeReply,
  assessPosition,
}: {
  topic: StudyTopic;
  lessonIndex: number;
  onBack: () => void;
  onNext: (() => void) | undefined;
  analyzeReply?: AnalyzeReply | undefined;
  assessPosition?: AssessPosition | undefined;
}) {
  const challenge = useMemo(
    () => buildLessonChallenge(topic, lessonIndex),
    [topic, lessonIndex],
  );
  const [actions, setActions] = useEntryState(
    "challenge:" + starterPack.runId + ":" + topic + String(lessonIndex),
    z.array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("attempt"),
          uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
        }),
        z.object({ type: z.literal("reply") }),
        z.object({ type: z.literal("retry") }),
      ]),
    ),
    [],
  );
  const state = useMemo(() => {
    const start = challenge && startLessonChallenge(challenge);
    return challenge && start
      ? actions.reduce(
          (current, action) =>
            advanceLessonChallenge(challenge, current, action),
          start,
        )
      : null;
  }, [challenge, actions]);
  const dispatch = useCallback(
    (action: Parameters<typeof advanceLessonChallenge>[2]) => {
      setActions((current) => [...current, action]);
    },
    [setActions],
  );
  const [rookOpen, setRookOpen] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<Square | null>(null);
  const stage = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    stage.current?.scrollIntoView({ block: "start" });
  }, []);
  useEffect(() => {
    if (state?.status !== "replying") return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "reply" });
    }, 550);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state?.status, state?.ply, dispatch]);
  if (!challenge || !state)
    return (
      <section className="lesson-challenge" aria-label="Lesson challenge">
        <p role="alert">This challenge could not be loaded.</p>
        <BoardBack label="Back to challenges" onBack={onBack} />
      </section>
    );
  if (rookOpen && analyzeReply) {
    return (
      <RookExploration
        fen={
          state.status === "complete"
            ? (challenge.steps[0]?.before ?? state.fen)
            : state.fen
        }
        orientation={challenge.player === "w" ? "white" : "black"}
        analyzeReply={analyzeReply}
        assessPosition={assessPosition}
        topic={challenge.title}
        closeLabel="Back to challenge"
        onClose={() => {
          setRookOpen(false);
        }}
      />
    );
  }
  const board = new Chess(state.fen);
  const legal = selected
    ? board.moves({ square: selected, verbose: true })
    : [];
  const goal =
    challenge.objectives[
      Math.min(Math.floor(state.ply / 2), challenge.objectives.length - 1)
    ];
  function attempt(uci: string) {
    dispatch({ type: "attempt", uci });
    setSelected(null);
    setPromotion(null);
  }
  function choose(square: Square) {
    if (state?.status !== "playing") return;
    const moves = legal.filter((move) => move.to === square);
    if (moves.some((move) => move.promotion)) {
      setPromotion(square);
      return;
    }
    const move = moves[0];
    if (move) attempt(move.lan);
    else {
      setSelected(board.get(square)?.color === board.turn() ? square : null);
      setPromotion(null);
    }
  }
  const complete = state.status === "complete";
  const feedback = complete
    ? "Challenge complete. You found the game’s plan."
    : state.status === "retry"
      ? "Try again. That move is legal. Find the move that follows this lesson’s historical plan."
      : state.status === "replying"
        ? "Good move. Your opponent is replying…"
        : state.opponentMove
          ? "Opponent played " + state.opponentMove + ". Your move."
          : "Your move. Find the game’s plan.";
  const opponent = (
    <div className="lesson-challenge__opponent">
      <span aria-hidden="true">♚</span>
      <span>Opponent · Recorded game</span>
      <span className="lesson-challenge__progress">
        Challenge {lessonIndex + 1} of 3
      </span>
    </div>
  );
  return (
    <section
      ref={stage}
      className="lesson-challenge"
      aria-label="Lesson challenge"
    >
      <BoardBack label="Back to challenges" onBack={onBack} />
      <div className="lesson-challenge__layout">
        <div className="lesson-challenge__board">
          {!isSidePanel && opponent}
          <ChessBoard
            label="Challenge board"
            fen={state.fen}
            orientation={challenge.player === "w" ? "white" : "black"}
            onSquareSelect={choose}
            selectedSquare={selected}
            legalTargets={legal.map((move) => move.to)}
            lastMoveUci={state.lastMove}
            disabled={state.status !== "playing"}
          />
          {promotion && (
            <div
              className="study-actions"
              role="group"
              aria-label="Choose promotion"
            >
              {(["q", "r", "b", "n"] as const).map((piece) => (
                <button
                  className="review-action piece-choice"
                  key={piece}
                  aria-label={pieceNames[piece]}
                  title={pieceNames[piece]}
                  onClick={() => {
                    if (selected) attempt(selected + promotion + piece);
                  }}
                >
                  <PromotionPiece piece={piece} color={challenge.player} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="lesson-challenge__mission" data-state={state.status}>
          <p className="lesson-challenge__eyebrow">
            {complete ? "Well played" : "Find the game’s plan"}
          </p>
          {!isSidePanel && <h2>{challenge.title}</h2>}
          <div className="rook-board-message lesson-challenge__cue">
            <RookMessage>
              <p className="lesson-challenge__objective">
                {complete ? challenge.insight : goal}
              </p>
              <p className="lesson-challenge__feedback" role="status">
                {state.status === "replying" ? (
                  <LoadingText>{feedback}</LoadingText>
                ) : (
                  feedback
                )}
              </p>
            </RookMessage>
          </div>
          <progress
            aria-label="Challenge progress"
            value={Math.ceil(state.ply / 2)}
            max={challenge.objectives.length}
          />

          {complete && state.opponentMove && (
            <p className="lesson-challenge__reply">
              Opponent played {state.opponentMove}.
            </p>
          )}
          <div className="board-action-row board-action-row--anchored lesson-challenge__actions">
            {state.status === "retry" && (
              <button
                className="primary-link"
                onClick={() => {
                  dispatch({ type: "retry" });
                  setSelected(null);
                  setPromotion(null);
                }}
              >
                Try again
              </button>
            )}
            {analyzeReply && (complete || state.status === "retry") && (
              <button
                type="button"
                className="review-action board-action--quiet"
                onClick={() => {
                  setRookOpen(true);
                }}
              >
                Explore with Rook
              </button>
            )}
            {complete && onNext && (
              <NextMovePill label="Next challenge" onClick={onNext} />
            )}
            {complete && !onNext && (
              <button className="primary-link" onClick={onBack}>
                Finish lessons
              </button>
            )}
            <p className="board-turn">
              You play {challenge.player === "w" ? "White" : "Black"}
            </p>
          </div>
          {isSidePanel && opponent}
          <details className="board-reference lesson-challenge__source">
            <summary>Source game</summary>
            {isSidePanel && <h2>{challenge.title}</h2>}
            <p>
              Generated by{" "}
              {starterPack.historical[topic][lessonIndex]?.authorship.model} ·
              Stockfish verified
            </p>
            <a href={challenge.sourceUrl} target="_blank" rel="noreferrer">
              {challenge.source}
            </a>
          </details>
        </div>
      </div>
    </section>
  );
}
