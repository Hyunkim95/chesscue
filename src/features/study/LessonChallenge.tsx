import { RookMessage } from "../../shared/rook/RookMessage";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Chess, type Square } from "chess.js";
import {
  advanceLessonChallenge,
  buildLessonChallenge,
  startLessonChallenge,
  type ChallengeState,
} from "../../domain/study/lesson-challenge";
import type { StudyTopic } from "../../domain/study/roadmap";
import { ChessBoard } from "../board/ChessBoard";
import "./lesson-challenge.css";

export function LessonChallenge({
  topic,
  lessonIndex,
  onBack,
  onNext,
}: {
  topic: StudyTopic;
  lessonIndex: number;
  onBack: () => void;
  onNext: (() => void) | undefined;
}) {
  const challenge = useMemo(
    () => buildLessonChallenge(topic, lessonIndex),
    [topic, lessonIndex],
  );
  const [state, dispatch] = useReducer(
    (
      current: ChallengeState | null,
      action: Parameters<typeof advanceLessonChallenge>[2],
    ) =>
      challenge && current
        ? advanceLessonChallenge(challenge, current, action)
        : current,
    challenge ? startLessonChallenge(challenge) : null,
  );
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
  }, [state?.status, state?.ply]);
  if (!challenge || !state)
    return (
      <section className="lesson-challenge" aria-label="Lesson challenge">
        <p role="alert">This challenge could not be loaded.</p>
        <button onClick={onBack}>Back to challenges</button>
      </section>
    );
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
  return (
    <section
      ref={stage}
      className="lesson-challenge"
      aria-label="Lesson challenge"
    >
      <header className="lesson-challenge__header">
        <button
          className="study-back"
          aria-label="Back to challenges"
          onClick={onBack}
        >
          ‹ Back to challenges
        </button>
        <span>Challenge {lessonIndex + 1} of 3</span>
      </header>
      <div className="lesson-challenge__layout">
        <div className="lesson-challenge__board">
          <div className="lesson-challenge__opponent">
            <span aria-hidden="true">♚</span>
            <span>Opponent · Recorded game</span>
          </div>
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
          <div className="lesson-challenge__player">
            <span aria-hidden="true">♔</span>You play{" "}
            {challenge.player === "w" ? "White" : "Black"}
          </div>
          {promotion && (
            <div className="study-actions" aria-label="Choose promotion">
              {(["q", "r", "b", "n"] as const).map((piece, index) => (
                <button
                  className="review-action"
                  key={piece}
                  onClick={() => {
                    if (selected) attempt(selected + promotion + piece);
                  }}
                >
                  {["Queen", "Rook", "Bishop", "Knight"][index]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="lesson-challenge__mission" data-state={state.status}>
          <p className="lesson-challenge__eyebrow">
            {complete ? "Well played" : "Find the game’s plan"}
          </p>
          <h2>{challenge.title}</h2>
          <RookMessage>
            <p className="lesson-challenge__objective">
              {complete ? challenge.insight : goal}
            </p>
            <p className="lesson-challenge__feedback" role="status">
              {feedback}
            </p>
          </RookMessage>
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
          {complete && onNext && (
            <button className="primary-link" onClick={onNext}>
              Next challenge <span aria-hidden="true">▸</span>
            </button>
          )}
          {complete && !onNext && (
            <button className="primary-link" onClick={onBack}>
              Finish lessons
            </button>
          )}
          <details className="lesson-challenge__source">
            <summary>Source game</summary>
            <a href={challenge.sourceUrl} target="_blank" rel="noreferrer">
              {challenge.source}
            </a>
          </details>
        </div>
      </div>
    </section>
  );
}
