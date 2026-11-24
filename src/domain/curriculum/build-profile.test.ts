import { describe, expect, it } from "vitest";

import { buildPlayerProfile } from "./build-profile";
import type {
  BuildProfileInput,
  CurriculumEvidence,
  TutorGameOutcome,
} from "./types";

const NOW = "2026-11-24T12:00:00.000Z";

const weakness = (
  overrides: Partial<CurriculumEvidence> = {},
): CurriculumEvidence => ({
  id: "evidence-1",
  theme: "hanging-piece",
  origin: "tutor",
  outcome: "weakness",
  impact: 0.9,
  confidence: 0.9,
  occurredAt: "2026-11-23T12:00:00.000Z",
  phase: "middlegame",
  sourceGameId: "game-1",
  ...overrides,
});

const game = (
  id: string,
  score: 0 | 0.5 | 1,
  day: number,
): TutorGameOutcome => ({
  id,
  score,
  completedAt: `2026-11-${String(day).padStart(2, "0")}T12:00:00.000Z`,
});

const input = (
  overrides: Partial<BuildProfileInput> = {},
): BuildProfileInput => ({
  initialTargetElo: 1200,
  curriculumVersion: "1.0.0",
  computedAt: NOW,
  evidence: [],
  tutorGames: [],
  ...overrides,
});

describe("buildPlayerProfile", () => {
  it("uses imported evidence to choose focus without changing target Elo", () => {
    const importedEvidence = [
      weakness({ id: "import-1", origin: "import" }),
      weakness({ id: "import-2", origin: "import", sourceGameId: "game-2" }),
      weakness({ id: "import-3", origin: "import", sourceGameId: "game-3" }),
    ];
    const withoutImports = buildPlayerProfile(input());
    const withImports = buildPlayerProfile(
      input({ evidence: importedEvidence }),
    );

    expect(withImports.nextGame.focus).toBe("hanging-piece");
    expect(withImports.mastery["hanging-piece"].evidenceCount).toBe(3);
    expect(withImports.strength.targetElo).toBe(
      withoutImports.strength.targetElo,
    );
  });

  it("changes Elo only after a complete three-game tutor window", () => {
    const twoWins = buildPlayerProfile(
      input({ tutorGames: [game("one", 1, 20), game("two", 1, 21)] }),
    );
    const threeWins = buildPlayerProfile(
      input({
        tutorGames: [
          game("one", 1, 20),
          game("two", 1, 21),
          game("three", 1, 22),
        ],
      }),
    );

    expect(twoWins.strength.targetElo).toBe(1200);
    expect(threeWins.strength.targetElo).toBe(1250);
  });

  it("limits every window adjustment to 50 Elo and applies complete windows", () => {
    const tutorGames = [
      game("one", 0, 10),
      game("two", 0, 11),
      game("three", 0, 12),
      game("four", 1, 13),
      game("five", 1, 14),
      game("six", 1, 15),
    ];
    expect(buildPlayerProfile(input({ tutorGames })).strength.targetElo).toBe(
      1200,
    );
  });

  it("is deterministic when evidence input order changes", () => {
    const evidence = [
      weakness({ id: "b", theme: "king-safety" }),
      weakness({ id: "a", theme: "hanging-piece" }),
    ];
    const forward = buildPlayerProfile(input({ evidence }));
    const reverse = buildPlayerProfile(
      input({ evidence: evidence.toReversed() }),
    );
    expect(reverse).toEqual(forward);
  });
});
