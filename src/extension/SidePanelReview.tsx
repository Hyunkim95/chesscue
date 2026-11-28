import type { GameSite } from "./external-game";
import {
  GameImportSources,
  GamesEmptyIntro,
  type GameSource,
} from "../features/import-games/GamesEmpty";
import {
  LoadingMark,
  LoadingState,
  SkeletonLines,
} from "../shared/loading/LoadingState";
import { EmptyState } from "../shared/empty-state/EmptyState";
import { ScreenHeader } from "../shared/navigation/ScreenHeader";
import { Button, Pill } from "../shared/ui/primitives";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import type { GameId } from "../domain/game/types";
import type {
  CompletedGamePages,
  GameRepository,
} from "../application/ports/game-repository";
import { reviewGameList } from "./review-game-list";
import type { HistoryProgress } from "./game-history";

type Library =
  | { status: "loading" | "failed" }
  | {
      status: "ready";
      games: ReturnType<typeof reviewGameList>;
      // More completed games exist beyond the rows read so far.
      more: boolean;
      // How many rows this read was for.
      rows: number;
    };

const pageContext = z.object({
  finished: z.boolean(),
  player: z
    .string()
    .regex(/^[a-z0-9_-]{2,30}$/i)
    .optional(),
});

type Context =
  | { status: "checking" | "none" | "active" }
  | { status: "finished"; route: string };

async function readActiveGame(): Promise<Context> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined || !tab.url) return { status: "none" };
    const url = new URL(tab.url);
    const gameId =
      url.origin === "https://lichess.org"
        ? /^\/(?:game\/)?([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/.exec(
            url.pathname,
          )?.[1]
        : undefined;
    if (!gameId) return { status: "none" };
    const response: unknown = await chrome.tabs.sendMessage(tab.id, {
      type: "chesscue:lichess-context",
    });
    const context = pageContext.safeParse(response);
    if (!context.success) return { status: "none" };
    if (!context.data.finished) return { status: "active" };
    const player = context.data.player;
    return {
      status: "finished",
      route: "#lichess/" + gameId + (player ? "/" + player.toLowerCase() : ""),
    };
  } catch {
    return { status: "none" };
  }
}

const GAMES_PAGE = 20;
const siteNames: Readonly<Record<GameSite, string>> = {
  lichess: "Lichess",
  chesscom: "Chess.com",
};

function historyLine(
  site: GameSite,
  status: "fetching" | "waiting" | "offline" | "failed",
  fetched: number,
) {
  const name = siteNames[site];
  const count = `${fetched.toLocaleString("en")} ${fetched === 1 ? "game" : "games"} so far`;
  switch (status) {
    case "fetching":
      return fetched === 0
        ? `Fetching your ${name} history…`
        : `Fetching your ${name} history · ${count}`;
    case "waiting":
      return `${name} asked us to slow down. Continuing in a minute · ${count}`;
    case "offline":
      return `${name} history paused while offline · ${count}`;
    case "failed":
      return `Couldn’t reach ${name}. Trying again next visit · ${count}`;
  }
}

export function SidePanelReview({
  boardFirst = false,
  repository,
  watchLichess = true,
  historyRevision,
  openGame,
  openSavedGame,
  importPgn,
  importFrom,
  usernameImport,
  pendingAnalysis,
  momentCounts,
  historyProgress = {},
}: {
  readonly boardFirst?: boolean;
  readonly watchLichess?: boolean;
  readonly repository: GameRepository & CompletedGamePages;
  readonly historyRevision: number;
  readonly openGame: (route: string) => void;
  readonly openSavedGame: (route: string) => void;
  readonly importPgn: () => void;
  readonly importFrom: (site: GameSite) => void;
  readonly usernameImport?: ReactNode;
  readonly pendingAnalysis?: ReadonlySet<GameId>;
  // Board-first: the chances taken and missed that each checked game's
  // replay stops at.
  readonly historyProgress?: HistoryProgress;
  readonly momentCounts?: ReadonlyMap<
    GameId,
    { readonly wins: number; readonly misses: number }
  >;
}) {
  const [context, setContext] = useState<Context>({
    status: watchLichess ? "checking" : "none",
  });

  const [library, setLibrary] = useState<Library>({ status: "loading" });
  // Rows render a page at a time; nearing the end of the list shows more.
  const [visible, setVisible] = useState(GAMES_PAGE);
  const more = useRef<HTMLDivElement>(null);
  const hasMore = library.status === "ready" && library.more;
  // Ask for the next page only once the last one has landed.
  const settled = library.status === "ready" && library.rows === visible;
  useEffect(() => {
    const target = more.current;
    if (!hasMore || !settled || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(({ isIntersecting }) => isIntersecting))
          setVisible((count) => count + GAMES_PAGE);
      },
      { rootMargin: "0px 0px 600px 0px" },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, settled, visible]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    // Reads only the rows to show, newest first, through the storage index;
    // one extra row says whether there are more.
    void repository.listCompletedPage(null, visible + 1).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setLibrary({ status: "failed" });
        return;
      }
      const seen = new Set<string>();
      const unique = result.value.games.filter(({ fingerprint }) => {
        if (fingerprint === null) return true;
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      });
      setLibrary({
        status: "ready",
        games: reviewGameList(unique.slice(0, visible)),
        more: result.value.games.length > visible,
        rows: visible,
      });
    });
    return () => {
      current = false;
    };
  }, [repository, historyRevision, attempt, visible]);

  useEffect(() => {
    if (!watchLichess) return;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void readActiveGame().then((result) => {
        if (request === revision) setContext(result);
      });
    };
    const onMessage = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (
        sender.tab?.active &&
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "chesscue:lichess-context-changed"
      )
        refresh();
    };
    const onTabUpdated = (
      _id: number,
      change: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (tab.active && (change.url || change.status === "complete")) refresh();
    };
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.runtime.onMessage.addListener(onMessage);
    refresh();
    return () => {
      revision++;
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [watchLichess]);

  const showEmpty =
    library.status === "ready" &&
    library.games.length === 0 &&
    context.status === "none";
  const retry = () => {
    setLibrary({ status: "loading" });
    setAttempt((n) => n + 1);
  };
  // Board-first: games waiting for Rook's check can be watched at once; the
  // first in the queue is the one being checked.
  const queue = boardFirst ? [...(pendingAnalysis ?? [])] : [];
  const gameList = library.status === "ready" && library.games.length > 0 && (
    <ol
      className={boardFirst ? "games-history" : "review-history"}
      aria-label="Completed games"
    >
      {library.games.map(({ id, title, result, resultMark, source, stamp }) => {
        const pending = pendingAnalysis?.has(id) ?? false;
        const counts = pending ? undefined : momentCounts?.get(id);
        return (
          <li key={id}>
            <button
              type="button"
              disabled={pending && !boardFirst}
              aria-busy={pending || undefined}
              onClick={() => {
                openSavedGame("#review/" + encodeURIComponent(id));
              }}
            >
              {boardFirst ? (
                <>
                  <span className="games-history__details">
                    <strong title={title}>{title}</strong>
                    <small>
                      {pending ? (
                        queue[0] === id ? (
                          "Checking now · you can watch it"
                        ) : (
                          "Waiting to be checked · you can watch it"
                        )
                      ) : (
                        <>
                          {source}
                          <span aria-hidden="true"> · </span>
                          <time dateTime={stamp.dateTime} title={stamp.label}>
                            {stamp.shortLabel}
                          </time>
                        </>
                      )}
                    </small>
                  </span>
                  <span className="games-history__result" data-result={result}>
                    <span aria-hidden="true">{resultMark}</span>
                    <span className="ui-visually-hidden">{result}</span>
                  </span>
                  {counts && counts.wins + counts.misses > 0 && (
                    <span className="games-history__counts">
                      {counts.wins > 0 && (
                        <span className="games-history__count games-history__count--win">
                          <span aria-hidden="true">★ {counts.wins}</span>
                          <span className="ui-visually-hidden">
                            {counts.wins === 1
                              ? "1 chance taken"
                              : `${String(counts.wins)} chances taken`}
                          </span>
                        </span>
                      )}
                      {counts.misses > 0 && (
                        <span className="games-history__count games-history__count--miss">
                          <span aria-hidden="true">{counts.misses}</span>
                          <span className="ui-visually-hidden">
                            {`${String(counts.misses)} missed`}
                          </span>
                        </span>
                      )}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <strong>{title}</strong>
                  <span className="review-history__result">{result}</span>
                  <time dateTime={stamp.dateTime}>{stamp.label}</time>
                </>
              )}
              {pending && !boardFirst && (
                <span className="games-history__pending">
                  <LoadingMark />
                  <span className="ui-visually-hidden">Analysis pending</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
  const moreGames = hasMore && (
    <div className="games-more" ref={more}>
      <SkeletonLines>Loading more games…</SkeletonLines>
    </div>
  );
  const historyLines = (["lichess", "chesscom"] as const).flatMap((site) => {
    const progress = historyProgress[site];
    if (!progress || progress.status === "done") return [];
    return [
      <p className="games-history-sync" role="status" key={site}>
        {progress.status === "fetching" && <LoadingMark />}
        {historyLine(site, progress.status, progress.fetched)}
      </p>,
    ];
  });
  const loading = library.status === "loading" && (
    <LoadingState shape="list">Loading games…</LoadingState>
  );
  const activeGame = context.status === "active" && (
    <p role="status">Finish your Lichess game to review it with Rook.</p>
  );

  if (boardFirst) {
    function addFrom(source: GameSource) {
      if (source === "pgn") importPgn();
      else importFrom(source === "chess-com" ? "chesscom" : source);
    }

    const importForm = usernameImport && (
      <>
        {usernameImport}
        <div>
          <Pill onClick={importPgn}>Import PGN</Pill>
        </div>
      </>
    );

    return (
      <div className="games-state">
        <h1 className="games-state__title">Your games</h1>
        {showEmpty && <GamesEmptyIntro />}
        {context.status === "finished" && (
          <Button
            wide
            onClick={() => {
              openGame(context.route);
            }}
          >
            Review this Lichess game
          </Button>
        )}
        {importForm ?? <GameImportSources onAdd={addFrom} />}
        {activeGame}
        {loading}
        {historyLines}
        {queue.length > 0 && (
          <p className="games-queue" role="status">
            <LoadingMark />
            {queue.length === 1
              ? "Checking 1 game on your device"
              : `Checking ${String(queue.length)} games on your device`}
          </p>
        )}
        {library.status === "failed" && (
          <div className="games-state__notice">
            <p role="alert">Your saved games could not be loaded.</p>
            <Pill onClick={retry}>Try again</Pill>
          </div>
        )}
        {gameList}
        {moreGames}
      </div>
    );
  }

  const importButton = (
    <button
      type="button"
      className={
        context.status === "finished" ? "review-action" : "primary-link"
      }
      onClick={importPgn}
    >
      Import PGN
    </button>
  );
  return (
    <main className="content-shell side-panel-review">
      <ScreenHeader title="Review" />
      {context.status === "finished" && (
        <button
          type="button"
          className="primary-link"
          onClick={() => {
            openGame(context.route);
          }}
        >
          Review this Lichess game
        </button>
      )}
      {activeGame}
      {showEmpty ? (
        <EmptyState
          art="review"
          title="Review your first game"
          description="Import a completed game to explore its turning point with Rook."
        >
          {importButton}
        </EmptyState>
      ) : (
        importButton
      )}
      {usernameImport ?? (
        <div
          className="username-import__sources"
          aria-label="Import by username"
          role="group"
        >
          <button
            type="button"
            className="review-action"
            onClick={() => {
              importFrom("lichess");
            }}
          >
            Import from Lichess
          </button>
          <button
            type="button"
            className="review-action"
            onClick={() => {
              importFrom("chesscom");
            }}
          >
            Import from Chess.com
          </button>
        </div>
      )}
      {loading}
      {historyLines}
      {library.status === "failed" && (
        <div role="alert">
          <p>Your saved games could not be loaded.</p>
          <button type="button" className="review-action" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {gameList}
      {moreGames}
    </main>
  );
}
