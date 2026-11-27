import { LoadingText } from "../shared/loading/LoadingState";
import { EmptyState } from "../shared/empty-state/EmptyState";
import { ScreenHeader } from "../shared/navigation/ScreenHeader";
import { useEffect, useState } from "react";
import { z } from "zod";

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
  repository,
  watchLichess = true,
  historyRevision,
  openGame,
  openSavedGame,
  importPgn,
}: {
  readonly watchLichess?: boolean;
  readonly repository: GameRepository;
  readonly historyRevision: number;
  readonly openGame: (route: string) => void;
  readonly openSavedGame: (route: string) => void;
  readonly importPgn: () => void;
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
      {context.status === "active" && (
        <p role="status">Finish your Lichess game to review it with Rook.</p>
      )}
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
      {library.status === "loading" && (
        <p role="status">
          <LoadingText>Loading games…</LoadingText>
        </p>
      )}
      {library.status === "failed" && (
        <div role="alert">
          <p>Your saved games could not be loaded.</p>
          <button
            type="button"
            className="review-action"
            onClick={() => {
              setLibrary({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {library.status === "ready" &&
        (library.games.length ? (
          <ol className="review-history" aria-label="Completed games">
            {library.games.map(({ id, title, result, stamp }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    openSavedGame("#review/" + encodeURIComponent(id));
                  }}
                >
                  <strong>{title}</strong>
                  <span className="review-history__result">{result}</span>
                  <time dateTime={stamp.dateTime}>{stamp.label}</time>
                </button>
              </li>
            ))}
          </ol>
        ) : null)}
    </main>
  );
}
