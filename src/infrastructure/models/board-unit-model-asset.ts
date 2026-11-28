import {
  boardUnitModel,
  type BoardUnitModel,
} from "../../domain/curriculum/board-unit-model";

// The board model ships with the app under /models and is precached for
// offline use. A missing or malformed asset leaves callers on their
// deterministic fallback.
export const BOARD_UNIT_MODEL = "board-unit-v2";

let loading: Promise<BoardUnitModel | undefined> | undefined;

export function loadBoardUnitModel(): Promise<BoardUnitModel | undefined> {
  loading ??= (async () => {
    const [metadata, weights] = await Promise.all([
      fetch(`/models/${BOARD_UNIT_MODEL}.json`),
      fetch(`/models/${BOARD_UNIT_MODEL}.bin`),
    ]);
    if (!metadata.ok || !weights.ok) return undefined;
    return boardUnitModel(
      (await metadata.json()) as unknown,
      new Int8Array(await weights.arrayBuffer()),
    );
  })().catch(() => undefined);
  const pending = loading;
  // A failed load is retried on the next request instead of being cached.
  void pending.then((model) => {
    if (!model && loading === pending) loading = undefined;
  });
  return pending;
}
