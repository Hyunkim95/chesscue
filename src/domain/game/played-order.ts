import type { GameRecord } from "./types";

const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const utcTime = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

function tag(pgn: string, name: string): string | undefined {
  // Only the tag section: listing history needs no move replay.
  const section = pgn.split(/\r?\n\s*\r?\n/, 1)[0] ?? "";
  const value = new RegExp(`^\\[${name} "(.+)"\\]\\r?$`, "m").exec(
    section,
  )?.[1];
  return value === undefined || value === "?" ? undefined : value;
}

function day(value: string | undefined): string | undefined {
  const candidate = value?.replaceAll(".", "-");
  return candidate &&
    isoDay.test(candidate) &&
    Number.isFinite(Date.parse(candidate))
    ? candidate
    : undefined;
}

// When a completed game was played, as a sortable number: the PGN's own date
// for an imported game, else when it finished here. Null while unfinished.
// Games and its storage index both order by this, newest first.
export function playedOrder(game: GameRecord): number | null {
  if (!game.completedAt || !game.result) return null;
  if (game.origin.type !== "tutor") {
    const utcDay = day(tag(game.pgn, "UTCDate"));
    const time = tag(game.pgn, "UTCTime");
    if (utcDay && time && utcTime.test(time))
      return Date.parse(utcDay + "T" + time + "Z");
    const playedDay = utcDay ?? day(tag(game.pgn, "Date"));
    if (playedDay) return Date.parse(playedDay);
  }
  const finished = Date.parse(game.completedAt);
  return Number.isFinite(finished) ? finished : -Infinity;
}
