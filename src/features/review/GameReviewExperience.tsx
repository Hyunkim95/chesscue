import { Chess, type PieceSymbol, type Square } from "chess.js";
import { useMemo, useState } from "react";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import {
  buildGameReplay,
  buildVariationFrames,
} from "../../domain/analysis/replay-game";
import type { LearningTheme } from "../../domain/analysis/types";
import type { GameRecord } from "../../domain/game/types";
import { ReviewBoard } from "./ReviewBoard";
import "./game-review-experience.css";

type Comparison = "your-move" | "better-move";

const pieceNames: Readonly<Record<PieceSymbol, string>> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const isSquare = (value: string): value is Square => /^[a-h][1-8]$/.test(value);

function describeMove(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    if (!isSquare(from) || !isSquare(to)) return "Show the verified move";
    const piece = chess.get(from);
    const target = chess.get(to);
    if (piece === undefined) return `Move from ${from} to ${to}`;

    if (
      piece.type === "k" &&
      Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2
    ) {
      return to.charCodeAt(0) > from.charCodeAt(0)
        ? "Castle kingside"
        : "Castle queenside";
    }
    if (target !== undefined) {
      return `Capture the ${pieceNames[target.type]} on ${to} with your ${pieceNames[piece.type]}`;
    }
    const promotion = uci[4];
    const promotionName =
      promotion === "q" ||
      promotion === "r" ||
      promotion === "b" ||
      promotion === "n"
        ? pieceNames[promotion]
        : null;
    return `Move the ${pieceNames[piece.type]} from ${from} to ${to}${promotionName === null ? "" : ` and promote to ${promotionName}`}`;
  } catch {
    return `Move from ${uci.slice(0, 2)} to ${uci.slice(2, 4)}`;
  }
}

const explanations: Readonly<Record<LearningTheme, string>> = {
  "hanging-piece":
    "A piece was left with more pressure on it than protection. Check every attacked piece before committing to your plan.",
  "one-move-threat":
    "The position contained an immediate threat. Pause for checks, captures, and direct attacks before choosing your move.",
  "premature-central-exchange":
    "The central tension was released before it helped your position. Consider which side benefits before exchanging central pawns.",
  "king-safety":
    "Your king remained exposed while the position opened. Complete development and secure the king before starting an attack.",
  development:
    "A developing move was available while another move delayed coordination. Bring new pieces into useful squares early.",
  calculation:
    "The move needed a longer forcing-line check. Calculate the opponent’s strongest reply before finalizing the move.",
  "endgame-technique":
    "The endgame required a precise sequence. Start with the most forcing move and verify the resulting pawn or king position.",
  other:
    "This move changed the position significantly. Compare the two lines and identify what the stronger move preserves.",
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
}

export function GameReviewExperience({
  game,
  analysis,
  isPracticeAvailable = () => true,
  onPracticePosition,
}: GameReviewExperienceProps) {
  const replay = useMemo(() => buildGameReplay(game), [game]);
  const initialMomentPly = analysis.moments[0]?.ply ?? 1;
  const [momentIndex, setMomentIndex] = useState(0);
  const [replayPly, setReplayPly] = useState(Math.max(0, initialMomentPly - 1));
  const [comparison, setComparison] = useState<Comparison>("your-move");
  const [lineStep, setLineStep] = useState(0);

  if (!replay.ok) return <p role="alert">{replay.message}</p>;

  const selectedMoment = analysis.moments[momentIndex];
  const selectedFact =
    selectedMoment === undefined
      ? undefined
      : analysis.facts.find(
          (fact) =>
            fact.gameId === selectedMoment.gameId &&
            fact.ply === selectedMoment.ply,
        );
  const betterCandidate =
    selectedMoment === undefined
      ? undefined
      : (selectedFact?.candidates.find(
          (candidate) => candidate.uci === selectedMoment.candidateMoveUci,
        ) ?? selectedFact?.candidates[0]);
  const yourLine =
    selectedMoment === undefined
      ? []
      : game.moves
          .slice(Math.max(0, selectedMoment.ply - 1), selectedMoment.ply + 2)
          .map((move) => move.uci);
  const betterLine =
    selectedMoment === undefined
      ? []
      : (betterCandidate?.principalVariation.slice(0, 3) ?? [
          selectedMoment.candidateMoveUci,
        ]);
  const activeLine = comparison === "your-move" ? yourLine : betterLine;
  const variation =
    selectedMoment === undefined
      ? null
      : buildVariationFrames(selectedMoment.fenBefore, activeLine);
  const variationFrames = variation?.ok === true ? variation.frames : [];
  const boundedReplayPly = Math.min(replayPly, replay.frames.length - 1);
  const replayFrame = replay.frames[boundedReplayPly];
  const variationFrame = lineStep > 0 ? variationFrames[lineStep] : undefined;
  const displayFrame = variationFrame ?? replayFrame ?? replay.frames[0];
  if (displayFrame === undefined)
    return <p role="alert">The game has no replay positions.</p>;
  const practiceAvailable =
    selectedMoment !== undefined && isPracticeAvailable(selectedMoment.theme);

  function selectMoment(index: number): void {
    const moment = analysis.moments[index];
    if (moment === undefined) return;
    setMomentIndex(index);
    setReplayPly(Math.max(0, moment.ply - 1));
    setComparison("your-move");
    setLineStep(0);
  }

  function selectComparison(value: Comparison): void {
    setComparison(value);
    if (selectedMoment !== undefined)
      setReplayPly(Math.max(0, selectedMoment.ply - 1));
    setLineStep(0);
  }

  const replayLabel =
    boundedReplayPly === 0
      ? "Starting position"
      : `After ${boundedReplayPly % 2 === 1 ? "White's" : "Black's"} move ${String(Math.ceil(boundedReplayPly / 2))}`;
  const lineLabel =
    lineStep === 0
      ? "Position before the learner move"
      : `Comparison step ${String(lineStep)} of ${String(Math.max(0, variationFrames.length - 1))}`;
  const yourMoveDescription =
    selectedMoment === undefined
      ? ""
      : describeMove(selectedMoment.fenBefore, selectedMoment.playedMoveUci);
  const betterMoveDescription =
    selectedMoment === undefined
      ? ""
      : describeMove(selectedMoment.fenBefore, selectedMoment.candidateMoveUci);

  return (
    <section className="game-review" aria-labelledby="game-review-title">
      <header className="game-review__header">
        <div>
          <p className="game-review__eyebrow">Replay-first review</p>
          <h2 id="game-review-title">
            See the position, then compare the choice
          </h2>
        </div>
        {selectedMoment === undefined ? null : (
          <p className="game-review__moment-count">
            Moment {String(momentIndex + 1)} of{" "}
            {String(analysis.moments.length)}
          </p>
        )}
      </header>

      <div className="game-review__layout">
        <div className="game-review__stage">
          <ReviewBoard
            fen={displayFrame.fen}
            orientation={game.playerColor ?? "white"}
            lastMoveUci={displayFrame.lastMoveUci}
          />
          <p className="game-review__board-status" role="status">
            {lineStep > 0 ? lineLabel : replayLabel}
          </p>

          <div className="game-review__scrubber">
            <label htmlFor="game-review-ply">Replay the full game</label>
            <input
              id="game-review-ply"
              type="range"
              min="0"
              max={String(Math.max(0, replay.frames.length - 1))}
              value={String(boundedReplayPly)}
              onChange={(event) => {
                setReplayPly(Number(event.currentTarget.value));
                setLineStep(0);
              }}
            />
            <div className="game-review__replay-actions">
              <button
                type="button"
                disabled={boundedReplayPly === 0}
                onClick={() => {
                  setReplayPly((value) => Math.max(0, value - 1));
                  setLineStep(0);
                }}
              >
                Previous move
              </button>
              <span>
                Ply {String(boundedReplayPly)} of{" "}
                {String(replay.frames.length - 1)}
              </span>
              <button
                type="button"
                disabled={boundedReplayPly >= replay.frames.length - 1}
                onClick={() => {
                  setReplayPly((value) =>
                    Math.min(replay.frames.length - 1, value + 1),
                  );
                  setLineStep(0);
                }}
              >
                Next move
              </button>
            </div>
          </div>
        </div>

        <div className="game-review__guide">
          {selectedMoment === undefined ? (
            <div className="game-review__empty">
              <h3>No verified learning moments</h3>
              <p>
                You can still scrub the completed game while deeper analysis is
                unavailable.
              </p>
            </div>
          ) : (
            <>
              <div className="game-review__moment-nav">
                <button
                  type="button"
                  disabled={momentIndex === 0}
                  onClick={() => {
                    selectMoment(momentIndex - 1);
                  }}
                >
                  Previous moment
                </button>
                <button
                  type="button"
                  disabled={momentIndex >= analysis.moments.length - 1}
                  onClick={() => {
                    selectMoment(momentIndex + 1);
                  }}
                >
                  Next moment
                </button>
              </div>

              <p className="game-review__theme">
                {selectedMoment.theme.replaceAll("-", " ")}
              </p>
              <h3>Move {String(Math.ceil(selectedMoment.ply / 2))}</h3>
              <p className="game-review__explanation">
                {explanations[selectedMoment.theme]}
              </p>
              <p className="game-review__comparison-copy">
                Compare what you chose with the safer engine line. Step through
                each option and watch how the board changes.
              </p>

              <div
                className="game-review__tabs"
                role="tablist"
                aria-label="Compare moves"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={comparison === "your-move"}
                  onClick={() => {
                    selectComparison("your-move");
                  }}
                >
                  <strong>Your move</strong>
                  <span>{yourMoveDescription}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={comparison === "better-move"}
                  onClick={() => {
                    selectComparison("better-move");
                  }}
                >
                  <strong>Better move</strong>
                  <span>{betterMoveDescription}</span>
                </button>
              </div>

              <div className="game-review__line-controls">
                <button
                  type="button"
                  disabled={lineStep === 0}
                  onClick={() => {
                    setLineStep((value) => Math.max(0, value - 1));
                  }}
                >
                  Back one move
                </button>
                <span>
                  Step {String(lineStep)} of{" "}
                  {String(Math.max(0, variationFrames.length - 1))}
                </span>
                <button
                  type="button"
                  disabled={lineStep >= variationFrames.length - 1}
                  onClick={() => {
                    setLineStep((value) =>
                      Math.min(variationFrames.length - 1, value + 1),
                    );
                  }}
                >
                  Play next move
                </button>
              </div>

              {practiceAvailable ? (
                <button
                  className="game-review__practice"
                  type="button"
                  onClick={() => {
                    onPracticePosition({
                      gameId: selectedMoment.gameId,
                      momentId: selectedMoment.id,
                      fen: selectedMoment.fenBefore,
                      theme: selectedMoment.theme,
                    });
                  }}
                >
                  Practice this pattern
                </button>
              ) : (
                <p className="game-review__practice-unavailable">
                  Guided practice for this pattern is coming next.
                </p>
              )}

              <details className="game-review__technical">
                <summary>Technical details</summary>
                <dl>
                  <div>
                    <dt>Your notation</dt>
                    <dd>
                      {selectedMoment.playedMoveSan} (
                      {selectedMoment.playedMoveUci})
                    </dd>
                  </div>
                  <div>
                    <dt>Better notation</dt>
                    <dd>
                      {selectedMoment.candidateMoveSan ??
                        "Verified engine move"}{" "}
                      ({selectedMoment.candidateMoveUci})
                    </dd>
                  </div>
                  <div>
                    <dt>Verified continuation</dt>
                    <dd>
                      {betterLine.join(" ") || "No continuation available"}
                    </dd>
                  </div>
                  <div>
                    <dt>Evaluation</dt>
                    <dd>
                      {String(selectedMoment.trace.evaluationBeforeCp)} to{" "}
                      {String(selectedMoment.trace.evaluationAfterCp)}{" "}
                      centipawns
                    </dd>
                  </div>
                  <div>
                    <dt>Analysis version</dt>
                    <dd>{selectedMoment.analysisVersion}</dd>
                  </div>
                </dl>
              </details>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
