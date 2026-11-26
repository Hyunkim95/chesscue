import { useState, useEffect, useMemo } from "react";
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
  const cachedLinks = useMemo(() => cached(key, linkSchema.array(), []), [key]);
  const [result, setResult] = useState<{
    key: string;
    links: RaceLink[];
    status: "ready" | "failed";
  }>();
  useEffect(
    () =>
      uid && session
        ? session.races.links(
            uid,
            (links) => {
              setResult({ key, links, status: "ready" });
              cache(key, links);
            },
            () => {
              setResult({
                key,
                links: cached(key, linkSchema.array(), []),
                status: "failed",
              });
            },
          )
        : undefined,
    [uid, session, key],
  );
  const current = result?.key === key ? result : undefined;
  return {
    links: current?.links ?? cachedLinks,
    error: current?.status === "failed",
    loaded: current?.status === "ready",
  };
}
