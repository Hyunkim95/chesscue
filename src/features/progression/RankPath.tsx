import { useState } from "react";
import { ranks, rankForElo } from "../../domain/game/rank-path";
import {
  PLACEMENT_GAMES,
  placementCount,
  INITIAL_PLAYER_ELO,
  type RatingEntry,
} from "../../domain/game/rating";
import { rankArt } from "./rank-art";
import "./progression.css";
export function RankPath({
  history,
  onPlay,
}: {
  history: readonly RatingEntry[];
  onPlay: () => void;
}) {
  const elo = history.at(-1)?.after ?? INITIAL_PLAYER_ELO;
  const count = placementCount(history.at(-1));
  const current = count === null ? rankForElo(elo) : null;
  const [selected, setSelected] = useState<typeof current | null>(null);
  const tier = selected ?? current,
    next = ranks.find((rank) => rank.floor > elo);
  return (
    <main className="progress-world">
      <section className="progress-wrap">
        <p className="section-kicker">Rated progression</p>
        <h1>The climb</h1>
        <p>
          {count !== null
            ? "Placement · " + String(count) + " of " + String(PLACEMENT_GAMES)
            : next
              ? String(next.floor - elo) + " Elo to " + next.name
              : "Highest tier reached"}
        </p>
        <div className="rank-track" role="group" aria-label="Rank tiers">
          {ranks.map((rank) => (
            <button
              type="button"
              key={rank.name}
              aria-pressed={tier === rank}
              onClick={() => {
                setSelected(rank);
              }}
            >
              <img src={rankArt[rank.name]} alt="" />
              <span className="rank-marker" aria-hidden="true" />
              <strong>{rank.name}</strong>
              <small>
                {rank === current
                  ? "Current"
                  : rank.floor === 0
                    ? "Entry"
                    : rank.floor.toLocaleString("en-US") + " Elo"}
              </small>
            </button>
          ))}
        </div>
        <section className="rank-detail" aria-live="polite">
          <p className="section-kicker">
            {tier === null
              ? "Placement"
              : tier === current
                ? elo.toLocaleString("en-US") + " ChessCue Elo"
                : tier.floor === 0
                  ? "Entry tier"
                  : tier.floor.toLocaleString("en-US") + " Elo"}
          </p>
          <h2>{tier?.name ?? "Unranked"}</h2>
          <p>
            {tier === null
              ? "Finish five unassisted rated games to reveal your rank."
              : tier === current
                ? "Your rating updates after each unassisted rated game."
                : count !== null
                  ? "Your placement will determine your first tier."
                  : tier.floor > elo
                    ? "Reach this rating in unassisted rated games."
                    : "Your current rating is above this tier."}
          </p>
          <button className="review-action" onClick={onPlay}>
            Play a rated game
          </button>
        </section>
      </section>
    </main>
  );
}
