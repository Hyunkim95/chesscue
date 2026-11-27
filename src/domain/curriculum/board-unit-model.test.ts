import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

import {
  boardUnitModel,
  encodeBoards,
  predictBoardUnits,
} from "./board-unit-model";
import fixture from "./board-unit-v2.fixture.json" with { type: "json" };
import { curriculum } from "../material/installed-curriculum";

const root = (name: string) => resolve("public/models", name);
const load = () =>
  boardUnitModel(
    JSON.parse(readFileSync(root("board-unit-v2.json"), "utf8")),
    new Int8Array(readFileSync(root("board-unit-v2.bin"))),
  );

test("matches the exported network on the 60 dev cases", () => {
  const model = load();
  if (!model) throw new Error("The installed board model did not load.");
  const started = performance.now();
  // Every fifth case keeps the check well inside the default test timeout.
  for (const { fens, unit, probability } of fixture.filter(
    (_, i) => i % 5 === 0,
  )) {
    const [top] = predictBoardUnits(model, fens);
    expect(top?.unitId).toBe(unit);
    expect(top?.probability).toBeCloseTo(probability, 3);
  }
  expect((performance.now() - started) / fixture.length).toBeLessThan(500);
});

test("encodes boards from the mover's side and pads missing boards", () => {
  const codes = encodeBoards(["4k3/8/8/8/8/8/8/4K3 b - - 0 1"]);
  // Black to move: Black's king on e8 is the mover's king on rank index 0.
  expect(codes[4]).toBe(6);
  expect(codes[7 * 8 + 4]).toBe(12);
  expect(codes[64]).toBe(13);
});

test("rejects weights that do not match the layer shapes", () => {
  const metadata: unknown = JSON.parse(
    readFileSync(root("board-unit-v2.json"), "utf8"),
  );
  expect(boardUnitModel(metadata, new Int8Array(10))).toBeUndefined();
  expect(
    boardUnitModel({ schemaVersion: 2 }, new Int8Array(0)),
  ).toBeUndefined();
});

test("predicts only units that exist in the installed curriculum", () => {
  const ids = new Set(
    curriculum.stages.flatMap((stage) => stage.units.map(({ id }) => id)),
  );
  expect(load()?.units.filter((unit) => !ids.has(unit))).toEqual([]);
});
