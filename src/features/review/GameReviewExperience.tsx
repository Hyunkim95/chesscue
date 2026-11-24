import { Chess, type Square } from "chess.js";
import { useMemo, useState, type ReactNode } from "react";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import {
  commitPrimaryMove,
  commitThemeRetrieval,
  commitTransferMove,
  completeAfterTransfer,
  continueAfterPrimaryFeedback,
  startReviewTraining,
  type ReviewTrainingState,
} from "../../application/analyze-game/review-training-session";
import {
  buildGameReplay,
  buildVariationFrames,
} from "../../domain/analysis/replay-game";
import {
  REVIEW_MOVE_TOLERANCE_CP,
  getThemeLabel,
  type ReviewTrainingLog,
} from "../../domain/analysis/review-training";
import type {
  LearningTheme,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import type { GameRecord } from "../../domain/game/types";
import { ReviewBoard } from "./ReviewBoard";
import "./game-review-experience.css";

type FeedbackLine = "attempt" | "verified";

const isSquare = (value: string): value is Square => /^[a-h][1-8]$/.test(value);

const legalTargets = (fen: string, from: string): readonly string[] => {
  if (!isSquare(from)) return [];
  try {
    const chess = new Chess(fen);
    const piece = chess.get(from);
    if (piece?.color !== chess.turn()) return [];
    return chess.moves({ square: from, verbose: true }).map((move) => move.to);
  } catch {
    return [];
  }
};

const buildMove = (fen: string, from: string, to: string): string | null => {
  if (!isSquare(from) || !isSquare(to)) return null;
  try {
    const chess = new Chess(fen);
    const piece = chess.get(from);
    if (piece?.color !== chess.turn()) return null;
    const move = chess.move({ from, to, promotion: "q" });
    return `${move.from}${move.to}${move.promotion ?? ""}`;
  } catch {
    return null;
  }
};

const lineFrame = (
  fact: MoveAnalysisFact,
  moveUci: string,
  verified: boolean,
): { readonly fen: string; readonly lastMoveUci: string | null } => {
  const candidate = fact.candidates.find((item) => item.uci === moveUci);
  const line =
    verified && candidate !== undefined
      ? candidate.principalVariation
      : [moveUci];
  const frames = buildVariationFrames(fact.fenBefore, line);
  const frame = frames.ok ? frames.frames[1] : undefined;
  return {
    fen: frame?.fen ?? fact.fenBefore,
    lastMoveUci: frame?.lastMoveUci ?? null,
  };
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
  const initialSession = useMemo(
    () => startReviewTraining(analysis),
    [analysis],
  );
  const [session, setSession] = useState<ReviewTrainingState | null>(
    initialSession,
  );
  const [themeChoice, setThemeChoice] = useState<LearningTheme | null>(null);
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

  const activeFact =
    session.stage === "transfer-move" || session.stage === "transfer-feedback"
      ? session.transferFact
      : session.primaryFact;
  if (activeFact === null)
    return <p role="alert">The transfer position is unavailable.</p>;
  const targets =
    selectedSquare === null
      ? []
      : legalTargets(activeFact.fenBefore, selectedSquare);

  const selectBoardSquare = (square: string): void => {
    if (targets.includes(square) && selectedSquare !== null) {
      setSelectedMove(buildMove(activeFact.fenBefore, selectedSquare, square));
      return;
    }
    const nextTargets = legalTargets(activeFact.fenBefore, square);
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
      return current.stage === "primary-move"
        ? commitPrimaryMove(current, selectedMove)
        : commitTransferMove(current, selectedMove);
    });
    setFeedbackLine("attempt");
    clearMoveSelection();
  };

  const completeSession = (next: ReviewTrainingState): void => {
    setSession(next);
    if (next.stage === "complete") onTrainingComplete?.(next.log);
  };

  const stageNumber =
    session.stage === "theme-retrieval"
      ? 1
      : session.stage === "primary-move" || session.stage === "primary-feedback"
        ? 2
        : session.stage === "transfer-move" ||
            session.stage === "transfer-feedback"
          ? 3
          : 4;

  return (
    <section className="game-review" aria-labelledby="game-review-title">
      <header className="game-review__header">
        <div>
          <p className="game-review__eyebrow">Active review set</p>
          <h2 id="game-review-title">Find it, play it, transfer it</h2>
        </div>
        <p className="game-review__set-progress">
          Set {String(stageNumber)} of 4
        </p>
      </header>

      {session.stage === "theme-retrieval" ? (
        <TrainingStage
          board={
            <ReviewBoard
              fen={session.primaryFact.fenBefore}
              orientation={game.playerColor ?? "white"}
              lastMoveUci={null}
            />
          }
          eyebrow="Warm-up recall"
          title="What matters most before you move?"
          description="Choose from memory. Stockfish stays hidden until you commit."
        >
          <fieldset className="game-review__choices">
            <legend>Position demand</legend>
            {session.themeChoices.map((choice) => (
              <label key={choice.theme}>
                <input
                  type="radio"
                  name="theme-choice"
                  value={choice.theme}
                  checked={themeChoice === choice.theme}
                  onChange={() => {
                    setThemeChoice(choice.theme);
                  }}
                />
                <span>{choice.label}</span>
              </label>
            ))}
          </fieldset>
          <button
            className="game-review__primary"
            type="button"
            disabled={themeChoice === null}
            onClick={() => {
              if (themeChoice !== null)
                setSession(commitThemeRetrieval(session, themeChoice));
            }}
          >
            Lock this read
          </button>
        </TrainingStage>
      ) : null}

      {session.stage === "primary-move" || session.stage === "transfer-move" ? (
        <TrainingStage
          board={
            <ReviewBoard
              fen={activeFact.fenBefore}
              orientation={game.playerColor ?? "white"}
              lastMoveUci={selectedMove}
              selectedSquare={selectedSquare}
              legalTargets={targets}
              onSquareSelect={selectBoardSquare}
            />
          }
          eyebrow={
            session.stage === "primary-move" ? "Working set" : "Transfer set"
          }
          title={
            session.stage === "primary-move"
              ? "Commit the move you would play"
              : "Apply the same idea in this new position"
          }
          description="Select a piece, choose a legal destination, then commit. No notation needed."
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
            onClick={commitMove}
          >
            Commit this move
          </button>
        </TrainingStage>
      ) : null}

      {session.stage === "primary-feedback" ||
      session.stage === "transfer-feedback" ? (
        <FeedbackStage
          game={game}
          fact={activeFact}
          score={
            session.stage === "primary-feedback"
              ? session.primaryScore
              : session.transferScore
          }
          line={feedbackLine}
          setLine={setFeedbackLine}
          themeCorrect={session.themeCorrect ?? false}
          primary={session.stage === "primary-feedback"}
          hasTransfer={session.transferFact !== null}
          onContinue={() => {
            const completedAt = now();
            const next =
              session.stage === "primary-feedback"
                ? continueAfterPrimaryFeedback(session, completedAt)
                : completeAfterTransfer(session, completedAt);
            completeSession(next);
            clearMoveSelection();
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

      {session.stage === "primary-feedback" ||
      session.stage === "transfer-feedback" ||
      session.stage === "complete" ? (
        <details className="game-review__technical">
          <summary>Technical details</summary>
          <dl>
            <div>
              <dt>Attempt</dt>
              <dd>
                {session.primaryScore?.attemptedMoveUci ?? "Not committed"}
              </dd>
            </div>
            <div>
              <dt>Verified move</dt>
              <dd>
                {session.primaryScore?.bestMoveUci ??
                  session.primaryMoment.candidateMoveUci}
              </dd>
            </div>
            <div>
              <dt>Acceptance tolerance</dt>
              <dd>{String(REVIEW_MOVE_TOLERANCE_CP)} centipawns</dd>
            </div>
            <div>
              <dt>Verified continuation</dt>
              <dd>
                {session.primaryFact.candidates[0]?.principalVariation.join(
                  " ",
                ) ?? "Unavailable"}
              </dd>
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
  fact,
  score,
  line,
  setLine,
  themeCorrect,
  primary,
  hasTransfer,
  onContinue,
}: {
  readonly game: GameRecord;
  readonly fact: MoveAnalysisFact;
  readonly score: ReviewTrainingState["primaryScore"];
  readonly line: FeedbackLine;
  readonly setLine: (line: FeedbackLine) => void;
  readonly themeCorrect: boolean;
  readonly primary: boolean;
  readonly hasTransfer: boolean;
  readonly onContinue: () => void;
}) {
  if (score === null) return <p role="alert">This move was not scored.</p>;
  const move = line === "attempt" ? score.attemptedMoveUci : score.bestMoveUci;
  const frame = lineFrame(fact, move, line === "verified");
  return (
    <TrainingStage
      board={
        <ReviewBoard
          fen={frame.fen}
          orientation={game.playerColor ?? "white"}
          lastMoveUci={frame.lastMoveUci}
        />
      }
      eyebrow={score.accepted ? "Set passed" : "Correction"}
      title={score.accepted ? "Your move holds up" : "Resolve the demand first"}
      description={score.comparison}
    >
      {primary ? (
        <p className="game-review__retrieval-result">
          Retrieval:{" "}
          {themeCorrect
            ? "you identified the demand"
            : `the key demand was ${getThemeLabel(fact.theme).toLowerCase()}`}
          .
        </p>
      ) : null}
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
        {primary
          ? hasTransfer
            ? "Continue to transfer"
            : "Finish and log this set"
          : "Finish this set"}
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
  return (
    <section
      className="game-review__summary"
      aria-labelledby="training-log-title"
    >
      <p className="game-review__eyebrow">Training log</p>
      <h3 id="training-log-title">This set programs the next one</h3>
      <dl>
        <div>
          <dt>First-attempt score</dt>
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
        <div>
          <dt>Transfer</dt>
          <dd>
            {log.transfer === "completed"
              ? "Completed with another verified position"
              : "Scheduled explicitly for the next game"}
          </dd>
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
