import { starEvidence } from "./stars";
import { completionCalendar, currentStreak } from "./streak";
import type { ProgressInput } from "./types";
import { totalXp } from "./xp";

export function dayRecap(input: ProgressInput): {
  ideasSpotted: number;
  streak: number;
  xpToday: number;
  newIdeas: readonly string[];
} {
  const { today, byDay, localDay } = completionCalendar(input);
  const attemptsToday = byDay.get(today) ?? [];
  const newIdeas: string[] = [];

  for (const [unitId, { spotted, shining }] of starEvidence(input)) {
    const firstLit = Math.min(spotted ?? Infinity, shining ?? Infinity);
    if (Number.isFinite(firstLit) && localDay(firstLit) === today) {
      newIdeas.push(unitId);
    }
  }

  return {
    ideasSpotted: attemptsToday.filter(({ outcome }) => outcome === "spotted")
      .length,
    streak: currentStreak(today, byDay),
    xpToday: totalXp(attemptsToday),
    newIdeas,
  };
}
