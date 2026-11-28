import { describe, expect, it } from "vitest";

import { feedbackTier } from "./feedback-tier";
import {
  advanceSession,
  sessionResult,
  startSession,
  type MomentSession,
  type SessionEvent,
} from "./session";
import type { Attempt } from "./types";

const best: Attempt = { uci: "f3g5", san: "Ng5+", tier: "best" };
const miss: Attempt = {
  uci: "g3f4",
  san: "gxf4",
  tier: "missed",
  replyUci: "f7g8",
};
const worse: Attempt = { uci: "c3b3", san: "Rxb3", tier: "worse" };

function run(...events: SessionEvent[]): MomentSession {
  return events.reduce(advanceSession, startSession);
}

describe("feedbackTier", () => {
  it("follows the design's boundaries", () => {
    expect(feedbackTier({ bestCp: 700, playedCp: 670 })).toBe("best");
    expect(feedbackTier({ bestCp: 700, playedCp: -100 })).toBe("missed");
    expect(feedbackTier({ bestCp: 700, playedCp: -101 })).toBe("worse");
    expect(feedbackTier({ bestCp: 700, playedCp: -400 })).toBe("worse");
    expect(feedbackTier({ bestCp: 700, playedCp: -401 })).toBe("costly");
  });
});

describe("advanceSession", () => {
  it("counts a first-try best move without help as spotted", () => {
    const session = run({ kind: "try", attempt: best }, { kind: "finish" });
    expect(session.state).toEqual({
      kind: "done",
      result: {
        outcome: "spotted",
        helped: false,
        explorations: 1,
        attempts: [best],
      },
    });
  });

  it("moves from tried to second-miss and stays there on further misses", () => {
    expect(run({ kind: "try", attempt: miss }).state.kind).toBe("tried");
    expect(
      run(
        { kind: "try", attempt: miss },
        { kind: "try", attempt: worse },
        { kind: "try", attempt: miss },
      ).state,
    ).toEqual({ kind: "second-miss", attempts: [miss, worse, miss] });
  });

  it("records a solve after a miss as found on retry", () => {
    const session = run(
      { kind: "try", attempt: miss },
      { kind: "try", attempt: best },
    );
    expect(session.state).toMatchObject({ kind: "solved", firstTry: false });
    expect(sessionResult(session)?.outcome).toBe("found-on-retry");
  });

  it("does not count a helped first try as spotted", () => {
    const session = run({ kind: "help" }, { kind: "try", attempt: best });
    expect(sessionResult(session)).toMatchObject({
      outcome: "found-on-retry",
      helped: true,
    });
  });

  it("shows the idea as missed and marks the session helped", () => {
    const session = run({ kind: "try", attempt: miss }, { kind: "show" });
    expect(session.state).toEqual({ kind: "shown", attempts: [miss] });
    expect(sessionResult(session)).toMatchObject({
      outcome: "shown",
      helped: true,
    });
  });

  it("counts distinct explorations and keeps them after solving", () => {
    const session = run(
      { kind: "explore", key: "ask:threats" },
      { kind: "explore", key: "ask:threats" },
      { kind: "try", attempt: best },
      { kind: "explore", key: "preview:e6d7" },
    );
    expect(session.explored).toEqual([
      "ask:threats",
      "try:f3g5",
      "preview:e6d7",
    ]);
  });

  it("ignores events that do not apply", () => {
    expect(run({ kind: "finish" })).toBe(startSession);
    const done = run({ kind: "try", attempt: best }, { kind: "finish" });
    expect(advanceSession(done, { kind: "show" })).toBe(done);
    expect(advanceSession(done, { kind: "help" })).toBe(done);
  });
});
