import type { LearningMoment } from "../../domain/analysis/types";
import "./learning-moments-review.css";

export interface LearningMomentsReviewProps {
  readonly moments: readonly LearningMoment[];
}

function themeLabel(theme: LearningMoment["theme"]): string {
  return theme.replaceAll("-", " ");
}

export function LearningMomentsReview({ moments }: LearningMomentsReviewProps) {
  return (
    <section
      className="moments-review"
      aria-labelledby="learning-moments-title"
    >
      <p className="moments-review__eyebrow">Verified review</p>
      <h2 id="learning-moments-title">Moments that shape your next lesson</h2>
      {moments.length === 0 ? (
        <p>No verified learning moments are ready yet.</p>
      ) : (
        <ol>
          {moments.map((moment) => (
            <li key={moment.id}>
              <div>
                <span className="moments-review__theme">
                  {themeLabel(moment.theme)}
                </span>
                <span className="moments-review__phase">{moment.phase}</span>
              </div>
              <h3>Move {Math.ceil(moment.ply / 2)}</h3>
              <p>
                You played <strong>{moment.playedMoveSan}</strong>. Review{" "}
                <strong>
                  {moment.candidateMoveSan ?? moment.candidateMoveUci}
                </strong>{" "}
                before the lesson begins.
              </p>
              <p className="moments-review__trace">
                Engine impact: {moment.impactCp} centipawns. Analysis{" "}
                {moment.analysisVersion}.
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
