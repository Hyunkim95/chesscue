import jadeArt from "../../../assets/brand/rank-jade.webp";
import crownArt from "../../../assets/brand/rank-crown.webp";
import type { Progress } from "../../../domain/progress/types";
import type { ProfileScreenProps } from "../ProfileScreen";

// Fixture props for the demo page and the tests, built from the frozen
// Progress contract.
export const unitTitles: ReadonlyMap<string, string> = new Map([
  ["fork", "Fork"],
  ["back-rank", "Back rank"],
  ["pin", "Pin"],
]);

export const stageTitles: ReadonlyMap<string, string> = new Map([
  ["play-safely", "Play safely"],
  ["double-attacks", "Double attacks"],
  ["king-hunts", "King hunts"],
]);

const week = [
  "2026-11-21",
  "2026-11-22",
  "2026-11-23",
  "2026-11-24",
  "2026-11-25",
  "2026-11-26",
  "2026-11-27",
].map((date, index) => ({ date, done: index >= 3 }));

export const activeProgress: Progress = {
  xp: 375,
  level: 4,
  streak: { current: 4, best: 9 },
  dailyGoal: { done: 1, target: 3 },
  week,
  stars: new Map([
    ["fork", "shining"],
    ["back-rank", "spotted"],
    ["pin", "missed"],
  ]),
  newestStar: "back-rank",
  achievements: ["first-idea", "first-unit:fork", "played-it", "week-one"],
  ideas: [
    { unitId: "back-rank", level: 1 },
    { unitId: "fork", level: 2 },
  ],
};

export const newProgress: Progress = {
  xp: 0,
  level: 1,
  streak: { current: 0, best: 0 },
  dailyGoal: { done: 0, target: 3 },
  week: week.map(({ date }) => ({ date, done: false })),
  stars: new Map(),
  newestStar: undefined,
  achievements: [],
  ideas: [],
};

const noop = () => undefined;

export const activeProfile: ProfileScreenProps = {
  name: "Hyun",
  rank: { name: "Jade", badgeUrl: jadeArt },
  rating: 1240,
  ratingDelta: 38,
  nextRank: { name: "Sapphire", ratingNeeded: 1350 },
  progress: activeProgress,
  unitTitles,
  stageTitles,
  voice: { enabled: true, available: true },
  onVoiceChange: noop,
  savedUsernames: { lichess: "hyunplays" },
  syncState: "synced",
  onOpenAccount: () => undefined,
  onOpenSky: noop,
  onImportFrom: noop,
  geminiKey: {
    lastFour: undefined,
    onSave: () => Promise.resolve("saved"),
    onRemove: noop,
  },
};

export const newProfile: ProfileScreenProps = {
  ...activeProfile,
  rating: 1150,
  ratingDelta: 0,
  progress: newProgress,
  voice: { enabled: false, available: false },
  savedUsernames: {},
  syncState: "signed-out",
};

export const topProfile: ProfileScreenProps = {
  ...activeProfile,
  name: "Alexandra Konstantinopoulou",
  rank: { name: "Crown", badgeUrl: crownArt },
  rating: 1812,
  ratingDelta: -12,
  nextRank: undefined,
  progress: {
    ...activeProgress,
    xp: 2140,
    level: 22,
    streak: { current: 12, best: 30 },
    achievements: [
      "first-idea",
      "first-unit:fork",
      "first-unit:back-rank",
      "first-unit:pin",
      "played-it",
      "week-one",
      "collector",
      "full-constellation:double-attacks",
      "night-owl",
    ],
  },
  savedUsernames: {
    lichess: "alexandra_k",
    chesscom: "AlexandraKonstantinopoulou",
  },
  syncState: "error",
};
