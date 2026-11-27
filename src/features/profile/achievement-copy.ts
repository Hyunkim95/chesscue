import type { AchievementId } from "../../domain/progress/types";

export interface AchievementCopy {
  readonly title: string;
  readonly description: string;
  // A single character drawn in the medallion.
  readonly glyph: string;
}

export interface AchievementTitles {
  readonly unitTitles: ReadonlyMap<string, string>;
  readonly stageTitles: ReadonlyMap<string, string>;
}

const UNIT_PREFIX = "first-unit:";
const STAGE_PREFIX = "full-constellation:";

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// Title, one line and glyph for every achievement (design §4).
export function achievementCopy(
  id: AchievementId,
  { unitTitles, stageTitles }: AchievementTitles,
): AchievementCopy {
  if (id.startsWith(UNIT_PREFIX)) {
    const unit = unitTitles.get(id.slice(UNIT_PREFIX.length));
    return {
      title: unit === undefined ? "A new idea" : `First ${lowerFirst(unit)}`,
      description: "Spotted unaided",
      glyph: "♞",
    };
  }
  if (id.startsWith(STAGE_PREFIX)) {
    const stage = stageTitles.get(id.slice(STAGE_PREFIX.length));
    // Named after the stage, so several of them stay distinguishable.
    return stage === undefined
      ? {
          title: "Full constellation",
          description: "Every star in a stage lit",
          glyph: "✶",
        }
      : { title: stage, description: "Every star lit", glyph: "✶" };
  }
  switch (id) {
    case "first-idea":
      return {
        title: "First idea",
        description: "Your first idea spotted",
        glyph: "✦",
      };
    case "played-it":
      return {
        title: "Played it",
        description: "Used an idea in a real game",
        glyph: "♜",
      };
    case "week-one":
      return { title: "Week one", description: "7-day streak", glyph: "🔥" };
    case "collector":
      return { title: "Collector", description: "10 stars lit", glyph: "✧" };
    case "night-owl":
      return {
        title: "Night owl",
        description: "3 positions in one sitting",
        glyph: "☾",
      };
    default:
      return { title: "Achievement", description: "", glyph: "✦" };
  }
}

// Achievements the player can still earn, shown dimmed and locked. "First
// {unit}" ones are left out: there are too many to list before they happen.
export function lockedAchievements(
  earned: readonly AchievementId[],
  stageIds: readonly string[],
): readonly AchievementId[] {
  const candidates: readonly AchievementId[] = [
    "first-idea",
    "played-it",
    "week-one",
    "collector",
    "night-owl",
    ...stageIds.map((stageId): AchievementId => `${STAGE_PREFIX}${stageId}`),
  ];
  const owned = new Set(earned);
  return candidates.filter((id) => !owned.has(id));
}
