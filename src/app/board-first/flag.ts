// The board-first redesign is the default in the extension side panel and on
// the web (owner decision, 28 November 2026: desktop matches the extension).
// The classic screens stay reachable until their journeys are replaced
// (ENGINEERING.md §17.3 rule 9). ?ui=classic turns board-first off for this
// browser; ?ui=board-first turns it back on.
const KEY = "chesscue-board-first";
const DEFAULT_ON = true;

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
  "review-home",
] as const;

export type BoardFirstView = (typeof boardFirstViews)[number];

export function isBoardFirstView(view: string): view is BoardFirstView {
  return boardFirstViews.some((name) => name === view);
}
