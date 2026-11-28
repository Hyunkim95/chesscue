import {
  IMPORT_USERNAMES_KEY,
  readImportUsernames,
} from "../../infrastructure/persistence/import-usernames";
import type { GameSite } from "../../extension/external-game";
import {
  LoadingState,
  PositionLoading,
} from "../../shared/loading/LoadingState";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  explainWhy,
  type WhyWriter,
} from "../../application/explain-why/explain-why";
import { checkTry } from "../../application/run-moment/check-try";
import { momentRecord } from "../../application/run-moment/moment-record";
import { pickHint } from "../../application/route-question/pick-hint";
import { readDanger } from "../../application/route-question/read-danger";
import { routeNanoFirst } from "../../application/route-question/route-nano-first";
import { routeQuestion } from "../../application/route-question/route-question";
import type { QuestionRouter } from "../../application/route-question/question-router";
import type { WhyInput } from "../../domain/analysis/why-packet";
import type { ObservedMove } from "../../domain/curriculum/game-drill";
import {
  followUpPackSchema,
  type FollowUpPuzzle,
} from "../../domain/curriculum/follow-up-puzzles";
import { readGoodMove } from "../../domain/curriculum/good-moves";
import { canUse } from "../../domain/entitlements";
import { rankForElo, ranks } from "../../domain/game/rank-path";
import { INITIAL_PLAYER_ELO, type RatingEntry } from "../../domain/game/rating";
import { curriculum } from "../../domain/material/installed-curriculum";
import { dayRecap } from "../../domain/progress/day-recap";
import { deriveProgress } from "../../domain/progress/derive-progress";
import { summarizeSkyGames } from "../../domain/progress/sky-game-review";
import type {
  CurriculumStage,
  MomentAttemptRecord,
  ProgressInput,
} from "../../domain/progress/types";
import { unitHistory } from "../../domain/progress/unit-history";
import { puzzleGoal } from "../../domain/session/moment-goal";
import { recommendedPuzzles } from "../../domain/session/recommended-puzzles";
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
import {
  parentPage,
  returnToParent,
} from "../../shared/navigation/history-entry";
import type { TabId } from "../../shared/navigation/TabBar";
import { NetworkPill } from "../../shared/rook/NetworkPill";
import {
  Avatar,
  Pill,
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
import { readBar } from "./read-bar";
import type { PositionInput } from "../../domain/analysis/position-packet";
import type { createOpenQuestionWriter } from "../../infrastructure/ai/reasoning-gemini";
import type { answerOpenQuestion } from "../../application/explain-why/explain-reasoning";
import {
  forgetGeminiKey,
  GEMINI_KEY_CHANGE,
  geminiKey as geminiKeyText,
  readGeminiKey,
  saveGeminiKey,
} from "../../infrastructure/persistence/gemini-key";
import type { GeminiKeySave } from "../../features/profile/GeminiKeySetting";
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

let routerModule:
  | Promise<{
      readonly flash: () => QuestionRouter | undefined;
      readonly device: QuestionRouter | undefined;
    }>
  | undefined;
// Nano is set up once. Flash runs on the player's own key, so it is made per
// question: saving or removing the key applies at once.
async function questionRouters(): Promise<{
  cloud?: QuestionRouter;
  device?: QuestionRouter;
}> {
  routerModule ??= import("../../infrastructure/ai/question-routers").then(
    ({ createFlashQuestionRouter, createNanoQuestionRouter }) => ({
      flash: createFlashQuestionRouter,
      device: createNanoQuestionRouter(),
    }),
  );
  try {
    const { flash, device } = await routerModule;
    const cloud = flash();
    return { ...(cloud ? { cloud } : {}), ...(device ? { device } : {}) };
  } catch {
    routerModule = undefined;
    return {};
  }
}

let whyModule:
  | Promise<{ readonly createFlashWhyWriter: () => WhyWriter | undefined }>
  | undefined;
// Why the solved move is good: Stockfish's searches, Gemini Flash's words on
// the player's own key, then the checker. undefined keeps the code caption.
async function explainWhyOnline(
  input: WhyInput,
  signal: AbortSignal,
): Promise<string | undefined> {
  whyModule ??= import("../../infrastructure/ai/why-gemini");
  const writer = await whyModule
    .then(({ createFlashWhyWriter }) => createFlashWhyWriter())
    .catch(() => {
      // Loading failed, perhaps offline: try again next time.
      whyModule = undefined;
      return undefined;
    });
  if (!writer) return undefined;
  const result = await explainWhy({
    input,
    analyze: analyzePosition,
    writer,
    signal,
  });
  return result.kind === "written" ? result.text : undefined;
}

// Google checks the key before it is kept, so a typo never silently turns
// Rook's online explanations off.
async function saveCheckedGeminiKey(text: string): Promise<GeminiKeySave> {
  const key = geminiKeyText.safeParse(text.trim());
  if (!key.success) return "invalid";
  // Loaded on demand: cloud code stays out of the first screen (SLO-014).
  const { checkGeminiKey } =
    await import("../../infrastructure/ai/player-gemini");
  const check = await checkGeminiKey(key.data, AbortSignal.timeout(10_000));
  if (check.status !== "ok") return check.status;
  return saveGeminiKey(key.data) ? "saved" : "unsaved";
}

let openModules:
  | Promise<
      readonly [
        { readonly createOpenQuestionWriter: typeof createOpenQuestionWriter },
        { readonly answerOpenQuestion: typeof answerOpenQuestion },
      ]
    >
  | undefined;
// An open question while solving: Gemini Flash on the player's own key,
// from checked facts that never name the answer, then the checker.
// undefined keeps Rook's code answer.
async function answerOpenOnline(
  { text, ...input }: { readonly text: string } & PositionInput,
  signal: AbortSignal,
): Promise<string | undefined> {
  openModules ??= Promise.all([
    import("../../infrastructure/ai/reasoning-gemini"),
    import("../../application/explain-why/explain-reasoning"),
  ]);
  try {
    const [writers, reasoning] = await openModules;
    const writer = writers.createOpenQuestionWriter();
    if (!writer) return undefined;
    const result = await reasoning.answerOpenQuestion({
      input,
      question: text,
      frames: [],
      analyze: analyzePosition,
      writer,
      signal,
    });
    return result.kind === "written" ? result.text : undefined;
  } catch {
    openModules = undefined;
    return undefined;
  }
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

// Chances the player took in real games and has since tried from a game's
// replay, so a miss there comes back on Today.
function chancesTried(
  games: readonly ObservedMove[],
  attempts: readonly MomentAttemptRecord[],
): readonly ObservedMove[] {
  const tried = new Set(
    attempts.flatMap(({ source }) =>
      source.kind === "game" ? [`${source.gameId}:${String(source.ply)}`] : [],
    ),
  );
  return games.filter(
    (observed) =>
      observed.outcome === "matched" &&
      tried.has(gameMomentId(observed)) &&
      readGoodMove(observed)?.kind === "tactic",
  );
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
  onOpenAccount,
  onPlay,
  onGames,
  onImport,
  onImportFrom,
  review,
  reviewHome,
}: {
  readonly view: BoardFirstView;
  readonly reviewHome?: ReactNode;
  readonly review?:
    | {
        readonly position: ObservedMove;
        readonly alternateSide: boolean;
        readonly exitLabel: string;
        readonly onExit: () => void;
        readonly onReplay?: () => void;
        readonly onReport?: () => void;
      }
    | undefined;
  readonly navigate: (view: BoardFirstView, path?: string) => void;
  readonly history: PlayerHistory;
  readonly snapshot: SnapshotState;
  readonly ratings: readonly RatingEntry[];
  readonly playerName: string;
  readonly signedIn: boolean;
  readonly onOpenAccount: () => void;
  readonly onPlay: () => void;
  readonly onGames: () => void;
  readonly onImport: () => void;
  readonly onImportFrom: (site: GameSite) => void;
}) {
  const online = useOnline();
  const [attempts, setAttempts] = useState<
    readonly MomentAttemptRecord[] | undefined
  >(() => attemptCache.get(history));
  const [moment, setMoment] = useState<MomentSpec | undefined>();
  // The player's own Gemini key, kept in step with saves from any screen.
  const [geminiKey, setGeminiKey] = useState(readGeminiKey);
  useEffect(() => {
    const update = () => {
      setGeminiKey(readGeminiKey());
    };
    window.addEventListener(GEMINI_KEY_CHANGE, update);
    return () => {
      window.removeEventListener(GEMINI_KEY_CHANGE, update);
    };
  }, []);
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
        chancesTaken: chancesTried(games, attempts ?? []),
        attempts: attempts ?? [],
        puzzles: pack.puzzles,
        stars: progress.stars,
        now: input.now,
        alwaysServe: (moment) =>
          momentFromGame(moment, units)?.danger !== undefined,
      }),
    [games, attempts, progress, input],
  );
  const loading =
    attempts === undefined ||
    (view !== "review-home" && snapshot.status === "checking");
  // Puzzles for you, under Today's position: never today's own puzzle.
  const recommended = useMemo(
    () =>
      recommendedPuzzles({
        puzzles: pack.puzzles,
        attempts: attempts ?? [],
        stars: progress.stars,
        exclude:
          pick.kind === "similar"
            ? pick.puzzleId
            : pick.kind === "warm-up"
              ? warmUp?.id
              : undefined,
      }),
    [attempts, progress, pick],
  );

  const todayMoment = useMemo(
    () =>
      view === "today" && (pick.kind === "new" || pick.kind === "returning")
        ? momentFromGame(pick.moment, units)
        : undefined,
    [pick, view],
  );
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

  function open(target: ObservedMove | FollowUpPuzzle, label?: string) {
    const spec =
      "drill" in target
        ? todayMoment?.id === gameMomentId(target)
          ? todayMoment
          : momentFromGame(target, units)
        : momentFromPuzzle(target, units, label ?? PUZZLE_LABEL);
    if (!spec) return;
    setMoment(spec);
    navigate("moment", momentPath(spec.id));
  }

  // A refresh or a pasted #moment/<id> link reopens the same position once
  // the player's games are read; an unknown id goes back to Today.
  const linked =
    view === "moment" && review === undefined ? linkedMoment() : undefined;
  const opened = moment?.id === linked ? moment : undefined;
  const linkedGame =
    linked !== undefined &&
    opened === undefined &&
    !linked.startsWith("puzzle:")
      ? games.find((entry) => gameMomentId(entry) === linked)
      : undefined;
  const restored = useMemo(() => {
    if (linked === undefined || opened !== undefined) return undefined;
    if (linked.startsWith("puzzle:")) {
      const puzzle = pack.puzzles.find(
        ({ id }) => id === linked.slice("puzzle:".length),
      );
      return puzzle
        ? momentFromPuzzle(
            puzzle,
            units,
            puzzle.id === warmUp?.id ? "Warm-up position" : PUZZLE_LABEL,
          )
        : undefined;
    }
    return linkedGame ? momentFromGame(linkedGame, units) : undefined;
  }, [linked, opened, linkedGame]);
  const unresolved =
    view === "moment" &&
    review === undefined &&
    opened === undefined &&
    restored === undefined &&
    (linked === undefined ||
      linked.startsWith("puzzle:") ||
      snapshot.status !== "checking");
  useEffect(() => {
    if (unresolved) navigate("today");
  }, [unresolved, navigate]);
  const reviewPosition = review?.position;
  const alternateSide = review?.alternateSide ?? false;
  const reviewMoment = useMemo(() => {
    if (reviewPosition === undefined) return undefined;
    const spec = momentFromGame(reviewPosition, units);
    if (!spec || !alternateSide) return spec;
    return {
      ...spec,
      sourceLabel:
        reviewPosition.game.playerColor === "black"
          ? "Reviewing Black’s moves"
          : "Reviewing White’s moves",
    };
  }, [reviewPosition, alternateSide]);
  const active = reviewMoment ?? opened ?? restored;
  // A moment from a game's opening offers that game's opening storyboard.
  const source = active?.source;
  const openingGame =
    source?.kind === "game" && source.ply <= OPENING_PLIES
      ? (reviewPosition?.game ??
        (snapshot.status === "ready"
          ? snapshot.games.find(({ id }) => id === source.gameId)
          : undefined))
      : undefined;
  const opening = useOpeningReview(openingGame);
  const dangers = active?.danger?.facts;

  function playToday() {
    if (pick.kind === "new" || pick.kind === "returning") open(pick.moment);
    else if (pick.kind === "similar") {
      const puzzle = pack.puzzles.find(({ id }) => id === pick.puzzleId);
      if (puzzle) open(puzzle);
    } else if (pick.kind === "warm-up" && warmUp)
      open(warmUp, "Warm-up position");
  }

  function lookAt(source: MomentAttemptRecord["source"]) {
    if (source.kind === "game") {
      const observed = games.find(
        (entry) =>
          gameMomentId(entry) === `${source.gameId}:${String(source.ply)}`,
      );
      if (observed) open(observed);
      return;
    }
    const puzzle = pack.puzzles.find(({ id }) => id === source.puzzleId);
    if (puzzle) open(puzzle);
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
          {!loading && <StreakChip days={progress.streak.current} />}
          {!loading && <XpChip xp={progress.xp} />}
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

  if (view === "moment") {
    const fromSky = parentPage() === "#sky";
    return (
      <AppShell
        mode={{
          kind: "focus",
          exitLabel:
            review?.exitLabel ??
            (fromSky ? "Back to Sky" : "Leave this position"),
          onExit:
            review?.onExit ??
            (() => {
              if (fromSky)
                returnToParent(() => {
                  navigate("sky");
                });
              else navigate("today");
            }),
          top: (
            <>
              {review ? (
                <>
                  {review.onReplay && (
                    <Pill onClick={review.onReplay}>Full replay</Pill>
                  )}
                  {review.onReport && (
                    <Pill onClick={review.onReport}>Full report</Pill>
                  )}
                </>
              ) : (
                <ProgressDots
                  total={progress.dailyGoal.target}
                  done={Math.min(
                    progress.dailyGoal.done,
                    progress.dailyGoal.target,
                  )}
                />
              )}
              <NetworkPill online={online} />
            </>
          ),
        }}
      >
        {active === undefined ? (
          <PositionLoading>Opening your position…</PositionLoading>
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
            explainWhy={explainWhyOnline}
            answerOpen={canUse("open-chat") ? answerOpenOnline : undefined}
            models={{
              nano: nanoReady,
              flash: !online
                ? "offline"
                : geminiKey !== undefined && canUse("open-chat")
                  ? "ready"
                  : "no-key",
            }}
            askFlash={async (question, signal) => {
              const { cloud } = await questionRouters();
              return routeQuestion({
                ...question,
                learnerPlayed: active.playedInGame?.san,
                online,
                cloud,
                device: undefined,
                signal,
              });
            }}
            assessPosition={readBar}
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
            pickHint={
              dangers && nanoReady
                ? async (text, signal) =>
                    pickHint({
                      text,
                      fen: active.fen,
                      router: (await questionRouters()).device,
                      signal,
                    })
                : undefined
            }
            routeVoice={async (context, signal) => {
              const cancelled = () => signal.aborted;
              const { device, cloud } = await questionRouters();
              if (cancelled()) return undefined;
              const choice = await device?.routeVoice?.(context, signal);
              if (choice !== undefined || cancelled()) return choice;
              if (online && canUse("open-chat"))
                return cloud?.routeVoice?.(context, signal);
              return undefined;
            }}
            askRook={async (question, signal) => {
              const available = await questionRouters();
              return routeNanoFirst({
                ...question,
                learnerPlayed: active.playedInGame?.san,
                online,
                cloud: canUse("open-chat") ? available.cloud : undefined,
                device: available.device,
                signal,
              });
            }}
            onComplete={async (result) => {
              const record = momentRecord({
                id: `${active.id}@${new Date().toISOString()}`,
                result,
                source: active.source,
                unitId: active.unitId,
                completedAt: new Date(),
              });
              if (!record) return;
              const saved = await history.moments.add(record);
              if (!saved.ok) throw new Error(saved.error.message);
              const updated = [...(attemptCache.get(history) ?? []), record];
              attemptCache.set(history, updated);
              setAttempts(updated);
              setAttemptsRevision((revision) => revision + 1);
            }}
            onContinue={() => {
              // A moment from a game's replay goes back to the game.
              if (review) review.onExit();
              else navigate("recap");
            }}
            trackProgress={!alternateSide}
            dailyGoal={alternateSide ? undefined : progress.dailyGoal}
            readsAloud={voice}
          />
        )}
      </AppShell>
    );
  }

  if (loading && (view === "sky" || view === "profile" || view === "recap")) {
    const mode =
      view === "recap"
        ? {
            kind: "focus" as const,
            exitLabel: "Back to today",
            onExit: () => {
              navigate("today");
            },
          }
        : tabs(view === "sky" ? "sky" : undefined);
    return (
      <AppShell mode={mode}>
        <LoadingState>
          {view === "sky"
            ? "Opening your sky…"
            : view === "profile"
              ? "Opening your profile…"
              : "Preparing your recap…"}
        </LoadingState>
      </AppShell>
    );
  }

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

  if (view === "sky") {
    const gameReview = summarizeSkyGames(input);
    const seen = new Set(
      input.attempts.flatMap(({ source }) =>
        source.kind === "puzzle" ? [source.puzzleId] : [],
      ),
    );
    const followUp = pack.puzzles.find(
      ({ id, unitId }) => unitId === gameReview.focus?.unitId && !seen.has(id),
    );
    return (
      <AppShell mode={tabs("sky")}>
        <SkyScreen
          stages={skyStages}
          stars={progress.stars}
          newestStar={progress.newestStar}
          history={(unitId) => unitHistory(input, unitId)}
          onLook={lookAt}
          gameReview={gameReview}
          followUp={
            followUp ? { kind: "puzzle", puzzleId: followUp.id } : undefined
          }
        />
      </AppShell>
    );
  }

  if (view === "review-home")
    return <AppShell mode={tabs("games")}>{reviewHome}</AppShell>;

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
          savedUsernames={readImportUsernames(
            history.key(IMPORT_USERNAMES_KEY),
          )}
          syncState={signedIn ? "synced" : "signed-out"}
          onOpenAccount={onOpenAccount}
          onOpenSky={() => {
            navigate("sky");
          }}
          onImportFrom={(site) => {
            onImportFrom(site === "Lichess" ? "lichess" : "chesscom");
          }}
          geminiKey={{
            lastFour: geminiKey?.slice(-4),
            onSave: saveCheckedGeminiKey,
            onRemove: forgetGeminiKey,
          }}
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
        puzzles={loading ? [] : recommended}
        onOpenPuzzle={(id) => {
          const puzzle = pack.puzzles.find((entry) => entry.id === id);
          if (puzzle) open(puzzle);
        }}
      />
    </AppShell>
  );
}
