import { rankForElo } from "../../domain/game/rank-path";
import { rankArt } from "../progression/rank-art";
import {
  PLACEMENT_GAMES,
  placementCount,
  INITIAL_PLAYER_ELO,
  type RatingEntry,
} from "../../domain/game/rating";

export function RatingProgress({
  history,
  result,
  onRankPath,
  onNextPlacement,
}: {
  readonly history: readonly RatingEntry[];
  readonly onRankPath?: () => void;
  readonly onNextPlacement?: () => void;
  readonly result?: RatingEntry;
}) {
  const recent = history
    .filter(
      (entry) =>
        entry.placementGame === undefined ||
        entry.placementGame === PLACEMENT_GAMES,
    )
    .slice(-5);
  const rating = result?.after ?? history.at(-1)?.after ?? INITIAL_PLAYER_ELO;
  const change = result === undefined ? null : result.after - result.before;
  const scores = recent.map(({ after }) => after);
  const lowest = scores.length === 0 ? rating : Math.min(...scores);
  const range = Math.max(1, Math.max(...scores) - lowest);
  const points = scores
    .map((score, index) =>
      [
        10 + (280 * index) / Math.max(1, scores.length - 1),
        50 - (40 * (score - lowest)) / range,
      ].join(","),
    )
    .join(" ");
  const count = placementCount(result ?? history.at(-1));
  const chart =
    recent.length > 1 ? (
      <figure>
        <figcaption>Last {recent.length} rated games</figcaption>
        <svg
          viewBox="0 0 300 60"
          role="img"
          aria-label={`Elo history: ${scores.join(", ")}`}
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="rating-progress__scale" aria-hidden="true">
          <span>{recent[0]?.after}</span>
          <span>{recent.at(-1)?.after}</span>
        </div>
      </figure>
    ) : null;
  if (result === undefined) {
    const tier = count === null ? rankForElo(rating).name : null;
    const remaining = PLACEMENT_GAMES - (count ?? 0);
    return (
      <section className="profile-rank" aria-label="Your Elo">
        <div className="profile-rank__hero">
          <div className="profile-rank__badge" aria-hidden="true">
            {tier ? <img src={rankArt[tier]} alt="" /> : <span>♘</span>}
          </div>
          <p className="section-kicker">Current rank</p>
          <h2>{tier ?? "Unranked"}</h2>
          {tier ? (
            <p className="profile-rank__rating">
              {rating.toLocaleString()} ChessCue Elo
            </p>
          ) : (
            <>
              <p>
                {remaining} placement {remaining === 1 ? "game" : "games"} left
              </p>
              <div className="profile-rank__placements" aria-hidden="true">
                {Array.from({ length: PLACEMENT_GAMES }, (_, index) => (
                  <i key={index} data-complete={index < (count ?? 0)} />
                ))}
              </div>
            </>
          )}
        </div>
        {chart}
        {onRankPath && (
          <button type="button" className="review-action" onClick={onRankPath}>
            View rank path
          </button>
        )}
      </section>
    );
  }
  if (count !== null)
    return (
      <section className="rating-progress" aria-label="Your Elo">
        <p className="section-kicker">Rated game · {result.result}</p>
        <h2>Unranked</h2>
        <p>
          Placement · {count} of {PLACEMENT_GAMES}
        </p>
        <progress
          aria-label="Rated placement progress"
          max={PLACEMENT_GAMES}
          value={count}
        />
        <p>
          {count === PLACEMENT_GAMES - 1
            ? "One more unassisted rated game reveals your rank."
            : "Your rank will be revealed after game five."}
        </p>
        {onNextPlacement && (
          <button
            type="button"
            className="primary-link"
            onClick={onNextPlacement}
          >
            Play next placement game
          </button>
        )}
        {onRankPath && (
          <button type="button" className="review-action" onClick={onRankPath}>
            View rank path
          </button>
        )}
      </section>
    );
  return (
    <section className="rating-progress" aria-label="Your Elo">
      <p className="section-kicker">Rated game · {result.result}</p>
      {result.placementGame === PLACEMENT_GAMES && (
        <h2>You placed in {rankForElo(result.after).name}</h2>
      )}
      <div className="rating-progress__figure">
        <p className="rating-progress__elo">
          <strong>{rating.toLocaleString()}</strong> <span>Elo</span>
        </p>
        <img
          className="rating-progress__relic"
          src={rankArt[rankForElo(rating).name]}
          alt={rankForElo(rating).name + " tier"}
        />
      </div>
      {change !== null && result.placementGame === undefined ? (
        <p>
          <strong>
            {change > 0 ? "+" : ""}
            {change} this game
          </strong>{" "}
          ·{" "}
          {result.beginner
            ? "Beginner CPU"
            : "CPU " + String(result.opponentElo) + " Elo"}
        </p>
      ) : null}
      {result.placementGame === PLACEMENT_GAMES && (
        <p>
          Placement complete · {PLACEMENT_GAMES} of {PLACEMENT_GAMES}
        </p>
      )}
      {chart}
      {onRankPath && (
        <button type="button" className="review-action" onClick={onRankPath}>
          View rank path
        </button>
      )}
    </section>
  );
}
