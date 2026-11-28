import { describe, expect, it, vi } from "vitest";

import cases from "../../domain/analysis/why-packet.fixture.json";
import { whySearches, type WhyInput } from "../../domain/analysis/why-packet";
import { explainWhy, type WhyWriter } from "./explain-why";

const k27 = cases.find(({ id }) => id === "k27");
if (!k27) throw new Error("no case k27");
const input: WhyInput = k27.input;
const searched = new Map(
  whySearches(input).map(({ key, fen }) => [fen, key] as const),
);

// Stockfish as the research run saw it: the stored lines for each search.
const stored = new Map<string, readonly (readonly string[])[]>(
  Object.entries(k27.lines),
);
const analyze = vi.fn((fen: string, multiPv: number) => {
  const lines = stored.get(searched.get(fen) ?? "") ?? [];
  return Promise.resolve({
    ok: true as const,
    value: {
      candidates: lines.slice(0, multiPv).map((line) => ({
        uci: line[0] ?? "",
        evaluationCpFromSideToMove: 0,
        principalVariation: line,
        depth: 14,
      })),
    },
  });
});

const writer = (text: string | undefined): WhyWriter => ({
  model: "Gemini Flash",
  write: () => Promise.resolve(text),
});

describe("explainWhy", () => {
  it("shows checked text", async () => {
    const result = await explainWhy({
      input,
      analyze,
      writer: writer(
        " Qxh4 wins the bishop on h4 for free, because the pawn on g3 is pinned by your rook on g6. ",
      ),
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      kind: "written",
      text: "Qxh4 wins the bishop on h4 for free, because the pawn on g3 is pinned by your rook on g6.",
      model: "Gemini Flash",
    });
  });

  it("asks Stockfish about each search, one at a time", async () => {
    analyze.mockClear();
    await explainWhy({
      input,
      analyze,
      writer: writer("Qxh4 wins the bishop on h4."),
      signal: new AbortController().signal,
    });
    expect(analyze.mock.calls.map(([, multiPv]) => multiPv)).toEqual([1, 3, 1]);
  });

  it("rejects text the packet does not support", async () => {
    const result = await explainWhy({
      input,
      analyze,
      writer: writer("Qxh4 wins the bishop, and the pin is unstoppable."),
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      kind: "not-written",
      reason: "rejected",
      problems: ["unstoppable"],
    });
  });

  it("keeps the caption when the writer has nothing", async () => {
    expect(
      await explainWhy({
        input,
        analyze,
        writer: writer(undefined),
        signal: new AbortController().signal,
      }),
    ).toEqual({ kind: "not-written", reason: "no-text" });
  });

  it("stops when the moment closes", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await explainWhy({
        input,
        analyze,
        writer: writer("Qxh4 wins the bishop on h4."),
        signal: controller.signal,
      }),
    ).toEqual({ kind: "not-written", reason: "cancelled" });
  });
});
