import {
  curriculumThemes,
  type PlayerProfile,
  type EvidenceOrigin,
} from "../../domain/curriculum/types";

export interface ProfileOverviewProps {
  readonly profile: PlayerProfile;
  readonly contributingGames: Readonly<Record<EvidenceOrigin, number>>;
}

export function ProfileOverview({
  profile,
  contributingGames,
}: ProfileOverviewProps) {
  return (
    <section aria-labelledby="profile-title">
      <h2 id="profile-title">Your training profile</h2>
      <p>
        Adaptive opponent: {profile.strength.targetElo} Elo. Evidence from{" "}
        {contributingGames.import} imported{" "}
        {contributingGames.import === 1 ? "game" : "games"} and{" "}
        {contributingGames.tutor} tutor{" "}
        {contributingGames.tutor === 1 ? "game" : "games"}.
      </p>
      <ul>
        {curriculumThemes.map((theme) => {
          const mastery = profile.mastery[theme];
          return (
            <li key={theme}>
              <span>{theme.replaceAll("-", " ")}</span>{" "}
              <span>
                {mastery.status === "unseen"
                  ? "Not observed yet"
                  : `${String(Math.round(mastery.score * 100))}% mastery, ${mastery.status}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
