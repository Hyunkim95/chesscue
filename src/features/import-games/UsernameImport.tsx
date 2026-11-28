import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { GameSite } from "../../extension/external-game";
import {
  fetchRecentGames,
  type RecentGame,
} from "../../extension/recent-games";
import {
  readImportUsernames,
  writeImportUsernames,
  type SavedImportUsernames,
} from "../../infrastructure/persistence/import-usernames";
import { LoadingText } from "../../shared/loading/LoadingState";
import { Button, Pill } from "../../shared/ui/primitives";
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

// Where keyboard focus goes after the saved names change shape.
type FocusTarget =
  | { readonly kind: "field" }
  | { readonly kind: "row"; readonly site: GameSite };

function withoutSite(
  saved: SavedImportUsernames,
  site: GameSite,
): SavedImportUsernames {
  return site === "lichess"
    ? { ...(saved.chesscom ? { chesscom: saved.chesscom } : {}) }
    : { ...(saved.lichess ? { lichess: saved.lichess } : {}) };
}

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
  // The inline list edits one site's name at a time.
  const [editing, setEditing] = useState<GameSite | null>(null);
  const [search, setSearch] = useState<Search>({ kind: "idle" });
  const pendingFocus = useRef<FocusTarget | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const rows = useRef<Record<GameSite, HTMLDivElement | undefined>>({
    lichess: undefined,
    chesscom: undefined,
  });
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (site === undefined) return;
    usernameInput.current?.focus({ preventScroll: true });
    // A saved name is selected so typing replaces it.
    usernameInput.current?.select();
  }, [site]);
  // Runs after every render so focus lands on elements that just appeared.
  useEffect(() => {
    const focusTarget = pendingFocus.current;
    if (focusTarget === null) return;
    pendingFocus.current = null;
    const target =
      focusTarget.kind === "field"
        ? usernameInput.current
        : rows.current[focusTarget.site]?.querySelector<HTMLButtonElement>(
            ".username-account__change",
          );
    target?.focus({ preventScroll: true });
    if (focusTarget.kind === "field") usernameInput.current?.select();
  });

  function focusAfterRender(target: FocusTarget) {
    pendingFocus.current = target;
  }

  const label = site === undefined ? undefined : providerNames[site];
  const busy = search.kind === "loading";
  const listed =
    site === undefined && providers.some((provider) => saved[provider]);

  async function load(selected: GameSite, searchedUsername: string) {
    const signal = lifetime.current?.signal;
    if (!signal || busy) return;
    setSearch({ kind: "loading", site: selected });
    try {
      const games = await fetchRecentGames(selected, searchedUsername, signal);
      signal.throwIfAborted();
      const updated = {
        ...saved,
        ...readImportUsernames(storageKey),
        [selected]: searchedUsername,
      };
      writeImportUsernames(storageKey, updated);
      setSaved(updated);
      setUsername(site === undefined ? "" : searchedUsername);
      if (editing !== null) {
        setEditing(null);
        focusAfterRender({ kind: "row", site: selected });
      }
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

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter =
      event.nativeEvent instanceof SubmitEvent
        ? event.nativeEvent.submitter
        : null;
    const selected =
      editing ??
      (submitter instanceof HTMLButtonElement ? submitter.value : site);
    if (selected !== "lichess" && selected !== "chesscom") return;
    const searchedUsername =
      username.trim() || (editing === null ? saved[selected] : undefined);
    if (searchedUsername) void load(selected, searchedUsername);
  }

  function startEditing(provider: GameSite) {
    setEditing(provider);
    setUsername(saved[provider] ?? "");
    setSearch({ kind: "idle" });
    focusAfterRender({ kind: "field" });
  }

  function stopEditing(provider: GameSite) {
    setEditing(null);
    setUsername("");
    focusAfterRender({ kind: "row", site: provider });
  }

  function forget(provider: GameSite) {
    const updated = withoutSite(
      { ...saved, ...readImportUsernames(storageKey) },
      provider,
    );
    writeImportUsernames(storageKey, updated);
    setSaved(updated);
    setSearch({ kind: "idle" });
    if (site === undefined) {
      setEditing(null);
      setUsername("");
      const stillListed = providers.some((other) => updated[other]);
      focusAfterRender(
        stillListed ? { kind: "row", site: provider } : { kind: "field" },
      );
    } else {
      setUsername("");
      focusAfterRender({ kind: "field" });
    }
  }

  function usernameField(fieldLabel: string) {
    return (
      <label>
        <span>{fieldLabel}</span>
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
    );
  }

  function forgetButton(provider: GameSite) {
    const remembered = saved[provider];
    return (
      remembered && (
        <button
          type="button"
          className="username-import__forget"
          disabled={busy}
          onClick={() => {
            forget(provider);
          }}
        >
          Forget {remembered}
        </button>
      )
    );
  }

  function accountRow(provider: GameSite) {
    const name = providerNames[provider];
    const remembered = saved[provider];
    const loadingHere = search.kind === "loading" && search.site === provider;
    if (editing === provider)
      return (
        <form
          className="username-account username-account--editing"
          role="group"
          aria-label={name}
          key={provider}
          onSubmit={submit}
        >
          {usernameField(`${name} username`)}
          <div className="username-account__edit-actions">
            <Button
              type="submit"
              busy={loadingHere}
              disabled={!username.trim()}
            >
              Import games
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                stopEditing(provider);
              }}
            >
              Cancel
            </Button>
          </div>
          {forgetButton(provider)}
        </form>
      );
    return (
      <div
        className="username-account"
        role="group"
        aria-label={name}
        key={provider}
        ref={(element) => {
          rows.current[provider] = element ?? undefined;
        }}
      >
        <span className="username-account__who">
          <small>{name}</small>
          {remembered ? (
            <b>{remembered}</b>
          ) : (
            <span className="username-account__none">No name yet</span>
          )}
        </span>
        <span className="username-account__actions">
          {remembered && (
            <Pill
              aria-label={`Refresh ${name} games`}
              busy={loadingHere}
              disabled={busy && !loadingHere}
              onClick={() => {
                void load(provider, remembered);
              }}
            >
              Refresh
            </Pill>
          )}
          <Pill
            className="username-account__change"
            aria-label={`${remembered ? "Change" : "Add"} ${name} name`}
            disabled={busy || editing !== null}
            onClick={() => {
              startEditing(provider);
            }}
          >
            {remembered ? "Change" : "Add"}
          </Pill>
        </span>
      </div>
    );
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
      {listed ? (
        <div className="username-accounts">{providers.map(accountRow)}</div>
      ) : (
        <form className="import-panel__form" onSubmit={submit}>
          {usernameField(label ? `${label} username` : "Username")}
          <div className="username-import__buttons">
            {(site === undefined ? providers : [site]).map((provider) => {
              const remembered = saved[provider];
              const entered = username.trim();
              const refreshing =
                remembered !== undefined &&
                (!entered ||
                  entered.toLowerCase() === remembered.toLowerCase());
              const name = providerNames[provider];
              return (
                <div className="username-import__provider" key={provider}>
                  <Button
                    type="submit"
                    value={provider}
                    variant={site === undefined ? "ghost" : "primary"}
                    aria-label={
                      site === undefined
                        ? `Import games from ${name}`
                        : undefined
                    }
                    busy={search.kind === "loading" && search.site === provider}
                    disabled={
                      (!entered && !remembered) ||
                      (search.kind === "loading" && search.site !== provider)
                    }
                  >
                    {site === undefined
                      ? name
                      : refreshing
                        ? "Refresh games"
                        : "Import games"}
                  </Button>
                </div>
              );
            })}
          </div>
          {site !== undefined && forgetButton(site)}
        </form>
      )}
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
