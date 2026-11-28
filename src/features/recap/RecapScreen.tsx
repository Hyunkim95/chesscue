import crown from "../../assets/brand/rank-crown.webp";
import jadeKnight from "../../assets/brand/rank-jade.webp";
import type { IdeaCard, dayRecap } from "../../domain/progress";
import { RookBubble, RookSays } from "../../shared/rook/RookBubble";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import { Button, StatRow, StatTile } from "../../shared/ui/primitives";
import "./recap.css";

export interface RecapScreenProps {
  readonly recap: ReturnType<typeof dayRecap>;
  readonly ideas: readonly IdeaCard[];
  readonly unitTitles: ReadonlyMap<string, string>;
  readonly totalUnits: number;
  readonly rookLine: string;
  readonly onPlayGame: () => void;
  readonly onNextMoment: () => void;
  readonly onSeeSky: () => void;
}

const stripLength = 4;

export function RecapScreen({
  recap,
  ideas,
  unitTitles,
  totalUnits,
  rookLine,
  onPlayGame,
  onNextMoment,
  onSeeSky,
}: RecapScreenProps) {
  const newIdeas = new Set(recap.newIdeas);
  const collected = [
    ...ideas.filter(({ unitId }) => newIdeas.has(unitId)),
    ...ideas.filter(({ unitId }) => !newIdeas.has(unitId)),
  ].slice(0, stripLength);
  const lockedCount = Math.max(
    0,
    Math.min(stripLength, totalUnits) - collected.length,
  );

  return (
    <section className="recap-screen">
      <h1>From your games today</h1>
      <RookSays>
        <RookCharacter mood="happy" size="lg" />
        <RookBubble>{rookLine}</RookBubble>
      </RookSays>

      <StatRow>
        <StatTile
          value={
            <span className="recap-stat--ideas">{recap.ideasSpotted}</span>
          }
          label={recap.ideasSpotted === 1 ? "idea spotted" : "ideas spotted"}
        />
        <StatTile
          value={<span className="recap-stat--streak">{recap.streak}</span>}
          label="day streak"
        />
        <StatTile
          value={
            <span className="recap-stat--xp">
              {recap.xpToday > 0 ? "+" : ""}
              {recap.xpToday}
            </span>
          }
          label="XP"
        />
      </StatRow>

      {collected.length + lockedCount > 0 && (
        <section className="recap-collection" aria-label="Your idea collection">
          <h2>Your idea collection</h2>
          <ul className="recap-collection__strip">
            {collected.map(({ unitId, level }) => {
              const isNew = newIdeas.has(unitId);
              return (
                <li
                  key={unitId}
                  className={
                    isNew ? "recap-card recap-card--new" : "recap-card"
                  }
                >
                  <img src={level > 1 ? crown : jadeKnight} alt="" />
                  <strong>{unitTitles.get(unitId) ?? unitId}</strong>
                  <small>
                    Lv {level}
                    {isNew && " · New"}
                  </small>
                </li>
              );
            })}
            {Array.from({ length: lockedCount }, (_, index) => (
              <li key={index} className="recap-card recap-card--locked">
                <span aria-hidden="true">?</span>
                <small>Locked</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="recap-actions">
        <Button wide onClick={onPlayGame}>
          Play a game
        </Button>
        <div className="recap-actions__quiet">
          <Button variant="ghost" onClick={onNextMoment}>
            Next moment
          </Button>
          <Button variant="ghost" onClick={onSeeSky}>
            <span aria-hidden="true">✦ </span>See your sky
          </Button>
        </div>
      </div>
    </section>
  );
}
