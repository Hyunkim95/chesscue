import { useEffect, useMemo, useState } from "react";

import { checkTry } from "../../application/run-moment/check-try";
import { momentRecord } from "../../application/run-moment/moment-record";
import { readDanger } from "../../application/route-question/read-danger";
import { routeQuestion } from "../../application/route-question/route-question";
import type { QuestionRouter } from "../../application/route-question/question-router";
import type { ObservedMove } from "../../domain/curriculum/game-drill";
import {
  followUpPackSchema,
  type FollowUpPuzzle,
} from "../../domain/curriculum/follow-up-puzzles";
import { canUse } from "../../domain/entitlements";
import { rankForElo, ranks } from "../../domain/game/rank-path";
import { INITIAL_PLAYER_ELO, type RatingEntry } from "../../domain/game/rating";
import { curriculum } from "../../domain/material/installed-curriculum";
import { dayRecap } from "../../domain/progress/day-recap";
import { deriveProgress } from "../../domain/progress/derive-progress";
import type {
  CurriculumStage,
  MomentAttemptRecord,
  ProgressInput,
} from "../../domain/progress/types";
import { unitHistory } from "../../domain/progress/unit-history";
import { puzzleGoal } from "../../domain/session/moment-goal";
import { pickToday } from "../../domain/session/today";
import {
  MomentScreen,
  type MomentSpec,
} from "../../features/moment/MomentScreen";
import { ProfileScreen } from "../../features/profile/ProfileScreen";
import { rankArt } from "../../features/progression/rank-art";
import { RecapScreen } from "../../features/recap/RecapScreen";
import { SkyScreen } from "../../features/sky/SkyScreen";
import { TodayScreen, type TodayState } from "../../features/today/TodayScreen";
import { detectOnDeviceCapability } from "../../infrastructure/ai/on-device-capability";
import { StockfishAnalysisEngine } from "../../infrastructure/engine/stockfish-analysis-engine";
import type { PlayerHistory } from "../../infrastructure/persistence/player-history";
import { AppShell } from "../../shared/navigation/AppShell";
import type { TabId } from "../../shared/navigation/TabBar";
import { NetworkPill } from "../../shared/rook/NetworkPill";
import {
  Avatar,
  ProgressDots,
  StreakChip,
  XpChip,
} from "../../shared/ui/primitives";
import puzzlePack from "../../../scripts/material/follow-up-puzzles.generated.json" with { type: "json" };
import { useOpeningReview } from "../use-opening-review";
import type { SnapshotState } from "../use-playing-snapshot";
import {
  gameMomentId,
  momentFromGame,
  momentFromPuzzle,
  type UnitCopy,
} from "./moment-specs";
import type { BoardFirstView } from "./flag";
import { serialEngine } from "./serial-engine";

const engine = serialEngine(new StockfishAnalysisEngine());
const pack = followUpPackSchema.parse(puzzlePack);
const stages: readonly CurriculumStage[] = curriculum.stages.map((stage) => ({
  stageId: stage.id,
  unitIds: stage.units.map(({ id }) => id),
}));
const unitTitles: ReadonlyMap<string, string> = new Map(
  curriculum.stages.flatMap(({ units }) =>
    units.map(({ id, title }) => [id, title]),
  ),
);
const units: ReadonlyMap<string, UnitCopy> = new Map(
  curriculum.stages.flatMap((stage) =>
    stage.units.map(({ id, title, goal }) => [id, { title, goal }]),
  ),
);
const stageTitles: ReadonlyMap<string, string> = new Map(
  curriculum.stages.map(({ id, title }) => [id, title]),
);
const skyStages = curriculum.stages.map((stage) => ({
  stageId: stage.id,
  title: stage.title,
  units: stage.units.map(({ id, title }) => ({ unitId: id, title })),
}));
// The first warm-up: the lowest-rated fork in the offline pack.
const warmUp = pack.puzzles
  .filter(({ unitId }) => unitId === "double-attack")
  .toSorted((a, b) => a.rating - b.rating)[0];
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const VOICE_KEY = "chesscue-rook-voice";
// A library puzzle never claims to come from the player's games.
const PUZZLE_LABEL = "Practice puzzle";
// The last attempts read for each player, so a return from a legacy tab shows
// Today at once while the list refreshes behind it.
const attemptCache = new WeakMap<
  PlayerHistory,
  readonly MomentAttemptRecord[]
>();

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

let routers:
  | Promise<{ cloud?: QuestionRouter; device?: QuestionRouter }>
  | undefined;
function questionRouters() {
  routers ??= import("../../infrastructure/ai/question-routers")
    .then(({ createFlashQuestionRouter, createNanoQuestionRouter }) => {
      const cloud = createFlashQuestionRouter();
      const device = createNanoQuestionRouter();
      return { ...(cloud ? { cloud } : {}), ...(device ? { device } : {}) };
    })
    .catch(() => ({}));
  return routers;
}

function analyzePosition(fen: string, multiPv: number, signal: AbortSignal) {
  return engine.analyze({
    fen,
    multiPv,
    depth: 14,
    timeBudgetMs: 2_000,
    signal,
  });
}

function puzzlePrompt(id: string): string {
  const puzzle = pack.puzzles.find((entry) => entry.id === id);
  return puzzle
    ? puzzleGoal(puzzle.fen, puzzle.solution).prompt
    : "Is there something here?";
}

function momentPath(id: string): string {
  return `#moment/${encodeURIComponent(id)}`;
}

function linkedMoment(): string | undefined {
  const [, id] = /^#moment\/(.+)$/.exec(location.hash) ?? [];
  if (id === undefined) return undefined;
  try {
    return decodeURIComponent(id);
  } catch {
    return undefined;
  }
}

async function puzzleMoment(
  puzzle: FollowUpPuzzle,
  sourceLabel: string,
): Promise<MomentSpec | undefined> {
  const analysis = await engine.analyze({
    fen: puzzle.fen,
    multiPv: 1,
    depth: 14,
    timeBudgetMs: 2_000,
    signal: AbortSignal.timeout(8_000),
  });
  const top = analysis.ok ? analysis.value.candidates[0] : undefined;
  return top
    ? momentFromPuzzle(
        puzzle,
        top.evaluationCpFromSideToMove,
        units,
        sourceLabel,
      )
    : undefined;
}

// Plies that count as the opening, as in the game analysis's phases.
const OPENING_PLIES = 20;

export function BoardFirstScreens({
  view,
  navigate,
  history,
  snapshot,
  ratings,
  playerName,
  signedIn,
  onPlay,
  onGames,
  onImport,
}: {
  readonly view: BoardFirstView;
  readonly navigate: (view: BoardFirstView, path?: string) => void;
  readonly history: PlayerHistory;
  readonly snapshot: SnapshotState;
  readonly ratings: readonly RatingEntry[];
  readonly playerName: string;
  readonly signedIn: boolean;
  readonly onPlay: () => void;
  readonly onGames: () => void;
  readonly onImport: () => void;
}) {
  const online = useOnline();
  const [attempts, setAttempts] = useState<
    readonly MomentAttemptRecord[] | undefined
  >(() => attemptCache.get(history));
  const [moment, setMoment] = useState<MomentSpec | "opening" | undefined>();
  const [voice, setVoice] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Spot the danger reads typed words only with a model ready on the device.
  const [nanoReady, setNanoReady] = useState(false);
  useEffect(() => {
    if (view !== "moment") return;
    let live = true;
    void detectOnDeviceCapability().then((capability) => {
      if (live) setNanoReady(capability.status === "available");
    });
    return () => {
      live = false;
    };
  }, [view]);

  const [attemptsRevision, setAttemptsRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void history.moments.listAll().then((listed) => {
      if (!live) return;
      const value = listed.ok ? listed.value : [];
      attemptCache.set(history, value);
      setAttempts(value);
    });
    return () => {
      live = false;
    };
  }, [history, attemptsRevision]);

  const games: readonly ObservedMove[] = useMemo(
    () => (snapshot.status === "ready" ? snapshot.moves : []),
    [snapshot],
  );
  const input: ProgressInput = useMemo(
    () => ({
      attempts: attempts ?? [],
      games,
      curriculum: stages,
      now: new Date(),
      timeZone,
    }),
    [attempts, games],
  );
  const progress = useMemo(() => deriveProgress(input), [input]);
  const pick = useMemo(
    () =>
      pickToday({
        moments: games.filter(({ outcome }) => outcome === "retry"),
        attempts: attempts ?? [],
        puzzles: pack.puzzles,
        stars: progress.stars,
        now: input.now,
      }),
    [games, attempts, progress, input],
  );
  const loading = attempts === undefined || snapshot.status === "checking";

  const todayMoment =
    pick.kind === "new" || pick.kind === "returning"
      ? momentFromGame(pick.moment, units)
      : undefined;
  const todayState: TodayState = loading
    ? { kind: "loading" }
    : pick.kind === "new" || pick.kind === "returning"
      ? {
          kind: "position",
          fen: pick.moment.drill.exercise.fen,
          sourceLabel: todayMoment?.sourceLabel ?? "Your game",
          prompt:
            todayMoment?.danger?.question ??
            todayMoment?.goal.prompt ??
            "Is there something here?",
          returning: pick.kind === "returning",
          origin: "game",
        }
      : pick.kind === "similar"
        ? {
            kind: "position",
            fen: pack.puzzles.find(({ id }) => id === pick.puzzleId)?.fen ?? "",
            sourceLabel: PUZZLE_LABEL,
            prompt: puzzlePrompt(pick.puzzleId),
            returning: false,
            origin: "puzzle",
          }
        : pick.kind === "warm-up" && warmUp
          ? {
              kind: "warm-up",
              fen: warmUp.fen,
              prompt: puzzlePrompt(warmUp.id),
            }
          : { kind: "caught-up" };

  async function open(target: ObservedMove | FollowUpPuzzle, label?: string) {
    setMoment("opening");
    navigate(
      "moment",
      momentPath(
        "drill" in target ? gameMomentId(target) : `puzzle:${target.id}`,
      ),
    );
    const spec =
      "drill" in target
        ? momentFromGame(target, units)
        : await puzzleMoment(target, label ?? PUZZLE_LABEL);
    setMoment(spec);
    if (!spec) navigate("today");
  }

  // A refresh or a pasted #moment/<id> link reopens the same position once
  // the player's games are read; an unknown id goes back to Today.
  const linked =
    view === "moment" && moment === undefined ? linkedMoment() : undefined;
  const restored = useMemo(() => {
    if (linked === undefined || linked.startsWith("puzzle:")) return undefined;
    const observed = games.find((entry) => gameMomentId(entry) === linked);
    return observed ? momentFromGame(observed, units) : undefined;
  }, [linked, games]);
  const unresolved =
    view === "moment" &&
    moment === undefined &&
    restored === undefined &&
    (linked === undefined ||
      (!linked.startsWith("puzzle:") && snapshot.status !== "checking"));
  useEffect(() => {
    if (unresolved) navigate("today");
  }, [unresolved, navigate]);
  useEffect(() => {
    if (moment !== undefined || !linked?.startsWith("puzzle:")) return;
    const id = linked.slice("puzzle:".length);
    const puzzle = pack.puzzles.find((entry) => entry.id === id);
    if (!puzzle) {
      navigate("today");
      return;
    }
    let live = true;
    void puzzleMoment(
      puzzle,
      puzzle.id === warmUp?.id ? "Warm-up position" : PUZZLE_LABEL,
    ).then((spec) => {
      if (live) setMoment(spec);
    });
    return () => {
      live = false;
    };
  }, [linked, moment, navigate]);
  const active = moment ?? restored;
  // A moment from a game's opening offers that game's opening storyboard.
  const source =
    active !== undefined && active !== "opening" ? active.source : undefined;
  const openingGame =
    source?.kind === "game" &&
    source.ply <= OPENING_PLIES &&
    snapshot.status === "ready"
      ? snapshot.games.find(({ id }) => id === source.gameId)
      : undefined;
  const opening = useOpeningReview(openingGame);
  const dangers =
    active !== undefined && active !== "opening"
      ? active.danger?.facts
      : undefined;

  function playToday() {
    if (pick.kind === "new" || pick.kind === "returning")
      void open(pick.moment);
    else if (pick.kind === "similar") {
      const puzzle = pack.puzzles.find(({ id }) => id === pick.puzzleId);
      if (puzzle) void open(puzzle);
    } else if (pick.kind === "warm-up" && warmUp)
      void open(warmUp, "Warm-up position");
  }

  function lookAt(source: MomentAttemptRecord["source"]) {
    if (source.kind === "game") {
      const observed = games.find(
        (entry) =>
          gameMomentId(entry) === `${source.gameId}:${String(source.ply)}`,
      );
      if (observed) void open(observed);
      return;
    }
    const puzzle = pack.puzzles.find(({ id }) => id === source.puzzleId);
    if (puzzle) void open(puzzle);
  }

  const rating = ratings.at(-1)?.after ?? INITIAL_PLAYER_ELO;
  const monthStart = new Date(input.now.getFullYear(), input.now.getMonth(), 1);
  const thisMonth = ratings.filter(
    ({ completedAt }) => new Date(completedAt) >= monthStart,
  );
  const ratingDelta =
    thisMonth.length === 0 ? 0 : rating - (thisMonth[0]?.before ?? rating);
  const rank = rankForElo(rating);
  const next = ranks.find(({ floor }) => floor > rating);

  const tabs = (current: TabId | undefined) =>
    ({
      kind: "tabs",
      current,
      todayWaiting: pick.kind === "new" || pick.kind === "returning",
      onNavigate: (tab: TabId) => {
        if (tab === "play") onPlay();
        else if (tab === "games") onGames();
        else navigate(tab);
      },
      start: (
        <>
          <StreakChip days={progress.streak.current} />
          <XpChip xp={progress.xp} />
        </>
      ),
      end: (
        <Avatar
          name={playerName}
          badgeUrl={rankArt[rank.name]}
          onClick={() => {
            navigate("profile");
          }}
        />
      ),
    }) as const;

  if (view === "moment")
    return (
      <AppShell
        mode={{
          kind: "focus",
          exitLabel: "Leave this position",
          onExit: () => {
            navigate("today");
          },
          top: (
            <>
              <ProgressDots
                total={progress.dailyGoal.target}
                done={Math.min(
                  progress.dailyGoal.done,
                  progress.dailyGoal.target,
                )}
              />
              <NetworkPill online={online} />
            </>
          ),
        }}
      >
        {active === undefined || active === "opening" ? (
          <TodayScreen
            state={{ kind: "loading" }}
            goal={progress.dailyGoal}
            week={progress.week}
            onPlay={() => undefined}
            onImport={onImport}
            onPlayGame={onPlay}
            onSky={() => {
              navigate("sky");
            }}
          />
        ) : (
          <MomentScreen
            key={active.id}
            moment={active}
            online={online}
            openingFrames={
              opening.kind === "ready" ? opening.review.frames : undefined
            }
            checkMove={(uci, signal) =>
              checkTry({ position: active, uci, engine, signal })
            }
            checkFrom={(position, uci, signal) =>
              checkTry({ position, uci, engine, signal })
            }
            analyzePosition={analyzePosition}
            readDanger={
              dangers && nanoReady
                ? async (text, signal) =>
                    readDanger({
                      text,
                      facts: dangers,
                      router: (await questionRouters()).device,
                      signal,
                    })
                : undefined
            }
            askRook={async (question, signal) => {
              const available = await questionRouters();
              return routeQuestion({
                ...question,
                learnerPlayed: active.playedInGame?.san,
                online,
                cloud: canUse("open-chat") ? available.cloud : undefined,
                device: available.device,
                signal,
              });
            }}
            onComplete={(result) => {
              const record = momentRecord({
                id: `${active.id}@${new Date().toISOString()}`,
                result,
                source: active.source,
                unitId: active.unitId,
                completedAt: new Date(),
              });
              if (record)
                void history.moments.add(record).then(() => {
                  setAttemptsRevision((revision) => revision + 1);
                });
            }}
            onContinue={() => {
              navigate("recap");
            }}
            dailyGoal={progress.dailyGoal}
            readsAloud={voice}
          />
        )}
      </AppShell>
    );

  if (view === "recap") {
    const recap = dayRecap(input);
    const fresh = recap.newIdeas[0];
    return (
      <AppShell
        mode={{
          kind: "focus",
          exitLabel: "Back to today",
          onExit: () => {
            navigate("today");
          },
        }}
      >
        <RecapScreen
          recap={recap}
          ideas={progress.ideas}
          unitTitles={unitTitles}
          totalUnits={unitTitles.size}
          rookLine={
            fresh
              ? `You found a ${(unitTitles.get(fresh) ?? "new idea").toLowerCase()} in your own game. Next time it shows up, you'll know what to look for.`
              : "Every position you look at makes the next one easier to see."
          }
          onPlayGame={onPlay}
          onNextMoment={() => {
            navigate("today");
          }}
          onSeeSky={() => {
            navigate("sky");
          }}
        />
      </AppShell>
    );
  }

  if (view === "sky")
    return (
      <AppShell mode={tabs("sky")}>
        <SkyScreen
          stages={skyStages}
          stars={progress.stars}
          newestStar={progress.newestStar}
          history={(unitId) => unitHistory(input, unitId)}
          onLook={lookAt}
        />
      </AppShell>
    );

  if (view === "profile")
    return (
      <AppShell mode={tabs(undefined)}>
        <ProfileScreen
          name={playerName}
          rank={{ name: rank.name, badgeUrl: rankArt[rank.name] }}
          rating={rating}
          ratingDelta={ratingDelta}
          nextRank={
            next ? { name: next.name, ratingNeeded: next.floor } : undefined
          }
          progress={progress}
          unitTitles={unitTitles}
          stageTitles={stageTitles}
          voice={{ enabled: voice, available: "speechSynthesis" in window }}
          onVoiceChange={(enabled) => {
            setVoice(enabled);
            try {
              localStorage.setItem(VOICE_KEY, enabled ? "1" : "0");
            } catch {
              // The setting lasts for this visit.
            }
          }}
          linkedAccounts={[]}
          syncState={signedIn ? "synced" : "signed-out"}
          onOpenSky={() => {
            navigate("sky");
          }}
          onLink={onImport}
        />
      </AppShell>
    );

  return (
    <AppShell mode={tabs("today")}>
      <TodayScreen
        state={todayState}
        goal={progress.dailyGoal}
        week={progress.week}
        onPlay={playToday}
        onImport={onImport}
        onPlayGame={onPlay}
        onSky={() => {
          navigate("sky");
        }}
      />
    </AppShell>
  );
}
