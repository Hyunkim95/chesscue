// The board-first redesign runs beside the existing screens until its
// journeys pass the same E2E coverage (ENGINEERING.md §17.3 rule 9). It is the
// default in the extension side panel and opt-in on the web.
// ?ui=board-first turns it on for this browser; ?ui=classic turns it off.
const KEY = "chesscue-board-first";
const DEFAULT_ON = import.meta.env.MODE === "extension";

function readFlag(): boolean {
  try {
    const requested = new URLSearchParams(location.search).get("ui");
    if (requested === "board-first") localStorage.setItem(KEY, "1");
    if (requested === "classic") localStorage.setItem(KEY, "0");
    const stored = localStorage.getItem(KEY);
    return stored === null ? DEFAULT_ON : stored === "1";
  } catch {
    return DEFAULT_ON;
  }
}

export const boardFirst = typeof location === "undefined" ? false : readFlag();

export const boardFirstViews = [
  "today",
  "moment",
  "recap",
  "sky",
  "profile",
] as const;

export type BoardFirstView = (typeof boardFirstViews)[number];

export function isBoardFirstView(view: string): view is BoardFirstView {
  return boardFirstViews.some((name) => name === view);
}
