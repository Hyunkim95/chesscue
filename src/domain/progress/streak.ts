import type { MomentAttemptRecord, ProgressInput } from "./types";

const DAY_MS = 86_400_000;

export function completionCalendar({ attempts, now, timeZone }: ProgressInput) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone });

  // Use UTC day numbers for local calendar dates so DST cannot skip or repeat a day.
  const localDay = (instant: Date | number) =>
    Date.parse(formatter.format(instant)) / DAY_MS;
  const byDay = new Map<number, MomentAttemptRecord[]>();
  for (const attempt of attempts) {
    const day = localDay(Date.parse(attempt.completedAt));
    const records = byDay.get(day) ?? [];
    records.push(attempt);
    byDay.set(day, records);
  }

  return { today: localDay(now), byDay, localDay };
}

export function currentStreak(
  today: number,
  byDay: ReadonlyMap<number, readonly MomentAttemptRecord[]>,
): number {
  let day = byDay.has(today) ? today : today - 1;
  let current = 0;
  while (byDay.has(day)) {
    current += 1;
    day -= 1;
  }
  return current;
}

export function bestStreak(
  byDay: ReadonlyMap<number, readonly MomentAttemptRecord[]>,
): number {
  let best = 0;
  let run = 0;
  let previous = -Infinity;

  for (const day of [...byDay.keys()].sort((first, second) => first - second)) {
    run = day === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

export function weekEnding(
  today: number,
  byDay: ReadonlyMap<number, readonly MomentAttemptRecord[]>,
) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = today - 6 + index;
    return {
      date: new Date(day * DAY_MS).toISOString().slice(0, 10),
      done: byDay.has(day),
    };
  });
}
