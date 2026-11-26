import { useEffect, useMemo, useState } from "react";
import type {
  AccountIdentity,
  AccountSession,
} from "../../infrastructure/firebase/account-session";
import {
  guestHistory,
  PlayerHistory,
} from "../../infrastructure/persistence/player-history";

export function useRaceAccount(enabled: boolean) {
  const [user, setUser] = useState<AccountIdentity | null>(null);
  const [session, setSession] = useState<AccountSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let stop: (() => void) | undefined;
    void import("../../infrastructure/firebase/account-session")
      .then(({ openAccountSession }) => {
        if (!active) return;
        const access = openAccountSession();
        stop = access.observe((identity) => {
          if (!active) return;
          if (identity) localStorage.setItem("chesscue-auth-used", "1");
          else localStorage.removeItem("chesscue-auth-used");
          setUser(identity);
          setSession(access);
        });
      })
      .catch((e: unknown) => {
        if (active)
          setError(e instanceof Error ? e.message : "Account unavailable.");
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [enabled]);
  const uid = user?.uid ?? null;
  const history = useMemo(
    () => (uid === null ? guestHistory : new PlayerHistory(uid)),
    [uid],
  );
  return { user, session, error, history };
}
