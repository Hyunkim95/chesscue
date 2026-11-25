import { useState, useEffect } from "react";
import type { z } from "zod";
import {
  linkSchema,
  type RaceLink,
} from "../../infrastructure/firebase/race-store";
import type { AccountSession } from "../../infrastructure/firebase/account-session";
export function cached<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    return schema.parse(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return fallback;
  }
}
export function cache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Live standings remain available. */
  }
}
export function useRaceLinks(
  session: AccountSession | null,
  uid: string | null,
) {
  const key = "chesscue-race-links/" + (uid ?? "");
  const [links, setLinks] = useState<RaceLink[]>(() =>
    cached(key, linkSchema.array(), []),
  );
  const [error, setError] = useState(false);
  useEffect(
    () =>
      uid && session
        ? session.races.links(
            uid,
            (rows) => {
              setError(false);
              setLinks(rows);
              cache(key, rows);
            },
            () => {
              setError(true);
            },
          )
        : undefined,
    [uid, session, key],
  );
  return { links, error };
}
