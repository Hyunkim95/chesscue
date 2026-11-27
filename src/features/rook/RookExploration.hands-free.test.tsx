import { Chess } from "chess.js";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { withBestMoveReplies } from "../../test/best-move-replies";
import { RookExploration } from "./RookExploration";

const speech = vi.hoisted(() => {
  const state: {
    onMessage: (text: string) => void;
    start: () => Promise<void>;
  } = { onMessage: () => undefined, start: () => Promise.resolve() };
  return state;
});
const start = vi.fn(() => Promise.resolve());

vi.mock("../../shared/rook/use-rook-speech", () => ({
  useRookSpeech: (onMessage: (text: string) => void) => {
    speech.onMessage = onMessage;
    return {
      state: { status: "idle" },
      start: () => {
        void speech.start();
        return Promise.resolve();
      },
      cancel: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

vi.mock("../../infrastructure/ai/rook-exploration-gemini", () => ({
  createRookExplorationCoach: () => ({
    initialize: () => Promise.resolve(),
    ask: () => Promise.resolve(null),
  }),
}));

class Utterance {
  lang = "";
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public readonly text: string) {}
}
const spoken: Utterance[] = [];

beforeEach(() => {
  spoken.length = 0;
  start.mockClear();
  speech.start = start;
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [],
    cancel: vi.fn(),
    speak: (utterance: Utterance) => spoken.push(utterance),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

test("hands-free asks aloud, listens after speaking and sends the answer", async () => {
  const fen = "8/8/8/8/3k3p/8/P3K3/8 w - - 0 1";
  const after = new Chess(fen).move("Kd2").after;
  render(
    <RookExploration
      fen={fen}
      orientation="white"
      puzzle={{ onMove: () => false, source: null }}
      analyzeReply={withBestMoveReplies((position) =>
        Promise.resolve(
          position === fen
            ? { line: ["e2f3"], evaluationCpFromSideToMove: 0 }
            : position === after
              ? {
                  line: ["h4h3", "d2e2", "h3h2"],
                  evaluationCpFromSideToMove: 900,
                }
              : null,
        ),
      )}
    />,
  );
  const toggle = screen.getByRole("button", { name: "Hands-free voice" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("gridcell", { name: /White king on e2/ }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty d2/ }));
  await screen.findByText("What were you trying to do with Kd2?");
  expect(spoken.at(-1)?.text).toBe("What were you trying to do with Kd2?");
  expect(start).not.toHaveBeenCalled();
  act(() => spoken.at(-1)?.onend?.());
  expect(start).toHaveBeenCalledTimes(1);

  act(() => {
    speech.onMessage("I wanted to stop the pawn");
  });
  const log = within(screen.getByRole("log"));
  expect(await log.findByText("I wanted to stop the pawn")).toBeVisible();
  expect(
    await log.findByText((text) => text.startsWith("You played Kd2. ")),
  ).toBeVisible();
  expect(spoken.at(-1)?.text).toMatch(/^You played Kd2\. /);
});
