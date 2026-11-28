import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import type { GameSite } from "../extension/external-game";
import {
  fetchHistoryPage,
  historyCursor,
  startHistory,
  type HistoryCursor,
  type HistoryProgress,
  type SiteHistoryProgress,
} from "../extension/game-history";
import type { RecentGame } from "../extension/recent-games";
import {
  IMPORT_USERNAMES_CHANGED,
  IMPORT_USERNAMES_KEY,
  readImportUsernames,
} from "../infrastructure/persistence/import-usernames";
import type { PlayerHistory } from "../infrastructure/persistence/player-history";

// Each account's newest games are checked by Stockfish straight away. Older
// ones wait until the player opens them, so a long history costs no CPU.
export const CHECKED_ON_IMPORT = 50;
const HISTORY_KEY = "username-history";
const PAGE_DELAY_MS = 1_500;
const RATE_LIMIT_DELAY_MS = 60_000;
const RETRY_DELAY_MS = 30_000;
const REFRESH_EVERY_MS = 15_000;

const storedCursors = z.object({
  lichess: historyCursor.optional(),
  chesscom: historyCursor.optional(),
});
type Cursors = Partial<Record<GameSite, HistoryCursor | undefined>>;

function readCursors(history: PlayerHistory): Cursors {
  try {
    const parsed = storedCursors.safeParse(
      JSON.parse(localStorage.getItem(history.key(HISTORY_KEY)) ?? "{}"),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeCursors(history: PlayerHistory, cursors: Cursors) {
  try {
    localStorage.setItem(history.key(HISTORY_KEY), JSON.stringify(cursors));
  } catch {
    // The walk restarts from the newest games; duplicates are skipped.
  }
}

// Cursors follow the saved usernames: a changed name starts a new walk and a
// forgotten one stops it.
function cursorsForNames(history: PlayerHistory): Cursors {
  const names = readImportUsernames(history.key(IMPORT_USERNAMES_KEY));
  const saved = readCursors(history);
  const cursors: Cursors = {};
  for (const site of ["lichess", "chesscom"] as const) {
    const name = names[site]?.toLowerCase();
    if (!name) continue;
    const cursor = saved[site];
    cursors[site] =
      cursor?.username === name ? cursor : startHistory(site, name);
  }
  return cursors;
}

function progressOf(cursors: Cursors): HistoryProgress {
  const progress: Partial<Record<GameSite, SiteHistoryProgress>> = {};
  for (const cursor of Object.values(cursors))
    if (cursor)
      progress[cursor.site] = {
        fetched: cursor.fetched,
        status: cursor.done ? "done" : "fetching",
      };
  return progress;
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function untilOnline(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (navigator.onLine) {
      resolve();
      return;
    }
    const done = () => {
      window.removeEventListener("online", done);
      resolve();
    };
    window.addEventListener("online", done);
    signal.addEventListener("abort", done, { once: true });
  });
}

// Downloads each saved account's full public history in the background while
// the app is open, and resumes where it stopped after a reload.
export function useHistoryBackfill(
  history: PlayerHistory,
  importPage: (
    games: readonly RecentGame[],
    site: GameSite,
    analyze: (index: number) => boolean,
  ) => Promise<number>,
  refresh: () => void,
): HistoryProgress {
  const [progress, setProgress] = useState<HistoryProgress>(() =>
    progressOf(cursorsForNames(history)),
  );
  const [names, setNames] = useState(0);
  const latest = useRef({ importPage, refresh });
  useEffect(() => {
    latest.current = { importPage, refresh };
  });
  useEffect(() => {
    const changed = () => {
      setNames((n) => n + 1);
    };
    window.addEventListener(IMPORT_USERNAMES_CHANGED, changed);
    return () => {
      window.removeEventListener(IMPORT_USERNAMES_CHANGED, changed);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    // A function, not the property, so each check reads the live value.
    const stopped = () => signal.aborted;
    let cursors = cursorsForNames(history);
    writeCursors(history, cursors);
    // Names can change while mounted; show the new set once this effect runs.
    queueMicrotask(() => {
      if (!stopped()) setProgress(progressOf(cursors));
    });
    let lastRefresh = Date.now();
    let pendingRefresh = false;
    const status = (site: GameSite, next: SiteHistoryProgress) => {
      setProgress((current) => ({ ...current, [site]: next }));
    };
    const flush = (force: boolean) => {
      if (!pendingRefresh) return;
      if (!force && Date.now() - lastRefresh < REFRESH_EVERY_MS) return;
      pendingRefresh = false;
      lastRefresh = Date.now();
      latest.current.refresh();
    };

    async function walk(site: GameSite) {
      for (;;) {
        const cursor = cursors[site];
        if (!cursor || cursor.done || stopped()) return;
        await untilOnline(signal);
        if (stopped()) return;
        status(site, { fetched: cursor.fetched, status: "fetching" });
        try {
          const page = await fetchHistoryPage(cursor, signal);
          const budget = Math.max(0, CHECKED_ON_IMPORT - cursor.fetched);
          const added = await latest.current.importPage(
            page.games,
            site,
            (index) => index < budget,
          );
          if (stopped()) return;
          if (added > 0) pendingRefresh = true;
          cursors = { ...cursors, [site]: page.next };
          writeCursors(history, cursors);
          status(site, {
            fetched: page.next.fetched,
            status: page.next.done ? "done" : "fetching",
          });
          flush(page.next.done);
          await pause(PAGE_DELAY_MS, signal);
        } catch (error) {
          if (stopped()) return;
          const limited =
            error instanceof Error && /rate limit/i.test(error.message);
          if (!navigator.onLine) {
            status(site, { fetched: cursor.fetched, status: "offline" });
          } else if (limited) {
            status(site, { fetched: cursor.fetched, status: "waiting" });
            await pause(RATE_LIMIT_DELAY_MS, signal);
          } else {
            // Try again on the next visit rather than hammering the site.
            status(site, { fetched: cursor.fetched, status: "failed" });
            await pause(RETRY_DELAY_MS, signal);
            return;
          }
        }
      }
    }

    void Promise.all([walk("lichess"), walk("chesscom")]).finally(() => {
      flush(true);
    });
    return () => {
      controller.abort();
      flush(true);
    };
  }, [history, names]);

  return progress;
}
