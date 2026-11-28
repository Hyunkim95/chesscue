import type { GameSite } from "./external-game";
import {
  GameImportSources,
  GamesEmptyIntro,
  type GameSource,
} from "../features/import-games/GamesEmpty";
import { LoadingMark, LoadingState } from "../shared/loading/LoadingState";
import { EmptyState } from "../shared/empty-state/EmptyState";
import { ScreenHeader } from "../shared/navigation/ScreenHeader";
import { Button, Pill } from "../shared/ui/primitives";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";

import type { GameId } from "../domain/game/types";
import type { GameRepository } from "../application/ports/game-repository";
import { reviewGameList } from "./review-game-list";

type Library =
  | { status: "loading" | "failed" }
  | { status: "ready"; games: ReturnType<typeof reviewGameList> };

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
}: {
  readonly boardFirst?: boolean;
  readonly watchLichess?: boolean;
  readonly repository: GameRepository;
  readonly historyRevision: number;
  readonly openGame: (route: string) => void;
  readonly openSavedGame: (route: string) => void;
  readonly importPgn: () => void;
  readonly importFrom: (site: GameSite) => void;
  readonly usernameImport?: ReactNode;
  readonly pendingAnalysis?: ReadonlySet<GameId>;
}) {
  const [context, setContext] = useState<Context>({
    status: watchLichess ? "checking" : "none",
  });

  const [library, setLibrary] = useState<Library>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    void repository.listCompleted().then((result) => {
      if (current)
        setLibrary(
          result.ok
            ? { status: "ready", games: reviewGameList(result.value) }
            : { status: "failed" },
        );
    });
    return () => {
      current = false;
    };
  }, [repository, historyRevision, attempt]);

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
  const gameList = library.status === "ready" && library.games.length > 0 && (
    <ol
      className={boardFirst ? "games-history" : "review-history"}
      aria-label="Completed games"
    >
      {library.games.map(({ id, title, result, resultMark, source, stamp }) => {
        const pending = pendingAnalysis?.has(id) ?? false;
        return (
          <li key={id}>
            <button
              type="button"
              disabled={pending}
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
                      {source}
                      <span aria-hidden="true"> · </span>
                      <time dateTime={stamp.dateTime} title={stamp.label}>
                        {stamp.shortLabel}
                      </time>
                    </small>
                  </span>
                  <span className="games-history__result" data-result={result}>
                    <span aria-hidden="true">{resultMark}</span>
                    <span className="ui-visually-hidden">{result}</span>
                  </span>
                </>
              ) : (
                <>
                  <strong>{title}</strong>
                  <span className="review-history__result">{result}</span>
                  <time dateTime={stamp.dateTime}>{stamp.label}</time>
                </>
              )}
              {pending && (
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
  const loading = library.status === "loading" && (
    <LoadingState>Loading games…</LoadingState>
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
        {library.status === "failed" && (
          <div className="games-state__notice">
            <p role="alert">Your saved games could not be loaded.</p>
            <Pill onClick={retry}>Try again</Pill>
          </div>
        )}
        {gameList}
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
      {library.status === "failed" && (
        <div role="alert">
          <p>Your saved games could not be loaded.</p>
          <button type="button" className="review-action" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {gameList}
    </main>
  );
}
