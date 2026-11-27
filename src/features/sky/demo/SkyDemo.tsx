import { useEffect } from "react";

import type { StarState } from "../../../domain/progress";
import { AppShell } from "../../../shared/navigation/AppShell";
import { Avatar, StreakChip, XpChip } from "../../../shared/ui/primitives";
import { RecapScreen } from "../../recap/RecapScreen";
import { SkyScreen, type SkyScreenProps } from "../SkyScreen";

const stages = [
  {
    stageId: "play-safely",
    title: "Play safely",
    units: [
      { unitId: "read-the-board", title: "Read the board" },
      { unitId: "get-out-of-check", title: "Get out of check" },
      { unitId: "count-captures", title: "Count captures" },
      { unitId: "see-the-threat", title: "See the threat" },
      { unitId: "simple-mates", title: "Simple mates" },
    ],
  },
  {
    stageId: "create-and-answer-threats",
    title: "Create and answer threats",
    units: [
      { unitId: "develop-with-purpose", title: "Develop with purpose" },
      { unitId: "mating-patterns", title: "Back-rank mates" },
      { unitId: "double-attack", title: "Fork" },
      { unitId: "line-tactics", title: "Pins and skewers" },
      { unitId: "open-attack-line", title: "Discoveries" },
      { unitId: "passed-pawn-race", title: "Pawn races" },
    ],
  },
  {
    stageId: "calculate-and-convert",
    title: "Calculate and convert",
    units: [
      { unitId: "calculate-replies", title: "One reply deeper" },
      {
        unitId: "change-the-defender",
        title: "Change what the defender can do",
      },
      { unitId: "test-a-sacrifice", title: "Sacrifices" },
      { unitId: "pawn-ending", title: "Pawn endings" },
      { unitId: "choose-trades", title: "Choose trades" },
    ],
  },
  {
    stageId: "make-a-plan",
    title: "Make a plan",
    units: [
      { unitId: "activate-a-piece", title: "Improve a piece" },
      { unitId: "pawn-breaks", title: "Pawn breaks" },
      { unitId: "king-attack-plan", title: "King attack" },
      { unitId: "rook-ending", title: "Rook endings" },
      { unitId: "opening-structure", title: "Opening structures" },
    ],
  },
] satisfies SkyScreenProps["stages"];

const stars = new Map<string, StarState>([
  ["read-the-board", "shining"],
  ["get-out-of-check", "spotted"],
  ["count-captures", "shining"],
  ["see-the-threat", "missed"],
  ["simple-mates", "spotted"],
  ["develop-with-purpose", "spotted"],
  ["mating-patterns", "shining"],
  ["double-attack", "spotted"],
  ["line-tactics", "missed"],
  ["calculate-replies", "missed"],
  ["pawn-ending", "spotted"],
  ["activate-a-piece", "missed"],
]);

const history = new Map<string, ReturnType<SkyScreenProps["history"]>>([
  [
    "double-attack",
    [
      {
        kind: "spotted",
        at: "2026-11-27T12:00:00Z",
        source: { kind: "game", gameId: "ahmed", ply: 35 },
      },
      {
        kind: "missed",
        at: "2026-11-24T12:00:00Z",
        source: { kind: "game", gameId: "ahmed", ply: 35 },
      },
    ],
  ],
  [
    "mating-patterns",
    [
      {
        kind: "played",
        at: "2026-11-24T12:00:00Z",
        source: { kind: "game", gameId: "ahmed", ply: 57 },
      },
      {
        kind: "spotted",
        at: "2026-11-20T12:00:00Z",
        source: { kind: "puzzle", puzzleId: "back-rank" },
      },
      {
        kind: "missed",
        at: "2026-11-15T12:00:00Z",
        source: { kind: "game", gameId: "sam", ply: 41 },
      },
    ],
  ],
  [
    "line-tactics",
    [
      {
        kind: "missed",
        at: "2026-11-22T12:00:00Z",
        source: { kind: "game", gameId: "lina", ply: 47 },
      },
    ],
  ],
]);

const unitTitles = new Map(
  stages.flatMap(({ units }) =>
    units.map(({ unitId, title }) => [unitId, title] as const),
  ),
);
const state = new URLSearchParams(location.search).get("state") ?? "sky";
const empty = state === "empty";
const recapping = state.startsWith("recap");
const recapEmpty = state === "recap-empty";
const recapReturning = state === "recap-returning";
const full = state === "recap-full";
const goSky = () => {
  location.search = "?state=sky";
};
const stay = () => undefined;
const ideas = [
  { unitId: "mating-patterns", level: 2 },
  { unitId: "double-attack", level: 1 },
  ...(full
    ? [
        { unitId: "develop-with-purpose", level: 2 },
        { unitId: "pawn-ending", level: 3 },
        { unitId: "count-captures", level: 2 },
      ]
    : []),
];

const sheetStar = new Map([
  ["sheet-spotted", "Fork, spotted"],
  ["sheet-shining", "Back-rank mates, shining"],
  ["sheet-missed", "Pins and skewers, missed"],
  ["sheet-not-seen", "Discoveries, not seen"],
]);

export function SkyDemo() {
  useEffect(() => {
    const label = sheetStar.get(state);
    if (!label) return;

    // Deep-link the demo through the same control a player uses.
    const star = document.querySelector<HTMLButtonElement>(
      `.sky-chart button[aria-label="${label}"]`,
    );
    star?.click();
  }, []);

  return recapping ? (
    <AppShell mode={{ kind: "focus", exitLabel: "Close recap", onExit: goSky }}>
      <RecapScreen
        recap={
          recapEmpty
            ? { ideasSpotted: 0, streak: 1, xpToday: 0, newIdeas: [] }
            : {
                ideasSpotted: 1,
                streak: 4,
                xpToday: 35,
                newIdeas: recapReturning ? [] : ["double-attack"],
              }
        }
        ideas={recapEmpty ? [] : ideas}
        unitTitles={unitTitles}
        totalUnits={unitTitles.size}
        rookLine={
          recapEmpty
            ? "Every game has something worth a second look."
            : "You found a fork in your own game. Next time it shows up, you know what to look for."
        }
        onPlayGame={stay}
        onNextMoment={stay}
        onSeeSky={goSky}
      />
    </AppShell>
  ) : (
    <AppShell
      mode={{
        kind: "tabs",
        current: "sky",
        onNavigate: stay,
        start: (
          <>
            <StreakChip days={empty ? 0 : 4} />
            <XpChip xp={empty ? 0 : 375} />
          </>
        ),
        end: <Avatar name="Hyun" />,
      }}
    >
      <SkyScreen
        stages={stages}
        stars={
          empty
            ? new Map()
            : state === "newest-last"
              ? new Map([...stars, ["rook-ending", "spotted"]])
              : stars
        }
        newestStar={
          empty || state === "sky-top"
            ? undefined
            : state === "newest-last"
              ? "rook-ending"
              : "double-attack"
        }
        history={(unitId) => (empty ? [] : (history.get(unitId) ?? []))}
        onLook={stay}
      />
    </AppShell>
  );
}
