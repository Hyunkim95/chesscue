import { useEffect, useMemo, useState } from "react";

import { checkTry } from "../../application/run-moment/check-try";
import { momentRecord } from "../../application/run-moment/moment-record";
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
import type { SnapshotState } from "../use-playing-snapshot";
import { gameMomentId, momentFromGame, momentFromPuzzle } from "./moment-specs";
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
        unitTitles,
        sourceLabel,
      )
    : undefined;
}

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
  readonly navigate: (view: BoardFirstView) => void;
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
  >();
  const [moment, setMoment] = useState<MomentSpec | "opening" | undefined>();
  const [voice, setVoice] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [attemptsRevision, setAttemptsRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void history.moments.listAll().then((listed) => {
      if (live) setAttempts(listed.ok ? listed.value : []);
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

  const todayState: TodayState = loading
    ? { kind: "loading" }
    : pick.kind === "new" || pick.kind === "returning"
      ? {
          kind: "position",
          fen: pick.moment.drill.exercise.fen,
          sourceLabel:
            momentFromGame(pick.moment, unitTitles)?.sourceLabel ?? "Your game",
          returning: pick.kind === "returning",
        }
      : pick.kind === "similar"
        ? {
            kind: "position",
            fen: pack.puzzles.find(({ id }) => id === pick.puzzleId)?.fen ?? "",
            sourceLabel: "A position like ones from your games",
            returning: false,
          }
        : pick.kind === "warm-up" && warmUp
          ? { kind: "warm-up", fen: warmUp.fen }
          : { kind: "caught-up" };

  async function open(target: ObservedMove | FollowUpPuzzle, label?: string) {
    setMoment("opening");
    navigate("moment");
    const spec =
      "drill" in target
        ? momentFromGame(target, unitTitles)
        : await puzzleMoment(
            target,
            label ?? "A position like ones from your games",
          );
    setMoment(spec);
    if (!spec) navigate("today");
  }

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
        {moment === undefined || moment === "opening" ? (
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
            key={moment.id}
            moment={moment}
            online={online}
            checkMove={(uci, signal) =>
              checkTry({ position: moment, uci, engine, signal })
            }
            askRook={async (question, signal) => {
              const available = await questionRouters();
              return routeQuestion({
                ...question,
                learnerPlayed: moment.playedInGame?.san,
                online,
                cloud: canUse("open-chat") ? available.cloud : undefined,
                device: available.device,
                signal,
              });
            }}
            onComplete={(result) => {
              const record = momentRecord({
                id: `${moment.id}@${new Date().toISOString()}`,
                result,
                source: moment.source,
                unitId: moment.unitId,
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
