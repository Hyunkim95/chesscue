import {
  parseOpeningBook,
  type OpeningBook,
} from "../../domain/openings/opening-book";

// The opening book is a separate chunk, loaded on first use and precached
// with the app's other scripts for offline use. A missing or malformed book
// leaves callers without an opening review.

let loading: Promise<OpeningBook | undefined> | undefined;

export function loadOpeningBook(): Promise<OpeningBook | undefined> {
  loading ??= import("../../domain/openings/openings.generated.json")
    .then((module) => {
      const parsed = parseOpeningBook(module.default);
      return parsed.ok ? parsed.value : undefined;
    })
    .catch(() => undefined);
  const pending = loading;
  // A failed load is retried on the next request instead of being cached.
  void pending.then((book) => {
    if (!book && loading === pending) loading = undefined;
  });
  return pending;
}
