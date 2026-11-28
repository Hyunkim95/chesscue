import { createContext, useContext, useLayoutEffect, useState } from "react";
import { z } from "zod";

// One snapshot per browser history entry. Moves replace that entry. Opening a
// different board pushes an entry so Back returns to the originating screen.
export const HistoryOwner = createContext<string | null>(null);
const entrySchema = z.object({
  owner: z.string(),
  hash: z.string(),
  parents: z.array(z.string()),
  values: z.record(z.string(), z.unknown()),
});
function currentEntry() {
  const parsed = entrySchema.safeParse(window.history.state);
  return parsed.success && parsed.data.hash === location.hash
    ? parsed.data
    : null;
}
export function enterPage(
  hash: string,
  owner: string,
  inherit = false,
  replace = false,
) {
  const current = currentEntry();
  const values =
    inherit && current?.owner === owner ? { ...current.values } : {};
  window.history[replace ? "replaceState" : "pushState"](
    {
      owner,
      hash,
      parents: replace
        ? (current?.parents ?? [])
        : [
            ...(current?.owner === owner ? current.parents.slice(-31) : []),
            location.hash,
          ],
      values,
    },
    "",
    location.pathname + location.search + hash,
  );
}
export function returnToParent(fallback: () => void) {
  if (parentPage() !== undefined) window.history.back();
  else fallback();
}
export function parentPage() {
  return currentEntry()?.parents.at(-1);
}
export function returnToStudyGames(fallback: () => void) {
  const parents = currentEntry()?.parents ?? [];
  const index = parents.findLastIndex(
    (hash) =>
      hash === "#skill-tree" || /^#study\/[^/]+(?:\/games)?$/.test(hash),
  );
  if (index >= 0) window.history.go(index - parents.length);
  else fallback();
}
export const StudySkill = createContext("vision");
export function useStudyNavigation() {
  const skill = useContext(StudySkill);
  const owner = useContext(HistoryOwner);
  return (step: string, replace = false) => {
    if (owner) enterPage("#study/" + skill + "/" + step, owner, true, replace);
  };
}
export function writeEntryValues(
  owner: string,
  values: Record<string, unknown>,
) {
  const entry = currentEntry() ?? {
    owner,
    hash: location.hash,
    parents: [],
    values: {},
  };
  if (entry.owner !== owner) return;
  try {
    window.history.replaceState(
      { ...entry, values: { ...entry.values, ...values } },
      "",
    );
  } catch {
    // Navigation remains available when the browser cannot store view state.
  }
}
export function useEntryState<T>(
  key: string,
  schema: z.ZodType<T>,
  initial: T | (() => T),
  serialize?: (value: T) => unknown,
) {
  const owner = useContext(HistoryOwner);
  const [value, setValue] = useState<T>(() => {
    const entry = currentEntry();
    if (owner && entry?.owner === owner) {
      const raw = entry.values[key];
      if (raw !== undefined) {
        const parsed = schema.safeParse(raw);
        if (parsed.success) return parsed.data;
      }
    }
    return initial instanceof Function ? initial() : initial;
  });
  useLayoutEffect(() => {
    if (owner)
      writeEntryValues(owner, { [key]: serialize ? serialize(value) : value });
  }, [owner, key, value, serialize]);
  return [value, setValue] as const;
}
