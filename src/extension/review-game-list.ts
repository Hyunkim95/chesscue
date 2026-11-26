import { z } from "zod";
import { tutorGameMode, type GameRecord } from "../domain/game/types";

const isoDay = z.iso.date();
const dayFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC",
});
const momentFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function displayStamp(value: string, imported = false) {
  const order = Date.parse(value);
  if (!Number.isFinite(order))
    return { order: -Infinity, dateTime: undefined, label: "Date unavailable" };
  return {
    order,
    dateTime: value,
    label: (imported ? "Imported " : "") + momentFormat.format(order),
  };
}

function pgnStamp(tags: Map<string, string>, importedAt: string) {
  const utcDay = isoDay.safeParse(
    tags.get("UTCDate")?.replaceAll(".", "-"),
  ).data;
  const utcTime = tags.get("UTCTime");
  if (utcDay && utcTime && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(utcTime))
    return displayStamp(utcDay + "T" + utcTime + "Z");

  const day =
    utcDay ?? isoDay.safeParse(tags.get("Date")?.replaceAll(".", "-")).data;
  if (day) {
    const order = Date.parse(day);
    return { order, dateTime: day, label: dayFormat.format(order) };
  }
  return displayStamp(importedAt, true);
}

export function reviewGameList(games: readonly GameRecord[]) {
  return games
    .flatMap((game) => {
      if (!game.completedAt || !game.result) return [];
      let title: string;
      let stamp = displayStamp(game.completedAt);
      if (game.origin.type === "tutor") {
        const elo =
          game.origin.beginnerOpponent?.target ?? game.origin.opponentElo;
        title =
          (tutorGameMode(game) === "rated" ? "Rated CPU" : "Coached CPU") +
          (elo === undefined ? "" : " · " + String(elo));
      } else {
        // Only read the canonical PGN tag section. Listing history needs no move replay.
        const tagSection = game.pgn.split(/\r?\n\s*\r?\n/, 1)[0] ?? "";
        const tags = new Map<string, string>();
        for (const match of tagSection.matchAll(
          /^\[(White|Black|UTCDate|UTCTime|Date|Event) "(.+)"\]\r?$/gm,
        )) {
          const [, key, raw] = match;
          if (key && raw && raw !== "?")
            tags.set(key, raw.replace(/\\(["\\])/g, "$1"));
        }
        const opponent =
          game.playerColor &&
          tags.get(game.playerColor === "white" ? "Black" : "White");
        title = opponent
          ? "vs. " + opponent
          : (tags.get("Event") ?? "Imported game");
        stamp = pgnStamp(tags, game.completedAt);
      }
      const result =
        game.result === "draw"
          ? "Draw"
          : game.playerColor
            ? game.result === game.playerColor + "-win"
              ? "Win"
              : "Loss"
            : game.result === "white-win"
              ? "White won"
              : "Black won";
      return [{ id: game.id, title, result, stamp }];
    })
    .sort((a, b) => b.stamp.order - a.stamp.order || a.id.localeCompare(b.id));
}
