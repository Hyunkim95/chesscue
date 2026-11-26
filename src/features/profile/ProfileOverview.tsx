import {
  curriculumThemes,
  type CurriculumTheme,
  type EvidenceOrigin,
  type PlayerProfile,
} from "../../domain/curriculum/types";
import "./profile-overview.css";

const emblems: Record<CurriculumTheme, string> = {
  "hanging-piece": "♞",
  "one-move-threat": "♜",
  "central-pawn-tension": "♟",
  "king-safety": "♚",
  development: "♝",
  calculation: "✦",
  "endgame-technique": "♔",
  other: "◇",
};

export interface ProfileOverviewProps {
  readonly profile: PlayerProfile;
  readonly contributingGames: Readonly<Record<EvidenceOrigin, number>>;
}

export function ProfileOverview({
  profile,
  contributingGames,
}: ProfileOverviewProps) {
  const discovered = curriculumThemes
    .map((theme) => profile.mastery[theme])
    .filter(({ evidenceCount }) => evidenceCount > 0)
    .toSorted((a, b) => b.evidenceCount - a.evidenceCount);
  return (
    <section className="profile-overview" aria-labelledby="profile-title">
      <h2 id="profile-title">Your training profile</h2>
      <p>
        Evidence from {contributingGames.import} imported{" "}
        {contributingGames.import === 1 ? "game" : "games"} and{" "}
        {contributingGames.tutor} tutor{" "}
        {contributingGames.tutor === 1 ? "game" : "games"}.
      </p>
      {discovered.length === 0 ? (
        <p className="profile-overview__empty">
          Your first skill cards appear after ChessCue observes your play.
        </p>
      ) : (
        <ul>
          {discovered.map((mastery) => {
            const { theme, evidenceCount, score, status } = mastery;
            const label =
              theme === "other"
                ? "Other positions"
                : theme.replaceAll("-", " ");
            const percentage = Math.round(score * 100);
            return (
              <li className="profile-skill" key={theme}>
                <span className="profile-skill__emblem" aria-hidden="true">
                  {emblems[theme]}
                </span>
                <strong>{label}</strong>
                <meter
                  min={0}
                  max={100}
                  value={percentage}
                  aria-label={`${label} observed score`}
                />
                <small>{percentage}% observed score</small>
                <small>
                  {evidenceCount}{" "}
                  {evidenceCount === 1 ? "observation" : "observations"}
                  {status === "emerging" && " · Early evidence"}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
