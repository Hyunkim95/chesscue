import { Chess } from "chess.js";
import { expect, it } from "vitest";
import {
  advanceLessonChallenge,
  buildLessonChallenge,
  startLessonChallenge,
} from "./lesson-challenge";

it("replays all six versioned lesson plans through learner and opponent turns", () => {
  for (const topic of ["rook", "attack"] as const) {
    for (const index of [0, 1, 2]) {
      const challenge = buildLessonChallenge(topic, index);
      if (!challenge) throw new Error("Missing challenge");
      let state = startLessonChallenge(challenge);
      if (!state) throw new Error("Missing initial position");
      for (const step of challenge.steps) {
        const action =
          state.status === "playing"
            ? { type: "attempt" as const, uci: step.uci }
            : { type: "reply" as const };
        state = advanceLessonChallenge(challenge, state, action);
        expect(state.fen).toBe(step.after);
      }
      expect(state.status).toBe("complete");
      expect(state.fen).toBe(challenge.steps.at(-1)?.after);
    }
  }
  expect(buildLessonChallenge("rook", 3)).toBeNull();
});

it("keeps illegal inputs inert and restores the exact lesson step after a legal alternative", () => {
  const challenge = buildLessonChallenge("rook", 1);
  if (!challenge) throw new Error("Missing challenge");
  const initial = startLessonChallenge(challenge);
  if (!initial) throw new Error("Missing position");
  expect(
    advanceLessonChallenge(challenge, initial, {
      type: "attempt",
      uci: "f3f8",
    }),
  ).toEqual(initial);
  const move = challenge.steps[0];
  if (!move) throw new Error("Missing move");
  const accepted = advanceLessonChallenge(challenge, initial, {
    type: "attempt",
    uci: move.uci,
  });
  expect(accepted.status).toBe("replying");
  expect(
    advanceLessonChallenge(challenge, accepted, {
      type: "attempt",
      uci: "g3h4",
    }),
  ).toEqual(accepted);
  const reply = advanceLessonChallenge(challenge, accepted, { type: "reply" });
  expect(reply.status).toBe(
    challenge.steps.length === 2 ? "complete" : "playing",
  );
  expect(advanceLessonChallenge(challenge, reply, { type: "reply" })).toEqual(
    reply,
  );
  const alternative = new Chess(initial.fen)
    .moves({ verbose: true })
    .find((m) => m.lan !== challenge.steps[0]?.uci);
  if (!alternative) throw new Error("Missing legal alternative");
  const retry = advanceLessonChallenge(challenge, initial, {
    type: "attempt",
    uci: alternative.lan,
  });
  expect(retry.status).toBe("retry");
  expect(
    advanceLessonChallenge(challenge, retry, { type: "retry" }),
  ).toMatchObject({ status: "playing", fen: initial.fen, ply: initial.ply });
});
