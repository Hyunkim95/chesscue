import { Chess, type Square } from "chess.js";
import { useMemo, useState, type ReactNode } from "react";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import {
  commitCloseMove,
  commitOriginalMove,
  commitUnlabeledMove,
  completeAfterUnlabeled,
  continueAfterCloseFeedback,
  continueAfterOriginalFeedback,
  startReviewTraining,
  type ReviewTrainingState,
} from "../../application/analyze-game/review-training-session";
import {
  buildGameReplay,
  buildVariationFrames,
} from "../../domain/analysis/replay-game";
import {
  REVIEW_MOVE_TOLERANCE_CP,
  getThemeFeedback,
  getThemeName,
  type MoveAttemptScore,
  type ReviewTrainingLog,
} from "../../domain/analysis/review-training";
import type { LearningTheme } from "../../domain/analysis/types";
import type { GameRecord } from "../../domain/game/types";
import { ReviewBoard } from "./ReviewBoard";
import "./game-review-experience.css";

type FeedbackLine = "attempt" | "verified";

const isSquare = (value: string): value is Square => /^[a-h][1-8]$/.test(value);

const legalTargets = (fen: string, from: string): readonly string[] => {
  if (!isSquare(from)) return [];
  try {
    const chess = new Chess(fen);
    if (chess.get(from)?.color !== chess.turn()) return [];
    return chess.moves({ square: from, verbose: true }).map((move) => move.to);
  } catch {
    return [];
  }
};

const buildMove = (fen: string, from: string, to: string): string | null => {
  if (!isSquare(from) || !isSquare(to)) return null;
  try {
    const chess = new Chess(fen);
    if (chess.get(from)?.color !== chess.turn()) return null;
    const move = chess.move({ from, to, promotion: "q" });
    return `${move.from}${move.to}${move.promotion ?? ""}`;
  } catch {
    return null;
  }
};

const firstLineFrame = (
  fen: string,
  line: readonly string[],
): { readonly fen: string; readonly lastMoveUci: string | null } => {
  const frames = buildVariationFrames(fen, line);
  const frame = frames.ok ? frames.frames[1] : undefined;
  return { fen: frame?.fen ?? fen, lastMoveUci: frame?.lastMoveUci ?? null };
};

export interface PracticePositionRequest {
  readonly gameId: string;
  readonly momentId: string;
  readonly fen: string;
  readonly theme: LearningTheme;
}

export interface GameReviewExperienceProps {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
  readonly isPracticeAvailable?: (theme: LearningTheme) => boolean;
  readonly onPracticePosition: (request: PracticePositionRequest) => void;
  readonly onTrainingComplete?: ((log: ReviewTrainingLog) => void) | null;
  readonly now?: () => string;
}

export function GameReviewExperience({
  game,
  analysis,
  isPracticeAvailable = () => true,
  onPracticePosition,
  onTrainingComplete = null,
  now = () => new Date().toISOString(),
}: GameReviewExperienceProps) {
  const replay = useMemo(() => buildGameReplay(game), [game]);
  const [session, setSession] = useState<ReviewTrainingState | null>(() =>
    startReviewTraining(analysis),
  );
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectedMove, setSelectedMove] = useState<string | null>(null);
  const [feedbackLine, setFeedbackLine] = useState<FeedbackLine>("attempt");
  const [replayPly, setReplayPly] = useState(0);

  if (!replay.ok) return <p role="alert">{replay.message}</p>;
  if (session === null) {
    return (
      <section
        className="game-review game-review__empty"
        aria-labelledby="review-empty-title"
      >
        <h2 id="review-empty-title">No verified training set yet</h2>
        <p>You can still replay the completed game while analysis finishes.</p>
        <ReplayDetails
          game={game}
          replayFrames={replay.frames}
          replayPly={replayPly}
          setReplayPly={setReplayPly}
        />
      </section>
    );
  }

  const activeExercise =
    session.stage === "close-move" || session.stage === "close-feedback"
      ? session.closeExercise
      : session.stage === "unlabeled-move" ||
          session.stage === "unlabeled-feedback"
        ? session.unlabeledExercise
        : null;
  const activeFen = activeExercise?.fen ?? session.primaryFact.fenBefore;
  const targets =
    selectedSquare === null ? [] : legalTargets(activeFen, selectedSquare);

  const selectBoardSquare = (square: string): void => {
    if (targets.includes(square) && selectedSquare !== null) {
      setSelectedMove(buildMove(activeFen, selectedSquare, square));
      return;
    }
    const nextTargets = legalTargets(activeFen, square);
    setSelectedSquare(nextTargets.length > 0 ? square : null);
    setSelectedMove(null);
  };

  const clearMoveSelection = (): void => {
    setSelectedSquare(null);
    setSelectedMove(null);
  };

  const commitMove = (): void => {
    if (selectedMove === null) return;
    setSession((current) => {
      if (current === null) return current;
      if (current.stage === "original-move")
        return commitOriginalMove(current, selectedMove);
      if (current.stage === "close-move")
        return commitCloseMove(current, selectedMove);
      return commitUnlabeledMove(current, selectedMove);
    });
    setFeedbackLine("attempt");
    clearMoveSelection();
  };

  const completeSession = (next: ReviewTrainingState): void => {
    setSession(next);
    if (next.stage === "complete") onTrainingComplete?.(next.log);
  };

  const totalSets =
    session.closeExercise === null || session.unlabeledExercise === null
      ? 2
      : 4;
  const setNumber =
    session.stage === "original-move" || session.stage === "original-feedback"
      ? 1
      : session.stage === "close-move" || session.stage === "close-feedback"
        ? 2
        : session.stage === "unlabeled-move" ||
            session.stage === "unlabeled-feedback"
          ? 3
          : totalSets;

  return (
    <section className="game-review" aria-labelledby="game-review-title">
      <header className="game-review__header">
        <div>
          <p className="game-review__eyebrow">Active review set</p>
          <h2 id="game-review-title">Retry it, vary it, transfer it</h2>
        </div>
        <p className="game-review__set-progress">
          Set {String(setNumber)} of {String(totalSets)}
        </p>
      </header>

      {session.stage === "original-move" ? (
        <MoveStage
          game={game}
          fen={session.primaryFact.fenBefore}
          selectedSquare={selectedSquare}
          selectedMove={selectedMove}
          legalTargets={targets}
          onSquareSelect={selectBoardSquare}
          onCommit={commitMove}
          eyebrow="Exact retry"
          title="What would you play now?"
          description="Commit a legal move from the original position. Stockfish stays hidden until you choose."
        />
      ) : null}

      {session.stage === "close-move" && session.closeExercise !== null ? (
        <MoveStage
          game={game}
          fen={session.closeExercise.fen}
          selectedSquare={selectedSquare}
          selectedMove={selectedMove}
          legalTargets={targets}
          onSquareSelect={selectBoardSquare}
          onCommit={commitMove}
          eyebrow="Close analogue"
          title={session.closeExercise.prompt}
          description="The surface details changed. Commit a move before seeing the verified answer."
        />
      ) : null}

      {session.stage === "unlabeled-move" &&
      session.unlabeledExercise !== null ? (
        <MoveStage
          game={game}
          fen={session.unlabeledExercise.fen}
          selectedSquare={selectedSquare}
          selectedMove={selectedMove}
          legalTargets={targets}
          onSquareSelect={selectBoardSquare}
          onCommit={commitMove}
          eyebrow="Unlabeled transfer"
          title={session.unlabeledExercise.prompt}
          description="Treat this like an ordinary game position. No pattern label or hint is shown."
        />
      ) : null}

      {session.stage === "original-feedback" ? (
        <FeedbackStage
          game={game}
          fen={session.primaryFact.fenBefore}
          score={session.originalScore}
          verifiedLine={
            session.primaryFact.candidates.find(
              (candidate) =>
                candidate.uci === session.originalScore?.bestMoveUci,
            )?.principalVariation ?? []
          }
          line={feedbackLine}
          setLine={setFeedbackLine}
          eyebrow="Pattern named after your attempt"
          title={getThemeName(session.primaryFact.theme)}
          explanation={getThemeFeedback(session.primaryFact.theme)}
          continueLabel={
            session.closeExercise === null || session.unlabeledExercise === null
              ? "Finish and schedule transfer"
              : "Try a close analogue"
          }
          onContinue={() => {
            completeSession(continueAfterOriginalFeedback(session, now()));
          }}
        />
      ) : null}

      {session.stage === "close-feedback" && session.closeExercise !== null ? (
        <FeedbackStage
          game={game}
          fen={session.closeExercise.fen}
          score={session.closeScore}
          verifiedLine={[session.closeExercise.verification.bestMoveUci]}
          line={feedbackLine}
          setLine={setFeedbackLine}
          eyebrow="Close analogue feedback"
          title={
            session.closeScore?.accepted === true
              ? "The pattern transferred"
              : "Same pattern, new surface"
          }
          explanation={session.closeExercise.explanation}
          continueLabel="Try it without a label"
          onContinue={() => {
            setSession(continueAfterCloseFeedback(session));
            setFeedbackLine("attempt");
          }}
        />
      ) : null}

      {session.stage === "unlabeled-feedback" &&
      session.unlabeledExercise !== null ? (
        <FeedbackStage
          game={game}
          fen={session.unlabeledExercise.fen}
          score={session.unlabeledScore}
          verifiedLine={[session.unlabeledExercise.verification.bestMoveUci]}
          line={feedbackLine}
          setLine={setFeedbackLine}
          eyebrow="Unlabeled transfer feedback"
          title={
            session.unlabeledScore?.accepted === true
              ? "You found it without the label"
              : "This is the hard transfer"
          }
          explanation={session.unlabeledExercise.explanation}
          continueLabel="Finish and log this set"
          onContinue={() => {
            completeSession(completeAfterUnlabeled(session, now()));
          }}
        />
      ) : null}

      {session.stage === "complete" ? (
        <TrainingSummary
          session={session}
          practiceAvailable={isPracticeAvailable(session.primaryFact.theme)}
          onPractice={() => {
            onPracticePosition({
              gameId: session.primaryMoment.gameId,
              momentId: session.primaryMoment.id,
              fen: session.primaryMoment.fenBefore,
              theme: session.primaryMoment.theme,
            });
          }}
        />
      ) : null}

      <ReplayDetails
        game={game}
        replayFrames={replay.frames}
        replayPly={replayPly}
        setReplayPly={setReplayPly}
      />

      {session.stage === "original-feedback" ||
      session.stage === "close-feedback" ||
      session.stage === "unlabeled-feedback" ||
      session.stage === "complete" ? (
        <details className="game-review__technical">
          <summary>Technical details</summary>
          <dl>
            <div>
              <dt>Original attempt</dt>
              <dd>
                {session.originalScore?.attemptedMoveUci ?? "Not committed"}
              </dd>
            </div>
            <div>
              <dt>Verified original move</dt>
              <dd>
                {session.originalScore?.bestMoveUci ??
                  session.primaryMoment.candidateMoveUci}
              </dd>
            </div>
            <div>
              <dt>Acceptance tolerance</dt>
              <dd>{String(REVIEW_MOVE_TOLERANCE_CP)} centipawns</dd>
            </div>
            <div>
              <dt>Analysis version</dt>
              <dd>{session.primaryMoment.analysisVersion}</dd>
            </div>
          </dl>
        </details>
      ) : null}
    </section>
  );
}

function MoveStage({
  game,
  fen,
  selectedSquare,
  selectedMove,
  legalTargets,
  onSquareSelect,
  onCommit,
  eyebrow,
  title,
  description,
}: {
  readonly game: GameRecord;
  readonly fen: string;
  readonly selectedSquare: string | null;
  readonly selectedMove: string | null;
  readonly legalTargets: readonly string[];
  readonly onSquareSelect: (square: string) => void;
  readonly onCommit: () => void;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <TrainingStage
      board={
        <ReviewBoard
          fen={fen}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={selectedMove}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          onSquareSelect={onSquareSelect}
        />
      }
      eyebrow={eyebrow}
      title={title}
      description={description}
    >
      <p className="game-review__selection-status" role="status">
        {selectedMove === null
          ? selectedSquare === null
            ? "Select one of your pieces on the board."
            : "Now choose one of the marked legal destinations."
          : "Move selected. Commit when you are sure."}
      </p>
      <button
        className="game-review__primary"
        type="button"
        disabled={selectedMove === null}
        onClick={onCommit}
      >
        Commit this move
      </button>
    </TrainingStage>
  );
}

function TrainingStage({
  board,
  eyebrow,
  title,
  description,
  children,
}: {
  readonly board: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="game-review__training-layout">
      <div className="game-review__board-stage">{board}</div>
      <div className="game-review__prompt">
        <p className="game-review__theme">{eyebrow}</p>
        <h3>{title}</h3>
        <p className="game-review__prompt-copy">{description}</p>
        {children}
      </div>
    </div>
  );
}

function FeedbackStage({
  game,
  fen,
  score,
  verifiedLine,
  line,
  setLine,
  eyebrow,
  title,
  explanation,
  continueLabel,
  onContinue,
}: {
  readonly game: GameRecord;
  readonly fen: string;
  readonly score: MoveAttemptScore | null;
  readonly verifiedLine: readonly string[];
  readonly line: FeedbackLine;
  readonly setLine: (line: FeedbackLine) => void;
  readonly eyebrow: string;
  readonly title: string;
  readonly explanation: string;
  readonly continueLabel: string;
  readonly onContinue: () => void;
}) {
  if (score === null) return <p role="alert">This move was not scored.</p>;
  const frame = firstLineFrame(
    fen,
    line === "attempt" ? [score.attemptedMoveUci] : verifiedLine,
  );
  return (
    <TrainingStage
      board={
        <ReviewBoard
          fen={frame.fen}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={frame.lastMoveUci}
        />
      }
      eyebrow={eyebrow}
      title={title}
      description={score.comparison}
    >
      <p className="game-review__retrieval-result">{explanation}</p>
      <div
        className="game-review__line-switch"
        aria-label="Compare attempted and verified lines"
      >
        <button
          type="button"
          aria-pressed={line === "attempt"}
          onClick={() => {
            setLine("attempt");
          }}
        >
          Your attempt
        </button>
        <button
          type="button"
          aria-pressed={line === "verified"}
          onClick={() => {
            setLine("verified");
          }}
        >
          Verified line
        </button>
      </div>
      <button
        className="game-review__primary"
        type="button"
        onClick={onContinue}
      >
        {continueLabel}
      </button>
    </TrainingStage>
  );
}

function TrainingSummary({
  session,
  practiceAvailable,
  onPractice,
}: {
  readonly session: Extract<
    ReviewTrainingState,
    { readonly stage: "complete" }
  >;
  readonly practiceAvailable: boolean;
  readonly onPractice: () => void;
}) {
  const { log } = session;
  const scoreLabel = (value: number | null | undefined): string =>
    value === null || value === undefined
      ? "Scheduled for next game"
      : `${String(value)}%`;
  return (
    <section
      className="game-review__summary"
      aria-labelledby="training-log-title"
    >
      <p className="game-review__eyebrow">Training log</p>
      <h3 id="training-log-title">This set programs the next one</h3>
      <dl>
        <div>
          <dt>Original retry</dt>
          <dd>{scoreLabel(log.originalAttemptScore)}</dd>
        </div>
        <div>
          <dt>Close analogue</dt>
          <dd>{scoreLabel(log.closeTransferScore)}</dd>
        </div>
        <div>
          <dt>Unlabeled transfer</dt>
          <dd>{scoreLabel(log.unlabeledTransferScore)}</dd>
        </div>
        <div>
          <dt>Set score</dt>
          <dd>{String(log.firstAttemptScore)}%</dd>
        </div>
        <div>
          <dt>Hard spot</dt>
          <dd>{log.hardSpot}</dd>
        </div>
        <div>
          <dt>Due for review</dt>
          <dd>{log.dueReview}</dd>
        </div>
      </dl>
      <div className="game-review__reinforcement">
        <strong>Exact next-game reinforcement</strong>
        <p>{log.nextGameReinforcement}</p>
      </div>
      {practiceAvailable ? (
        <button
          className="game-review__secondary"
          type="button"
          onClick={onPractice}
        >
          Continue with the full playbook lesson
        </button>
      ) : null}
    </section>
  );
}

function ReplayDetails({
  game,
  replayFrames,
  replayPly,
  setReplayPly,
}: {
  readonly game: GameRecord;
  readonly replayFrames: readonly {
    readonly fen: string;
    readonly lastMoveUci: string | null;
  }[];
  readonly replayPly: number;
  readonly setReplayPly: (value: number) => void;
}) {
  const bounded = Math.min(replayPly, replayFrames.length - 1);
  const frame = replayFrames[bounded];
  if (frame === undefined) return null;
  return (
    <details className="game-review__replay">
      <summary>Replay the full game</summary>
      <div className="game-review__replay-content">
        <ReviewBoard
          fen={frame.fen}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={frame.lastMoveUci}
        />
        <label htmlFor="game-review-ply">Move through the game</label>
        <input
          id="game-review-ply"
          type="range"
          min="0"
          max={String(Math.max(0, replayFrames.length - 1))}
          value={String(bounded)}
          onChange={(event) => {
            setReplayPly(Number(event.currentTarget.value));
          }}
        />
        <p>
          Position {String(bounded)} of {String(replayFrames.length - 1)}
        </p>
      </div>
    </details>
  );
}
