// Matches the board facts of a missed line to the curriculum unit whose
// checked example positions share the most distinctive facts. The units and
// their examples are data, so a new unit or motif needs no code change.
export interface UnitReference {
  readonly unitId: string;
  readonly facts: readonly string[];
}

export type UnitMatch =
  | {
      readonly status: "matched";
      readonly unitId: string;
      readonly support: number;
    }
  | { readonly status: "unmatched" };

export const UNIT_MATCH_NEIGHBOURS = 7;
export const MINIMUM_UNIT_SUPPORT = 0.5;

export function matchUnit(
  facts: readonly string[],
  references: readonly UnitReference[],
  neighbours = UNIT_MATCH_NEIGHBOURS,
  minimumSupport = MINIMUM_UNIT_SUPPORT,
): UnitMatch {
  const frequency = new Map<string, number>();
  for (const reference of references)
    for (const fact of new Set(reference.facts))
      frequency.set(fact, (frequency.get(fact) ?? 0) + 1);
  // Rare facts say more about a unit than facts every example shares.
  const weight = (fact: string) =>
    Math.log((references.length + 1) / ((frequency.get(fact) ?? 0) + 1)) + 1;

  const observed = new Set(facts);
  const scored = references.map(({ unitId, facts: known }) => {
    const example = new Set(known);
    let shared = 0,
      union = 0;
    for (const fact of new Set([...observed, ...example])) {
      const w = weight(fact);
      union += w;
      if (observed.has(fact) && example.has(fact)) shared += w;
    }
    return { unitId, similarity: union === 0 ? 0 : shared / union };
  });
  const nearest = scored
    .toSorted(
      (a, b) => b.similarity - a.similarity || a.unitId.localeCompare(b.unitId),
    )
    .slice(0, neighbours)
    .filter(({ similarity }) => similarity > 0);

  const votes = new Map<string, number>();
  for (const { unitId, similarity } of nearest)
    votes.set(unitId, (votes.get(unitId) ?? 0) + similarity);
  const total = [...votes.values()].reduce((sum, vote) => sum + vote, 0);
  const [winner] = [...votes].toSorted(
    ([leftId, left], [rightId, right]) =>
      right - left || leftId.localeCompare(rightId),
  );
  if (!winner || total === 0) return { status: "unmatched" };
  // Support is the winner's share of the neighbours' combined similarity.
  const support = winner[1] / total;
  return support >= minimumSupport
    ? { status: "matched", unitId: winner[0], support }
    : { status: "unmatched" };
}
