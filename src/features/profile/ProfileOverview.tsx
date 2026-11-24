import {
  curriculumThemes,
  type PlayerProfile,
} from "../../domain/curriculum/types";

export interface ProfileOverviewProps {
  readonly profile: PlayerProfile;
}

export function ProfileOverview({ profile }: ProfileOverviewProps) {
  return (
    <section aria-labelledby="profile-title">
      <h2 id="profile-title">Your training profile</h2>
      <p>
        Adaptive opponent: {profile.strength.targetElo} Elo. Evidence from{" "}
        {profile.strength.completedTutorGames} tutor games.
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
