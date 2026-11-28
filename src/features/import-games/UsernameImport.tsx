import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { GameSite } from "../../extension/external-game";
import {
  fetchRecentGames,
  type RecentGame,
} from "../../extension/recent-games";
import { readImportUsernames } from "../../infrastructure/persistence/import-usernames";
import { LoadingText } from "../../shared/loading/LoadingState";
import { Button } from "../../shared/ui/primitives";
import "./import-games.css";

const providerNames: Readonly<Record<GameSite, string>> = {
  lichess: "Lichess",
  chesscom: "Chess.com",
};
const providers: readonly GameSite[] = ["lichess", "chesscom"];

type Search =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly site: GameSite }
  | { readonly kind: "failed"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly count: number;
      readonly added: number;
    };

export function UsernameImport({
  site,
  storageKey,
  onImport,
}: {
  readonly site?: GameSite | undefined;
  readonly storageKey: string;
  readonly onImport: (
    games: readonly RecentGame[],
    site: GameSite,
  ) => Promise<number>;
}) {
  const [saved, setSaved] = useState(() => readImportUsernames(storageKey));
  const [username, setUsername] = useState(() =>
    site === undefined ? "" : (saved[site] ?? ""),
  );
  const [search, setSearch] = useState<Search>({ kind: "idle" });
  const lifetime = useRef<AbortController | null>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (site !== undefined)
      usernameInput.current?.focus({ preventScroll: true });
  }, [site]);

  const label = site === undefined ? undefined : providerNames[site];
  const busy = search.kind === "loading";

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const signal = lifetime.current?.signal;
    if (!signal || busy) return;
    const submitter =
      event.nativeEvent instanceof SubmitEvent
        ? event.nativeEvent.submitter
        : null;
    const selected =
      submitter instanceof HTMLButtonElement ? submitter.value : site;
    if (selected !== "lichess" && selected !== "chesscom") return;
    const searchedUsername = username.trim() || saved[selected];
    if (!searchedUsername) return;

    setSearch({ kind: "loading", site: selected });
    try {
      const games = await fetchRecentGames(selected, searchedUsername, signal);
      signal.throwIfAborted();
      const updated = {
        ...saved,
        ...readImportUsernames(storageKey),
        [selected]: searchedUsername,
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // The username remains available for this visit.
      }
      setSaved(updated);
      setUsername(site === undefined ? "" : searchedUsername);
      const added = await onImport(games, selected);
      signal.throwIfAborted();
      setSearch({ kind: "ready", count: games.length, added });
    } catch (error) {
      if (!signal.aborted)
        setSearch({
          kind: "failed",
          message:
            error instanceof Error
              ? error.message
              : "Couldn’t load games. Try again.",
        });
    }
  }

  return (
    <section
      className={
        site === undefined
          ? "import-panel username-import--inline"
          : "import-panel"
      }
      aria-labelledby="username-import-title"
    >
      <div className="import-panel__intro">
        <h2 id="username-import-title">
          {label ? `Import from ${label}` : "Import games by username"}
        </h2>
        {label && <p>Load your recent public games into Games.</p>}
      </div>
      <form
        className="import-panel__form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          <span>{label ? `${label} username` : "Username"}</span>
          <input
            ref={usernameInput}
            className="username-import__input"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            maxLength={30}
            disabled={busy}
            onChange={(event) => {
              setUsername(event.currentTarget.value);
              setSearch({ kind: "idle" });
            }}
          />
        </label>
        <div className="username-import__buttons">
          {(site === undefined ? providers : [site]).map((provider) => {
            const remembered = saved[provider];
            const entered = username.trim();
            const refreshing =
              remembered !== undefined &&
              (!entered || entered.toLowerCase() === remembered.toLowerCase());
            const name = providerNames[provider];
            return (
              <div className="username-import__provider" key={provider}>
                <Button
                  type="submit"
                  value={provider}
                  variant={site === undefined ? "ghost" : "primary"}
                  aria-label={
                    site === undefined
                      ? refreshing
                        ? `Refresh ${name} games for ${remembered}`
                        : `Import games from ${name}`
                      : undefined
                  }
                  busy={search.kind === "loading" && search.site === provider}
                  disabled={
                    (!entered && !remembered) ||
                    (search.kind === "loading" && search.site !== provider)
                  }
                >
                  {site === undefined
                    ? refreshing
                      ? `Refresh ${name}`
                      : name
                    : refreshing
                      ? "Refresh games"
                      : "Import games"}
                </Button>
                {site === undefined && remembered && (
                  <small>{remembered}</small>
                )}
              </div>
            );
          })}
        </div>
      </form>
      {search.kind === "loading" && (
        <p role="status">
          <LoadingText>Loading {providerNames[search.site]} games…</LoadingText>
        </p>
      )}
      {search.kind === "failed" && <p role="alert">{search.message}</p>}
      {search.kind === "ready" && (
        <p role="status">
          {search.count === 0
            ? "No recent completed standard chess games found."
            : search.added === 0
              ? "Your games are up to date."
              : `Added ${String(search.added)} ${search.added === 1 ? "game" : "games"}.`}
        </p>
      )}
    </section>
  );
}
