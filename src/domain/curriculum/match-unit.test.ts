import { describe, expect, it } from "vitest";

import { matchUnit, type UnitReference } from "./match-unit";

const references: UnitReference[] = [
  { unitId: "double-attack", facts: ["check", "double-attack"] },
  { unitId: "double-attack", facts: ["double-attack", "wins-material"] },
  { unitId: "count-captures", facts: ["capture-undefended", "wins-material"] },
  { unitId: "count-captures", facts: ["capture-undefended"] },
  { unitId: "mating-patterns", facts: ["check", "mate", "mate-home-rank"] },
];

describe("matchUnit", () => {
  it("chooses the unit whose examples share the observed facts", () => {
    expect(
      matchUnit(["double-attack", "check"], references, 3, 0),
    ).toMatchObject({ status: "matched", unitId: "double-attack" });
    expect(
      matchUnit(["capture-undefended", "wins-material"], references, 3, 0),
    ).toMatchObject({ status: "matched", unitId: "count-captures" });
  });

  it("weights rare facts above common ones", () => {
    // "check" appears in two units, "mate-home-rank" only in one.
    expect(
      matchUnit(["check", "mate-home-rank"], references, 1, 0),
    ).toMatchObject({ status: "matched", unitId: "mating-patterns" });
  });

  it("stays unmatched without shared facts or enough support", () => {
    expect(matchUnit(["quiet"], references)).toEqual({ status: "unmatched" });
    expect(matchUnit(["check"], references, 5, 0.9)).toEqual({
      status: "unmatched",
    });
  });
});
