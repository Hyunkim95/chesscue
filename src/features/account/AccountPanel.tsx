import { LoadingText } from "../../shared/loading/LoadingState";
import { BusyButton } from "../../shared/ui/primitives";
import { ScreenHeader } from "../../shared/navigation/ScreenHeader";
import { useEffect, useState, type ReactNode } from "react";
import type {
  AccountIdentity,
  AccountSession,
} from "../../infrastructure/firebase/account-session";
import type { SyncStatus } from "../../application/sync-games/sync-status";
import {
  availableGuestGames,
  copyGuestGames,
  type PlayerHistory,
} from "../../infrastructure/persistence/player-history";
import type { GameRecord } from "../../domain/game/types";

interface Props {
  children: ReactNode;
  user: AccountIdentity | null;
  session: AccountSession | null;
  error: string | null;
  history: PlayerHistory;
  sync: SyncStatus;
  merged: () => void;
}
export function AccountPanel({
  user,
  session,
  error,
  history,
  sync,
  merged,
  children,
}: Props) {
  const [games, setGames] = useState<readonly GameRecord[]>([]);
  // The action whose work is running; its button shows the spinner.
  const [pending, setPending] = useState<
    "sign-in" | "add" | "keep" | "sign-out" | undefined
  >();
  const busy = pending !== undefined;
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (user)
      void availableGuestGames(user.uid)
        .then((records) => {
          const offered = records.filter(
            (game) =>
              !localStorage.getItem(history.key("keep-guest:" + game.id)),
          );
          if (active) setGames(offered);
        })
        .catch(() => {
          if (active)
            setMessage(
              "Guest history could not be read. Reopen Account to try again.",
            );
        });
    return () => {
      active = false;
    };
  }, [user, history]);
  async function act(
    id: NonNullable<typeof pending>,
    action: () => Promise<void> | void,
    failure: string,
  ) {
    setPending(id);
    setMessage("");
    try {
      await action();
    } catch {
      setMessage(failure);
    } finally {
      setPending(undefined);
    }
  }
  const displayName = user?.name?.trim() ?? "";
  const settings = (
    <section className="account-panel play-mode-setup">
      {user === null ? (
        <>
          <h2>Cross-device sync</h2>
          <p>
            Your games are saved in this browser. Sign in to bring your games
            and training progress to another device.
          </p>
          <BusyButton
            className="review-action"
            busy={pending === "sign-in"}
            disabled={!session || (busy && pending !== "sign-in")}
            onClick={() => {
              if (session)
                void act(
                  "sign-in",
                  () => session.signIn(),
                  "Sign-in did not finish. Your guest games are here when you return to Play.",
                );
            }}
          >
            Continue with Google
          </BusyButton>
        </>
      ) : (
        <>
          <h2>Account settings</h2>
          <p>{user.email}</p>
          {games.length > 0 && (
            <section>
              <h2>Add guest history?</h2>
              <p>
                Add {games.length} guest {games.length === 1 ? "game" : "games"}{" "}
                from this browser to {user.email ?? "this account"}. A copy
                stays in guest play.
              </p>
              <div className="account-actions">
                <BusyButton
                  className="primary-link"
                  busy={pending === "add"}
                  disabled={busy && pending !== "add"}
                  onClick={() =>
                    void act(
                      "add",
                      async () => {
                        const failed = await copyGuestGames(history, games);
                        setGames(
                          games.filter((game) => failed.includes(game.id)),
                        );
                        if (failed.length)
                          setMessage(
                            "Some games could not be added. Their guest copies are safe. Retry to add the remaining games.",
                          );
                        merged();
                      },
                      "Could not finish adding games. Your originals are safe. Try again.",
                    )
                  }
                >
                  Add guest games
                </BusyButton>
                <BusyButton
                  className="review-action"
                  busy={pending === "keep"}
                  disabled={busy && pending !== "keep"}
                  onClick={() =>
                    void act(
                      "keep",
                      () => {
                        for (const game of games)
                          localStorage.setItem(
                            history.key("keep-guest:" + game.id),
                            "1",
                          );
                        setGames([]);
                      },
                      "Could not save your choice.",
                    )
                  }
                >
                  Keep guest-only
                </BusyButton>
              </div>
            </section>
          )}
          <section>
            <h2>Sync</h2>
            <p>Games are saved on this device.</p>
            <p role="status">
              {sync.message === "Checking saved games" ||
              sync.message === "Connecting to cloud" ? (
                <LoadingText>{sync.message}</LoadingText>
              ) : (
                sync.message
              )}
            </p>
            {sync.lastAck !== null && (
              <p>Last game synced {new Date(sync.lastAck).toLocaleString()}</p>
            )}
            {sync.pending > 0 && <p>{sync.pending} pending</p>}
            {sync.conflicts.length > 0 && (
              <details>
                <summary>{sync.conflicts.length} conflicting records</summary>
                <ul>
                  {sync.conflicts.map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <BusyButton
            className="review-action"
            busy={pending === "sign-out"}
            disabled={busy && pending !== "sign-out"}
            onClick={() => {
              if (session)
                void act(
                  "sign-out",
                  session.signOut,
                  "Could not sign out. Try again.",
                );
            }}
          >
            Sign out
          </BusyButton>
        </>
      )}
      {user && busy && (
        <p role="status">
          <LoadingText>Updating account…</LoadingText>
        </p>
      )}
      {(message || error) && <p role="alert">{message || error}</p>}
    </section>
  );

  return (
    <main className="content-shell account-home">
      <ScreenHeader
        eyebrow="Player profile"
        title={displayName || (user ? "ChessCue player" : "Guest player")}
      />
      <div className="account-columns">
        {children}
        {settings}
      </div>
    </main>
  );
}
