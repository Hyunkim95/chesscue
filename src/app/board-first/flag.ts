// The board-first redesign runs beside the existing screens until its
// journeys pass the same E2E coverage (ENGINEERING.md §17.3 rule 9).
// ?ui=board-first turns it on for this browser; ?ui=classic turns it off.
const KEY = "chesscue-board-first";

function readFlag(): boolean {
  try {
    const requested = new URLSearchParams(location.search).get("ui");
    if (requested === "board-first") localStorage.setItem(KEY, "1");
    if (requested === "classic") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
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
