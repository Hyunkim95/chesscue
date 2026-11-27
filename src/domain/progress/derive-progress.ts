import { earnedAchievements } from "./achievements";
import { ideaCollection } from "./collection";
import { deriveStars } from "./stars";
import {
  bestStreak,
  completionCalendar,
  currentStreak,
  weekEnding,
} from "./streak";
import {
  DAILY_GOAL,
  XP_PER_LEVEL,
  type Progress,
  type ProgressInput,
} from "./types";
import { totalXp } from "./xp";

export function deriveProgress(input: ProgressInput): Progress {
  const { attempts, games, curriculum } = input;
  const { today, byDay } = completionCalendar(input);
  const xp = totalXp(attempts);
  const best = bestStreak(byDay);
  const { stars, newestStar } = deriveStars(input);

  return {
    xp,
    level: Math.floor(xp / XP_PER_LEVEL) + 1,
    streak: { current: currentStreak(today, byDay), best },
    dailyGoal: { done: byDay.get(today)?.length ?? 0, target: DAILY_GOAL },
    week: weekEnding(today, byDay),
    stars,
    newestStar,
    achievements: earnedAchievements({
      attempts,
      stars,
      streakBest: best,
      curriculum,
    }),
    ideas: ideaCollection({ attempts, games, stars }),
  };
}
