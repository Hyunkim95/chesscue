import {
  matchingScores,
  playerArchives,
  type GameLocator,
} from "../../domain/study/historical-game";

const MAX_BYTES = 12 * 1024 * 1024;
async function readArchive(response: Response) {
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length")) > MAX_BYTES
  )
    return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function findArchivedGame(game: GameLocator, signal: AbortSignal) {
  for (const scoreUrl of playerArchives(game)) {
    try {
      const response = await fetch(scoreUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
        credentials: "omit",
        redirect: "error",
      });
      const text = await readArchive(response);
      const scores = text ? matchingScores(text, game) : [];
      if (scores.length) return { scores, scoreUrl };
    } catch {
      signal.throwIfAborted();
    }
  }
  return null;
}
