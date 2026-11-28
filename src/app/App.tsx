import { IMPORT_USERNAMES_KEY } from "../infrastructure/persistence/import-usernames";
import { GameModeChoices } from "../features/play/GameModeChoices";
import { TrainingAnalysisStatus } from "../features/progression/PlayingSnapshot";
import type { Skill } from "../features/progression/SkillTree";
import { usesExtensionGoogleSignIn } from "../infrastructure/firebase/extension-google";
import { HostedRaces } from "../features/race/HostedRaces";
import { BoardBackControl } from "../shared/navigation/BoardBack";
import { BoardBackSlot } from "../shared/navigation/board-back-slot";
import { isSidePanel as extensionPanel } from "../shared/navigation/side-panel";
import {
  LoadingMark,
  LoadingState,
  LoadingText,
  PositionLoading,
  SkeletonLines,
} from "../shared/loading/LoadingState";
import {
  PanelTabs,
  type PanelDestination,
} from "../shared/navigation/PanelTabs";
import { ScreenHeader } from "../shared/navigation/ScreenHeader";
import type { CurriculumUnit } from "../domain/material/curriculum";
import type { LibraryPuzzle } from "../domain/material/puzzle-library";
import {
  queueSubmittedGames,
  startSubmissionSync,
} from "../infrastructure/persistence/submitted-games";
import { starterPack } from "../domain/material/pack";
import {
  cueRecordSchema,
  type AuthoredCue,
  exerciseSchema,
} from "../domain/material/verified";
import {
  reflectionSchema,
  cachedReflection,
} from "../domain/material/reflection";
import { z } from "zod";
import {
  enterPage,
  useEntryState,
  StudySkill,
  HistoryOwner,
  parentPage,
  returnToParent,
  writeEntryValues,
} from "../shared/navigation/history-entry";
import {
  recommendCurriculumUnit,
  unitForDrill,
  unitForPosition,
} from "../domain/curriculum/recommend-unit";
import { usePlayingSnapshot } from "./use-playing-snapshot";
import { queueImportAnalysis, useImportAnalysis } from "./use-import-analysis";
import { BoardFirstScreens } from "./board-first/BoardFirstScreens";
import { gameMomentId } from "./board-first/moment-specs";
import { useGameReport } from "./use-game-report";
import { watchMarkers } from "../domain/session/game-watch";
import {
  GameWatchScreen,
  type WatchMarkers,
  type WatchResume,
} from "../features/game-watch/GameWatchScreen";
import { finalPosition } from "../features/result/final-position";
import {
  ResultScreen,
  type ResultMoments,
} from "../features/result/ResultScreen";
import { rankArt } from "../features/progression/rank-art";
import { deriveProgress } from "../domain/progress/derive-progress";
import type { MomentAttemptRecord } from "../domain/progress/types";
import { AppShell } from "../shared/navigation/AppShell";
import { Avatar, Pill, StreakChip, XpChip } from "../shared/ui/primitives";
import { TabBar, type TabId } from "../shared/navigation/TabBar";
import { checkFen } from "../domain/next-move/next-move";
import {
  boardFirst,
  boardFirstViews,
  isBoardFirstView,
  type BoardFirstView,
} from "./board-first/flag";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { MoveEvaluation } from "../domain/openings/opening-review";
import { moveEvaluations, useOpeningReview } from "./use-opening-review";
import { GAME_ANALYSIS_SEARCH } from "./analysis-version";
import {
  ANALYSIS_VERSION,
  completedAnalysisFromRecord,
  createAnalysisRecord,
  createReviewEvidenceRecord,
  loadAdaptiveProfile,
} from "./adaptive-profile";
import {
  analyzeCompletedGame,
  type CompletedGameAnalysis,
} from "../application/analyze-game/analyze-completed-game";
import { ExternalGameImport } from "../extension/ExternalGameImport";
import {
  externalImportSite,
  type CompletedGameExport,
  type GameSite,
} from "../extension/external-game";
import {
  usernameImportPaths,
  usernameImportSite,
  type RecentGame,
} from "../extension/recent-games";
import { UsernameImport } from "../features/import-games/UsernameImport";
import { reviewGameSummary } from "../extension/review-game-list";
import { SidePanelReview } from "../extension/SidePanelReview";
import { importGames } from "../application/import-games/import-games";
import {
  EXPLANATION_SEARCH_MS,
  evaluateReviewReply,
  type ReviewSearchPurpose,
} from "../application/analyze-game/analyze-review-reply";
import {
  assessPosition,
  type AssessPosition,
} from "../application/analyze-game/assess-position";
import {
  reviewMistakePractice,
  type ReviewMistake,
} from "../domain/analysis/review-mistake";
import {
  completeReviewMistake,
  listReviewMistakes,
  saveReviewMistake,
} from "../infrastructure/persistence/review-mistake-store";
import type { ReviewTrainingLog } from "../domain/analysis/review-training";
import type { Result } from "../shared/result/result";
import { err, ok } from "../shared/result/result";
import { buildPlayerProfile, type PlayerProfile } from "../domain/curriculum";
import {
  observedGameMoves,
  type ObservedMove,
  type VerifiedGameDrill,
} from "../domain/curriculum/game-drill";
import { goodMovesInGame } from "../domain/curriculum/good-moves";
import { readBar } from "./board-first/read-bar";
import { mateOpportunities } from "../domain/game/coach-moments";
import type { PracticeExercise } from "../domain/transfer/types";
import {
  INITIAL_PLAYER_ELO,
  ratingHistory,
  placementCount,
  PLACEMENT_GAMES,
  type RatingEntry,
} from "../domain/game/rating";
import {
  generatedTransferRegistry,
  transferExercisesForTheme,
} from "../domain/transfer";
import { PracticeSection } from "../features/curriculum/PracticeSection";
import { PracticePosition } from "../features/curriculum/PracticePosition";
import { RatingProgress } from "../features/profile/RatingProgress";
import {
  createGameId,
  createPositionId,
  type GameRecord,
  type PlayerColor,
  type GameId,
  type TutorGameMode,
  tutorGameMode,
} from "../domain/game/types";
import {
  ImportGamesPanel,
  type ImportGamesRequest,
  type ImportGamesResponse,
  type ImportedReview,
} from "../features/import-games/ImportGamesPanel";
import { PlayGameScreen } from "../features/play/PlayGameScreen";
import { GameReviewExperience } from "../features/review/GameReviewExperience";
import type { LessonContentProvider } from "../infrastructure/ai/lesson-content-provider";
import { loadFirebaseClientConfig } from "../infrastructure/config/firebase-environment";
import { StockfishAnalysisEngine } from "../infrastructure/engine/stockfish-analysis-engine";
import { serialEngine } from "./board-first/serial-engine";
import { StockfishGameEngine } from "../infrastructure/engine/stockfish-game-engine";
import {
  PlayerHistory,
  guestHistory,
} from "../infrastructure/persistence/player-history";
import type {
  AccountSession,
  AccountIdentity,
} from "../infrastructure/firebase/account-session";
import { initialSync } from "../application/sync-games/sync-status";
import { lazy, Suspense } from "react";
import { AccountPanel } from "../features/account/AccountPanel";
import { RankPath } from "../features/progression/RankPath";
import { rankForElo } from "../domain/game/rank-path";

const PracticeCurriculum = lazy(async () => ({
  default: (await import("../features/curriculum/PracticeCurriculum"))
    .PracticeCurriculum,
}));
const StudyScreen = lazy(() =>
  import("../features/study/StudyScreen").then((module) => ({
    default: module.StudyScreen,
  })),
);
const RaceView = lazy(async () => ({
  default: (await import("../features/race/RaceView")).RaceView,
}));
const ShareWin = lazy(async () => ({
  default: (await import("../features/race/SharedWin")).ShareWin,
}));
// Where each watched game was left for a moment or the next-move tool, so
// coming back picks the replay up there.
const watchResume = new Map<string, WatchResume>();

function watchTitle(summary: ReturnType<typeof reviewGameSummary>): string {
  if (!summary) return "Your game";
  const { opponent, result, title } = summary;
  if (!opponent) return title;
  if (result === "Win") return `You beat ${opponent}`;
  if (result === "Loss") return `You lost to ${opponent}`;
  if (result === "Draw") return `You drew with ${opponent}`;
  return title;
}

function watchSubtitle(
  game: GameRecord,
  summary: ReturnType<typeof reviewGameSummary>,
): string {
  const side =
    game.playerColor === null
      ? undefined
      : `you played ${game.playerColor === "white" ? "White" : "Black"}`;
  return [summary?.stamp.shortLabel, summary?.source, side]
    .filter((part) => part !== undefined)
    .join(" · ");
}

const GameReportScreen = lazy(async () => ({
  default: (await import("../features/game-report/GameReportScreen"))
    .GameReportScreen,
}));
const NextMoveScreen = lazy(async () => ({
  default: (await import("../features/next-move/NextMoveScreen"))
    .NextMoveScreen,
}));
// The next-move tool gets its own Stockfish for as long as it is open. Its
// searches run to a depth, so the time cap only stops a stuck worker.
function nextMoveEngine() {
  return serialEngine(
    new StockfishAnalysisEngine({ maximumSearchTimeMs: 120_000 }),
  );
}

const replayNextMoveKey = "next-move.replay-position";
const replayNextMovePosition = z
  .object({
    fen: z.string().refine((fen) => checkFen(fen).ok),
    orientation: z.enum(["white", "black"]),
  })
  .nullable();

function NextMovePage({
  onNavigate,
}: {
  readonly onNavigate: (tab: TabId) => void;
}) {
  const [replay] = useEntryState(
    replayNextMoveKey,
    replayNextMovePosition,
    null,
  );
  const closeLabel = replay
    ? parentPage()?.endsWith("/report")
      ? "Back to report"
      : "Back to replay"
    : "Back to Play";
  const close = () => {
    if (replay)
      returnToParent(() => {
        onNavigate("games");
      });
    else onNavigate("play");
  };

  return (
    <div className={replay ? undefined : "next-move-page"}>
      <Suspense
        fallback={
          <div className="next-move">
            <div className="next-move__top">
              <button
                type="button"
                className="next-move__close"
                aria-label={closeLabel}
                onClick={close}
              >
                ✕
              </button>
              <h1 className="next-move__title">Next move</h1>
            </div>
            <LoadingState shape="board">Opening your board…</LoadingState>
          </div>
        }
      >
        <NextMoveScreen
          createEngine={nextMoveEngine}
          onClose={close}
          closeLabel={closeLabel}
          {...(replay && {
            initialFen: replay.fen,
            initialOrientation: replay.orientation,
          })}
        />
      </Suspense>
      {replay === null && (
        <div className="next-move-page__rail">
          <TabBar current="play" onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}
const SharedWinView = lazy(async () => ({
  default: (await import("../features/race/SharedWin")).SharedWinView,
}));
function socialView(hash: string) {
  if (hash === "#races" || hash.startsWith("#race/")) return "race";
  if (hash.startsWith("#win/") || hash.startsWith("#mate/")) return "win";
  return null;
}
type AppView =
  | BoardFirstView
  | "race"
  | "win"
  | "ranks"
  | "play"
  | "account"
  | "play-mode"
  | "next-move"
  | "import"
  | "training"
  | "review"
  | "result"
  | "practice";

interface PracticeItem {
  readonly cue?: AuthoredCue;
  readonly sourceGameId?: string;
  readonly id: string;
  readonly exercise: PracticeExercise;
  readonly goal?: string | undefined;
  readonly gamePrompt?: {
    readonly moveLabel: string;
    readonly question: string;
  };
  readonly seenExercises?: readonly string[];
}

const PLAY_MODE_KEY = "chesscue-active-play-mode";

interface PlayEntry {
  readonly mode: TutorGameMode;
  readonly gameId?: GameId;
}

function restorePlayEntry(history: PlayerHistory): PlayEntry | null {
  try {
    const value = localStorage.getItem(history.key(PLAY_MODE_KEY));
    if (value === "rated" || value === "coached") return { mode: value };
    if (value === null) return null;
    const saved: unknown = JSON.parse(value);
    if (
      typeof saved !== "object" ||
      saved === null ||
      !("mode" in saved) ||
      (saved.mode !== "rated" && saved.mode !== "coached")
    )
      return null;
    return {
      mode: saved.mode,
      ...("gameId" in saved &&
      typeof saved.gameId === "string" &&
      saved.gameId.trim().length > 0
        ? { gameId: createGameId(saved.gameId) }
        : {}),
    };
  } catch {
    return null;
  }
}

function savePlayEntry(history: PlayerHistory, entry: PlayEntry | null): void {
  try {
    if (entry === null) localStorage.removeItem(history.key(PLAY_MODE_KEY));
    else
      localStorage.setItem(history.key(PLAY_MODE_KEY), JSON.stringify(entry));
  } catch {
    // Storage availability does not change the active game's mode.
  }
}

const engine = new StockfishGameEngine();
const analysisEngine = new StockfishAnalysisEngine();
const reviewReplyEngine = new StockfishAnalysisEngine();
const coachObservationEngine = new StockfishAnalysisEngine();
const loadCoachObservation = (fen: string, signal: AbortSignal) =>
  evaluateReviewReply(coachObservationEngine, fen, signal);
const loadReviewReply = async (
  fen: string,
  signal: AbortSignal,
  compareAlternatives?: boolean,
  purpose?: ReviewSearchPurpose,
) => {
  if (purpose !== "explanation")
    return evaluateReviewReply(
      reviewReplyEngine,
      fen,
      signal,
      compareAlternatives,
      purpose,
    );
  const explanationEngine = new StockfishAnalysisEngine({
    maximumSearchTimeMs: EXPLANATION_SEARCH_MS,
  });
  try {
    return await evaluateReviewReply(
      explanationEngine,
      fen,
      signal,
      compareAlternatives,
      purpose,
    );
  } finally {
    explanationEngine.dispose();
  }
};
const readBoardPosition: AssessPosition = async (fen, signal) => {
  const assessmentEngine = new StockfishAnalysisEngine();
  try {
    return await assessPosition(assessmentEngine, fen, signal);
  } finally {
    assessmentEngine.dispose();
  }
};
const firebaseConfiguration = loadFirebaseClientConfig();
const runningAnalyses = new Map<
  string,
  Promise<Result<CompletedGameAnalysis, string>>
>();
let previousAnalysis: Promise<unknown> = Promise.resolve();

function loadGameAnalysis(
  history: PlayerHistory,
  game: GameRecord,
): Promise<Result<CompletedGameAnalysis, string>> {
  const analysisRepository = history.analyses;
  const key = JSON.stringify([history.name, game.id]);
  const existing = runningAnalyses.get(key);
  if (existing !== undefined) return existing;
  const task = analysisRepository
    .get(game.id, ANALYSIS_VERSION)
    .then(async (stored): Promise<Result<CompletedGameAnalysis, string>> => {
      if (!stored.ok) return err(stored.error.message);
      if (stored.value !== null)
        return ok(completedAnalysisFromRecord(stored.value));
      const search = previousAnalysis.then(() =>
        navigator.locks.request("chesscue-analysis:" + key, async () => {
          const latest = await analysisRepository.get(
            game.id,
            ANALYSIS_VERSION,
          );
          if (!latest.ok) return err(latest.error.message);
          if (latest.value !== null)
            return ok(completedAnalysisFromRecord(latest.value));
          const result = await analyzeCompletedGame({
            game,
            engine: analysisEngine,
            analysisVersion: ANALYSIS_VERSION,
            timeBudgetPerPositionMs:
              GAME_ANALYSIS_SEARCH.timeBudgetPerPositionMs,
            depth: GAME_ANALYSIS_SEARCH.depth,
            signal: new AbortController().signal,
          });
          if (!result.ok) return err(result.error.message);
          const persisted = await analysisRepository.put(
            createAnalysisRecord({
              game,
              analysis: result.value,
              analyzedAt: new Date().toISOString(),
            }),
          );
          if (!persisted.ok) return err(persisted.error.message);
          window.dispatchEvent(new Event("chesscue-history"));
          window.dispatchEvent(
            new CustomEvent("chesscue-game-analysis", { detail: history.name }),
          );
          return ok(result.value);
        }),
      );
      previousAnalysis = search.catch(() => undefined);
      return search;
    })
    .catch(() => err("This game could not be analyzed."))
    .finally(() => {
      runningAnalyses.delete(key);
    });
  runningAnalyses.set(key, task);
  return task;
}

async function loadPerspectiveAnalysis(
  game: GameRecord,
  signal: AbortSignal,
): Promise<Result<CompletedGameAnalysis, string>> {
  const localEngine = new StockfishAnalysisEngine();
  try {
    const result = await analyzeCompletedGame({
      game,
      engine: localEngine,
      analysisVersion: ANALYSIS_VERSION,
      timeBudgetPerPositionMs: GAME_ANALYSIS_SEARCH.timeBudgetPerPositionMs,
      depth: GAME_ANALYSIS_SEARCH.depth,
      signal,
    });
    return result.ok ? ok(result.value) : err(result.error.message);
  } catch {
    return err("This game could not be analyzed.");
  } finally {
    localEngine.dispose();
  }
}

type AnalysisViewState =
  | { readonly status: "idle" }
  | {
      readonly status: "running";
      readonly route?: string;
      readonly game?: GameRecord;
    }
  | {
      readonly status: "ready";
      readonly route: string;
      readonly game: GameRecord;
      readonly analysis: CompletedGameAnalysis;
    }
  | {
      readonly status: "failed";
      readonly route: string;
      readonly game: GameRecord;
      readonly message: string;
    };

const initialProfile = buildPlayerProfile({
  initialTargetElo: 1450,
  curriculumVersion: "1.0.0",
  computedAt: new Date().toISOString(),
  evidence: [],
  tutorGames: [],
});

const newGameId = () => createGameId(crypto.randomUUID());
const newPositionId = () => createPositionId(crypto.randomUUID());
const titleCase = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function useReviewCoachProvider(
  enabled: boolean,
): LessonContentProvider | null {
  const [provider, setProvider] = useState<LessonContentProvider | null>(null);

  useEffect(() => {
    if (
      !enabled ||
      !firebaseConfiguration.ok ||
      firebaseConfiguration.value === null ||
      provider !== null
    ) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      import("../infrastructure/firebase/firebase-client"),
      import("../infrastructure/ai/firebase-hybrid-lesson-content-provider"),
    ]).then(([firebaseModule, providerModule]) => {
      if (cancelled) return;
      const firebase = firebaseModule.initializeFirebaseClient({
        enableAppCheck: true,
        appCheckDebug:
          import.meta.env.DEV &&
          import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
      });
      if (firebase.status !== "ready" || firebase.services.appCheck === null)
        return;
      setProvider(
        providerModule.createFirebaseHybridLessonContentProvider({
          firebaseApp: firebase.services.app,
          timeoutMs: providerModule.ON_DEVICE_INFERENCE_TIMEOUT_MS,
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, provider]);

  return provider;
}

const nativeGoogleSignIn = usesExtensionGoogleSignIn();
const hostedRaceSignIn =
  extensionPanel &&
  !nativeGoogleSignIn &&
  import.meta.env.VITE_ACCOUNT_EMULATORS !== "true";

function socialNeedsAccount(view: AppView | null) {
  return view === "win" || (view === "race" && !hostedRaceSignIn);
}

const recentReviewKey = "chesscue-last-panel-review";
const recentReviewSchema = z.object({
  route: z.string().regex(/^#review\/[^/]+(?:\/(?:white|black))?$/),
  ply: z.number().int().positive().nullable(),
});

function readRecentReview(history: PlayerHistory) {
  try {
    return recentReviewSchema.safeParse(
      JSON.parse(localStorage.getItem(history.key(recentReviewKey)) ?? "null"),
    ).data;
  } catch {
    return undefined;
  }
}

function routeView(hash: string): AppView {
  if (boardFirst) {
    const named = boardFirstViews.find((name) => hash === "#" + name);
    if (named) return named;
    if (hash.startsWith("#moment/")) return "moment";
    if (hash === "") return "today";
  }
  if (hash === "#review-home" || (extensionPanel && hash === ""))
    return "review-home";
  if (hash.startsWith("#review/")) return "review";
  if (hash.startsWith("#practice/")) return "practice";
  if (hash.startsWith("#result/")) return "result";
  if (hash === "#skill-tree" || hash.startsWith("#study/")) return "training";
  if (hash === "#rank-path") return "ranks";
  if (hash === "#account") return "account";
  if (
    hash === "#import" ||
    usernameImportSite(hash) !== null ||
    (location.protocol === "chrome-extension:" &&
      externalImportSite(hash) !== null)
  )
    return "import";
  if (hash === "#play-mode") return "play-mode";
  if (hash === "#next-move") return "next-move";
  return socialView(hash) ?? "play";
}
function routedGameId(hash: string) {
  try {
    const id = decodeURIComponent(hash.split("/")[1] ?? "");
    return id.trim() ? createGameId(id) : null;
  } catch {
    return null;
  }
}
const skillSchema = z.enum([
  "vision",
  "threats",
  "safety",
  "endgames",
  "backrank",
  "forks",
  "rook",
]);
const panelCurriculumLessons: Readonly<Record<string, Skill>> = {
  "read-the-board": "vision",
  "see-the-threat": "threats",
  "king-attack-plan": "threats",
  "rook-ending": "rook",
};
const panelPuzzleMotifs: Readonly<Record<string, readonly string[]>> = {
  "simple-mates": ["mate in one"],
  "mating-patterns": ["back rank mate", "back-rank mate"],
  "double-attack": ["fork"],
  "line-tactics": ["pin", "discovered attack"],
  "test-a-sacrifice": ["sacrifice"],
  "change-the-defender": ["attraction", "deflection"],
  "passed-pawn-race": ["advanced pawn"],
  "king-attack-plan": ["kingside attack"],
};

export function App() {
  useEffect(startSubmissionSync, []);
  const [socialHash, setSocialHash] = useState(window.location.hash);
  const [entryRevision, setEntryRevision] = useState(0);
  const [view, setView] = useState<AppView>(() => routeView(location.hash));
  const [boardBackSlot, setBoardBackSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [requested, setRequested] = useState(() => {
    try {
      return (
        socialNeedsAccount(socialView(window.location.hash)) ||
        window.location.hash === "#account" ||
        localStorage.getItem("chesscue-auth-used") === "1"
      );
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const syncFragment = () => {
      const hash = location.hash;
      setSocialHash(hash);
      const next = routeView(hash);
      if (socialNeedsAccount(next) || next === "account") setRequested(true);
      setView(next);
    };
    const restore = () => {
      syncFragment();
      setEntryRevision((n) => n + 1);
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", syncFragment);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", syncFragment);
    };
  }, []);
  const [user, setUser] = useState<AccountIdentity | null>(null);
  const [session, setSession] = useState<AccountSession | null>(null);
  const observedUid = useRef<string | null>(null);
  const [accountError, setError] = useState<string | null>(null);
  useEffect(() => {
    const wake = (event: StorageEvent) => {
      if (event.key === "chesscue-auth-used" && event.newValue === "1")
        setRequested(true);
    };
    window.addEventListener("storage", wake);
    return () => {
      window.removeEventListener("storage", wake);
    };
  }, []);
  useEffect(() => {
    if (!requested) return;
    let live = true;
    let unsubscribe: (() => void) | undefined;
    void import("../infrastructure/firebase/account-session")
      .then((module) => {
        if (!live) return;
        const access = module.openAccountSession();
        unsubscribe = access.observe((identity) => {
          if (!live) return;
          try {
            if (identity) localStorage.setItem("chesscue-auth-used", "1");
            else localStorage.removeItem("chesscue-auth-used");
          } catch {
            /* Local sign-in detection is optional when browser storage is restricted. */
          }
          const nextUid = identity?.uid ?? null;
          if (observedUid.current !== nextUid) {
            observedUid.current = nextUid;
            setView((current) =>
              current === "race" ||
              current === "win" ||
              current === "account" ||
              (current === "import" &&
                location.protocol === "chrome-extension:" &&
                externalImportSite(location.hash) !== null) ||
              current === "ranks" ||
              current === "training" ||
              current === "review" ||
              current === "review-home" ||
              current === "play-mode" ||
              current === "next-move" ||
              current === "result"
                ? current
                : "play",
            );
          }
          setUser(identity);
          setSession(access);
        });
      })
      .catch((cause: unknown) => {
        if (live)
          setError(
            cause instanceof Error ? cause.message : "Account unavailable.",
          );
      });
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [requested]);
  const uid = user?.uid ?? null;
  const history = useMemo(
    () => (uid === null ? guestHistory : new PlayerHistory(uid)),
    [uid],
  );
  const navigate = useCallback(
    (next: AppView, path?: string) => {
      if (observedUid.current !== uid) return;
      const paths: Partial<Record<AppView, string>> = {
        training: "#skill-tree",
        "review-home": "#review-home",
        import: "#import",
        play: extensionPanel || boardFirst ? "#play" : "",
        today: "#today",
        moment: "#moment",
        recap: "#recap",
        sky: "#sky",
        profile: "#profile",
        account: "#account",
        ranks: "#rank-path",
        "play-mode": "#play-mode",
        "next-move": "#next-move",
        practice: "#practice",
        race: "#races",
      };
      const target = path ?? paths[next] ?? "";
      if (location.hash !== target) enterPage(target, history.name);
      if (socialNeedsAccount(next)) setRequested(true);
      setSocialHash(target);
      setView(next);
    },
    [uid, history],
  );
  if (
    location.protocol === "chrome-extension:" &&
    externalImportSite(socialHash) !== null &&
    requested &&
    !session
  ) {
    return (
      <main className="content-shell">
        {accountError ? (
          <p role="status">{accountError}</p>
        ) : (
          <LoadingState>Opening your ChessCue history…</LoadingState>
        )}
      </main>
    );
  }
  return (
    <HistoryOwner.Provider value={history.name}>
      <BoardBackSlot.Provider value={boardBackSlot}>
        <PlayerApp
          key={history.name + String(entryRevision)}
          history={history}
          socialHash={socialHash}
          user={user}
          session={session}
          accountError={accountError}
          view={view}
          setView={navigate}
          setBoardBackSlot={setBoardBackSlot}
          openAccount={() => {
            setRequested(true);
            navigate("account");
          }}
        />
      </BoardBackSlot.Provider>
    </HistoryOwner.Provider>
  );
}
function PlayerApp({
  socialHash,
  history,
  user,
  session,
  accountError,
  view,
  setView,
  setBoardBackSlot,
  openAccount,
}: {
  socialHash: string;
  history: PlayerHistory;
  user: AccountIdentity | null;
  session: AccountSession | null;
  accountError: string | null;
  view: AppView;
  setView: (view: AppView, path?: string) => void;
  setBoardBackSlot: (node: HTMLDivElement | null) => void;
  openAccount: () => void;
}) {
  const navigateBoardFirst = useCallback(
    (next: BoardFirstView, path?: string) => {
      setView(next, path);
    },
    [setView],
  );
  const repository = history.games,
    reviewEvidenceRepository = history.reviews,
    analysisRepository = history.analyses;
  const rememberPlayEntry = useCallback(
    (entry: PlayEntry | null) => {
      savePlayEntry(history, entry);
    },
    [history],
  );
  const [sync, setSync] = useState(initialSync);
  const [playEntry, setPlayEntry] = useState<PlayEntry | null>(() =>
    restorePlayEntry(history),
  );
  const playMode = playEntry?.mode ?? "rated";
  const [analysis, setAnalysis] = useState<AnalysisViewState>({
    status: "idle",
  });
  const [profile, setProfile] = useState<PlayerProfile>(initialProfile);
  const [profileReady, setProfileReady] = useState(false);
  const [ratings, setRatings] = useState<readonly RatingEntry[]>([]);
  const [ratedGame, setRatedGame] = useState<GameRecord | null>(null);
  const [recentWin, setRecentWin] = useState<GameRecord | null>(null);
  const [ratingError, setRatingError] = useState(false);
  const [mateProgress, setMateProgress] = useState({ found: 0, total: 0 });
  const [duePractice, setDuePractice] = useState<readonly PracticeItem[]>([]);
  const [practiceEntry, setPracticeEntry] = useEntryState(
    "practice:" + starterPack.runId,
    z
      .object({
        id: z.string(),
        exerciseId: z.string(),
        seenExercises: z.array(z.string()),
        question: reflectionSchema.optional(),
        goal: z.string().trim().min(1).optional(),
        packRun: z.string().optional(),
        generated: exerciseSchema.optional(),
        cue: cueRecordSchema.optional(),
      })
      .nullable(),
    null,
  );
  const [reviewMistakeList, setReviewMistakeList] = useState<{
    owner: string;
    records: readonly ReviewMistake[];
  } | null>(null);
  const [mistakeSaveError, setMistakeSaveError] = useState<string | null>(null);
  const reviewMistakes =
    reviewMistakeList?.owner === history.name ? reviewMistakeList.records : [];
  useEffect(() => {
    if (view !== "training" && view !== "practice") return;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void listReviewMistakes(history.name)
        .then((records) => {
          if (request === revision)
            setReviewMistakeList({ owner: history.name, records });
        })
        .catch(() => {
          if (request === revision)
            setMistakeSaveError("Saved review practice could not be loaded.");
        });
    };
    refresh();
    window.addEventListener("chesscue-review-practice", refresh);
    return () => {
      revision++;
      window.removeEventListener("chesscue-review-practice", refresh);
    };
  }, [history, view]);
  const openingReviewMistake =
    practiceEntry?.exerciseId.startsWith("review-mistake-") === true &&
    reviewMistakeList?.owner !== history.name;
  const savedMistake =
    view === "practice"
      ? reviewMistakes.find(({ id }) => id === practiceEntry?.exerciseId)
      : undefined;
  const mistakeDrill = savedMistake
    ? reviewMistakePractice(savedMistake)
    : null;
  const curated =
    (practiceEntry?.generated?.id === practiceEntry?.exerciseId
      ? practiceEntry?.generated
      : undefined) ??
    generatedTransferRegistry.find(
      (item) => item.id === practiceEntry?.exerciseId,
    );
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const adaptiveProfileRun = useRef<Promise<void> | null>(null);
  const pendingImportAnalysis = useImportAnalysis(
    history,
    view !== "play" &&
      view !== "next-move" &&
      view !== "moment" &&
      view !== "practice" &&
      view !== "review" &&
      view !== "training",
    snapshotRevision,
    loadGameAnalysis,
  );
  const [analysisRevision, setAnalysisRevision] = useState(0);
  useEffect(() => {
    const onAnalysis = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === history.name) {
        adaptiveProfileRun.current = null;
        setAnalysisRevision((revision) => revision + 1);
      }
    };
    window.addEventListener("chesscue-game-analysis", onAnalysis);
    return () => {
      window.removeEventListener("chesscue-game-analysis", onAnalysis);
    };
  }, [history]);
  const snapshot = usePlayingSnapshot(
    history,
    view === "training"
      ? "backfill"
      : (view === "practice" && !curated && !mistakeDrill) ||
          (boardFirst && isBoardFirstView(view) && view !== "review-home")
        ? "saved"
        : "off",
    snapshotRevision,
    view === "training" ? 0 : analysisRevision,
    view === "moment" || view === "practice",
    loadGameAnalysis,
  );
  const curriculumRecommendation = useMemo(
    () =>
      snapshot.status === "ready"
        ? recommendCurriculumUnit(snapshot.moves)
        : null,
    [snapshot],
  );
  const recentReview = readRecentReview(history);
  const recentReviewId = recentReview ? routedGameId(recentReview.route) : null;
  const recentReviewMoves =
    snapshot.status === "ready" && recentReviewId !== null
      ? snapshot.moves.filter((move) => move.game.id === recentReviewId)
      : [];
  const recentReviewMove =
    recentReviewMoves.find((move) => move.ply === recentReview?.ply) ??
    recentReviewMoves
      .filter((move) => move.outcome === "retry")
      .toSorted((a, b) => b.impactCp - a.impactCp)[0];
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);
  const reviewCoachProvider = useReviewCoachProvider(view === "review");
  const activeNavigationView =
    view === "race" || view === "win"
      ? "race"
      : view === "review" || view === "import"
        ? "review-home"
        : view === "practice"
          ? "training"
          : view === "result" || view === "play-mode"
            ? "play"
            : view;
  const targetElo = ratings.at(-1)?.after ?? INITIAL_PLAYER_ELO;
  const focus = profile.nextGame.reason;
  const savedDrill =
    view === "practice" &&
    practiceEntry &&
    !curated &&
    snapshot.status === "ready"
      ? snapshot.moves.find(
          (move) => move.drill.exercise.id === practiceEntry.exerciseId,
        )?.drill
      : undefined;
  const practiceExercise =
    curated &&
    practiceEntry?.question &&
    practiceEntry.packRun === curated.authorship.runId
      ? { ...curated, prompt: practiceEntry.question }
      : (curated ?? mistakeDrill?.exercise ?? savedDrill?.exercise);
  const activePractice =
    practiceEntry && practiceExercise
      ? {
          id: practiceEntry.id,
          exercise: practiceExercise,
          goal: practiceEntry.goal,
          seenExercises: practiceEntry.seenExercises,
          gamePrompt: mistakeDrill
            ? {
                moveLabel: "Move " + String(mistakeDrill.moveNumber),
                question: "Which move would you play here?",
              }
            : savedDrill
              ? {
                  moveLabel: savedDrill.moveLabel,
                  question:
                    practiceEntry.cue?.id === savedDrill.exercise.id &&
                    practiceEntry.cue.fen === savedDrill.exercise.fen
                      ? practiceEntry.cue.question
                      : cachedReflection(savedDrill.exercise.theme),
                }
              : undefined,
        }
      : null;
  function openPractice(item: PracticeItem) {
    setView("practice", "#practice/" + encodeURIComponent(item.exercise.id));
    setPracticeEntry({
      id: item.id,
      cue: item.cue,
      exerciseId: item.exercise.id,
      seenExercises: [...(item.seenExercises ?? [])],
      question: item.gamePrompt?.question ?? item.exercise.prompt,
      goal: item.goal,
      packRun:
        "authorship" in item.exercise
          ? exerciseSchema.safeParse(item.exercise).data?.authorship.runId
          : undefined,
      generated: item.exercise.id.startsWith("archive-")
        ? exerciseSchema.parse(item.exercise)
        : undefined,
    });
  }
  const selectedRating = ratings.find(({ gameId }) => gameId === ratedGame?.id);
  const foundMate = useMemo(
    () =>
      ratedGame !== null &&
      mateOpportunities(ratedGame).some(({ found }) => found),
    [ratedGame],
  );
  const recommendedTheme = foundMate
    ? "one-move-threat"
    : profile.nextGame.focus;
  const recommendedExercise = transferExercisesForTheme(
    recommendedTheme === "central-pawn-tension"
      ? "premature-central-exchange"
      : recommendedTheme,
  ).find(({ difficulty }) => difficulty === "unlabeled");

  const refreshRatings = useCallback(async (): Promise<void> => {
    const completed = await repository.listCompleted();
    setRatingError(!completed.ok);
    if (!completed.ok) return;
    const entries = ratingHistory(completed.value);
    const ratedIds = new Set(entries.map(({ gameId }) => gameId));
    const opportunities = completed.value
      .filter(({ id }) => ratedIds.has(id))
      .slice(-10)
      .flatMap((game) =>
        mateOpportunities(game).map((op) => ({
          ...op,
          fen: game.moves[op.ply - 2]?.fenAfter ?? game.initialFen,
        })),
      );
    const recent = opportunities.slice(-10);
    setRatings(entries);
    const lastWin = entries.findLast((entry) => entry.result === "Won");
    setRecentWin(
      completed.value.find((game) => game.id === lastWin?.gameId) ?? null,
    );
    setMateProgress({
      found: recent.filter(({ found }) => found).length,
      total: recent.length,
    });
  }, [repository]);

  const refreshPractice = useCallback(async (): Promise<void> => {
    const records = await reviewEvidenceRepository.listAll();
    if (!records.ok) return;
    const today = new Date().toISOString().slice(0, 10);
    const pending: PracticeItem[] = [];
    const seen = new Set<string>();
    for (const item of records.value.toSorted((a, b) =>
      b.completedAt.localeCompare(a.completedAt),
    )) {
      if (seen.has(item.theme)) continue;
      seen.add(item.theme);
      if (item.dueReview > today || history.practiceDone(item.id)) continue;
      const exercise = transferExercisesForTheme(item.theme).find(
        ({ difficulty }) => difficulty === "unlabeled",
      );
      if (exercise !== undefined)
        pending.push({ id: item.id, exercise, sourceGameId: item.gameId });
    }
    setDuePractice(pending);
  }, [history, reviewEvidenceRepository]);

  const refreshAdaptiveProfile = useCallback((): Promise<void> => {
    if (adaptiveProfileRun.current) return adaptiveProfileRun.current;
    const run = loadAdaptiveProfile({
      games: repository,
      analyses: analysisRepository,
      reviews: reviewEvidenceRepository,
      initialTargetElo: 1450,
      curriculumVersion: "1.0.0",
      computedAt: new Date().toISOString(),
    }).then((result) => {
      if (adaptiveProfileRun.current !== run) return;
      if (result.ok) setProfile(result.value.profile);
      else adaptiveProfileRun.current = null;
    });
    adaptiveProfileRun.current = run;
    return run;
  }, [repository, analysisRepository, reviewEvidenceRepository]);

  useEffect(() => {
    if (view === "play-mode" || view === "play" || view === "training")
      void refreshAdaptiveProfile();
  }, [view, refreshAdaptiveProfile]);

  useEffect(() => {
    if (view !== "account" && view !== "race") return;
    const refresh = () => {
      void refreshRatings();
    };
    refresh();
    window.addEventListener("chesscue-history", refresh);
    return () => {
      window.removeEventListener("chesscue-history", refresh);
    };
  }, [view, refreshRatings]);
  const refreshHistory = useCallback(() => {
    adaptiveProfileRun.current = null;
    setSnapshotRevision((n) => n + 1);
    void Promise.all([
      refreshAdaptiveProfile(),
      refreshRatings(),
      refreshPractice(),
    ]);
  }, [refreshAdaptiveProfile, refreshRatings, refreshPractice]);
  useEffect(
    () => session?.sync(history, setSync, refreshHistory),
    [session, history, refreshHistory],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void Promise.all([
        refreshAdaptiveProfile(),
        refreshRatings(),
        refreshPractice(),
      ]).finally(() => {
        setProfileReady(true);
      });
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [refreshAdaptiveProfile, refreshRatings, refreshPractice]);

  async function importRequests(
    requests: readonly ImportGamesRequest[],
    singleGame: boolean,
    sharing: "private" | "shared",
  ): Promise<readonly ImportGamesResponse[]> {
    return navigator.locks.request(
      "chesscue-import-" + history.name,
      async () => {
        const completed = await repository.listCompleted();
        if (!completed.ok) throw new Error(completed.error.message);

        const gamesByFingerprint = new Map(
          completed.value.flatMap((game) =>
            game.fingerprint === null
              ? []
              : [[game.fingerprint, game] as const],
          ),
        );
        const imported: GameRecord[] = [];
        const responses: ImportGamesResponse[] = [];
        try {
          for (const request of requests) {
            const result = importGames({
              ...request,
              existingFingerprints: new Set(gamesByFingerprint.keys()),
              idFactory: newGameId,
              now: () => new Date().toISOString(),
              curriculumVersion: "1.0.0",
              configurationVersion: "1.0.0",
            });
            if (singleGame && result.items.length !== 1)
              throw new Error("Expected a single completed game.");
            if (sharing === "shared") {
              await queueSubmittedGames(
                result.items.flatMap((item) =>
                  item.status === "rejected" ? [] : [item.originalPgn],
                ),
              );
            }
            const savedGames = new Map<number, GameRecord>();
            for (const item of result.items) {
              if (item.status === "duplicate") {
                const saved = gamesByFingerprint.get(item.fingerprint);
                if (saved) savedGames.set(item.index, saved);
                continue;
              }
              if (item.status !== "accepted") continue;
              const { record } = item.game;
              const saved = await repository.put(record);
              if (!saved.ok) throw new Error(saved.error.message);
              imported.push(record);
              if (record.fingerprint !== null)
                gamesByFingerprint.set(record.fingerprint, record);
            }
            responses.push({ ...result, savedGames });
          }
          return responses;
        } finally {
          if (imported.length > 0) {
            queueImportAnalysis(history, imported);
            setSnapshotRevision((n) => n + 1);
            window.dispatchEvent(new Event("chesscue-history"));
            void refreshAdaptiveProfile();
          }
        }
      },
    );
  }

  async function handleImport(
    request: ImportGamesRequest,
    singleGame = false,
    sharing: "private" | "shared" = "shared",
  ): Promise<ImportGamesResponse> {
    const [result] = await importRequests([request], singleGame, sharing);
    if (!result) throw new Error("The import could not be completed.");
    return result;
  }

  async function importRecentGames(
    games: readonly RecentGame[],
    site: GameSite,
  ) {
    if (games.length === 0) return 0;
    const responses = await importRequests(
      games.map(
        ({ id, pgn, color }): ImportGamesRequest => ({
          text: pgn,
          source: { type: "upload", fileName: site + "-" + id + ".pgn" },
          playerColor: color,
        }),
      ),
      true,
      "private",
    );
    return responses.reduce(
      (count, { acceptedCount }) => count + acceptedCount,
      0,
    );
  }

  async function importSingleGame(
    {
      id,
      pgn,
      localOnly,
    }: Pick<CompletedGameExport, "id" | "pgn" | "localOnly">,
    color: PlayerColor,
    site: GameSite,
  ): Promise<ImportedReview> {
    const result = await handleImport(
      {
        text: pgn,
        source: { type: "upload", fileName: site + "-" + id + ".pgn" },
        playerColor: color,
      },
      true,
      localOnly ? "private" : "shared",
    );
    const item = result.items[0];
    if (item?.status === "accepted") return { game: item.game.record };
    if (item?.status === "duplicate") {
      const saved = result.savedGames.get(item.index);
      if (saved)
        return saved.playerColor === color
          ? { game: saved, saved: true }
          : { game: saved, perspective: color, saved: true };
    }
    throw new Error(item?.issue.message ?? "The game could not be imported.");
  }

  async function importExternalGame(
    game: CompletedGameExport,
    color: PlayerColor,
    site: GameSite,
  ): Promise<GameRecord> {
    const imported = await importSingleGame(game, color, site);
    if (imported.perspective)
      throw new Error(
        "This game is already in your history from the other side.",
      );
    return imported.game;
  }

  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [missingGame, setMissingGame] = useState(false);
  const gameRoute = location.hash;
  const gameImportSite = externalImportSite(gameRoute);
  const recentImportSite = usernameImportSite(gameRoute);
  const reviewRoute =
    view === "review"
      ? gameRoute.replace(/\/(?:replay|report|moment\/\d+)$/, "")
      : gameRoute;
  // Board-first: a moment tried from the game's replay, by the ply of the
  // player's move.
  const reviewMomentPly =
    view === "review"
      ? Number(/\/moment\/(\d+)$/.exec(gameRoute)?.[1] ?? Number.NaN)
      : Number.NaN;
  const reviewReplay = view === "review" && gameRoute.endsWith("/replay");
  const reviewReport = view === "review" && gameRoute.endsWith("/report");
  const sideSegment = reviewRoute.split("/")[2];
  const reviewPerspective: PlayerColor | undefined =
    view === "review" && (sideSegment === "white" || sideSegment === "black")
      ? sideSegment
      : undefined;
  const [savedReviewRoute, setSavedReviewRoute] = useState<string | null>(null);
  useEffect(() => {
    if (view !== "review" && view !== "result") return;
    const request = new AbortController();
    const stale = () => request.signal.aborted;
    const load = async () => {
      const id = routedGameId(reviewRoute);
      const record = id ? await repository.get(id) : null;
      if (stale()) return;
      if (!record?.ok || !record.value?.result) {
        setMissingGame(true);
        return;
      }
      setMissingGame(false);
      if (view === "result") {
        setRatedGame(record.value);
        return;
      }
      const game = reviewPerspective
        ? { ...record.value, playerColor: reviewPerspective }
        : record.value;
      setAnalysis({ status: "running", route: reviewRoute, game });
      // Board-first's report is the replay, which marks the game's moments.
      if (reviewReport && !boardFirst) return;
      const result = reviewPerspective
        ? await loadPerspectiveAnalysis(game, request.signal)
        : await loadGameAnalysis(history, game);
      if (stale()) return;
      if (result.ok) {
        try {
          localStorage.setItem(
            history.key(recentReviewKey),
            JSON.stringify({
              route: reviewRoute,
              ply: result.value.moments[0]?.ply ?? null,
            }),
          );
        } catch {
          // Keep this review usable if local storage is unavailable.
        }
      }
      setAnalysis(
        result.ok
          ? {
              status: "ready",
              route: reviewRoute,
              game,
              analysis: result.value,
            }
          : {
              status: "failed",
              route: reviewRoute,
              game,
              message: result.error,
            },
      );
      if (result.ok && reviewPerspective === undefined)
        await refreshAdaptiveProfile();
    };
    void load();
    return () => {
      request.abort();
    };
  }, [
    view,
    reviewRoute,
    reviewReport,
    history,
    repository,
    reviewAttempt,
    reviewPerspective,
    refreshAdaptiveProfile,
  ]);
  // Board-first result: this game's own analysis says whether Rook is still
  // reading it, and stored attempts give the shell its streak and XP.
  const [resultRead, setResultRead] = useState<{
    readonly gameId: string;
    readonly moves: readonly ObservedMove[] | "failed";
    readonly evaluations?: ReadonlyMap<number, MoveEvaluation>;
  } | null>(null);
  const [resultAttempts, setResultAttempts] = useState<
    readonly MomentAttemptRecord[]
  >([]);
  useEffect(() => {
    if (!boardFirst || view !== "result" || ratedGame === null) return;
    let live = true;
    void loadGameAnalysis(history, ratedGame).then((result) => {
      if (live)
        setResultRead({
          gameId: ratedGame.id,
          moves: result.ok
            ? observedGameMoves(ratedGame, result.value)
            : "failed",
          ...(result.ok
            ? { evaluations: moveEvaluations(result.value.facts) }
            : {}),
        });
    });
    void history.moments.listAll().then((listed) => {
      if (live && listed.ok) setResultAttempts(listed.value);
    });
    return () => {
      live = false;
    };
  }, [history, view, ratedGame]);
  const resultOpening = useOpeningReview(
    boardFirst && view === "result" ? ratedGame : null,
    resultRead !== null && resultRead.gameId === ratedGame?.id
      ? resultRead.evaluations
      : undefined,
  );
  const analyzeGame = useCallback(
    (game: GameRecord, perspective?: PlayerColor, saved = false) => {
      const target =
        "#review/" +
        encodeURIComponent(game.id) +
        (perspective ? "/" + perspective : "");
      setSavedReviewRoute(saved ? target : null);
      setMissingGame(false);
      setAnalysis({ status: "running" });
      setView("review", target);
      setReviewAttempt((n) => n + 1);
    },
    [setView],
  );
  const handleCompletedTutorGame = useCallback(
    async (game: GameRecord): Promise<void> => {
      window.dispatchEvent(new Event("chesscue-history"));
      setSnapshotRevision((n) => n + 1);
      rememberPlayEntry(null);
      setPlayEntry(null);
      if (tutorGameMode(game) === "rated") {
        setRatedGame(game);
        setView("result", "#result/" + encodeURIComponent(game.id));
        void loadGameAnalysis(history, game).then((result) => {
          if (result.ok) return refreshAdaptiveProfile();
        });
        await refreshRatings();
        return;
      }
      analyzeGame(game);
    },
    [
      analyzeGame,
      refreshAdaptiveProfile,
      refreshRatings,
      history,
      rememberPlayEntry,
      setView,
    ],
  );

  function openGame(mode: TutorGameMode) {
    const entry = playEntry?.mode === mode ? playEntry : { mode };
    rememberPlayEntry(entry);
    setPlayEntry(entry);
    setView("play");
  }

  function startGameDrill(drill: VerifiedGameDrill, goal?: string) {
    openPractice({
      id: drill.exercise.id,
      exercise: drill.exercise,
      goal,
      gamePrompt: {
        moveLabel: drill.moveLabel,
        question: cachedReflection(drill.exercise.theme),
      },
    });
  }

  async function handleTrainingComplete(log: ReviewTrainingLog): Promise<void> {
    if (analysis.status !== "ready") return;
    const persisted = await reviewEvidenceRepository.put(
      createReviewEvidenceRecord({ gameId: analysis.game.id, log }),
    );
    if (persisted.ok) {
      adaptiveProfileRun.current = null;
      window.dispatchEvent(new Event("chesscue-history"));
      await Promise.all([refreshAdaptiveProfile(), refreshPractice()]);
    }
  }

  function practiceFocus() {
    if (recommendedExercise === undefined) {
      openGame("coached");
      return;
    }
    openPractice({
      id: recommendedExercise.id,
      exercise: recommendedExercise,
    });
  }

  const reviewParent = view === "review" ? parentPage() : undefined;
  const reviewFromPlay =
    reviewParent === "#play" || (!extensionPanel && reviewParent === "");
  const reviewBackLabel =
    (reviewReplay || reviewReport) && !boardFirst
      ? "Back to Review"
      : reviewParent?.startsWith("#result/")
        ? "Back to game result"
        : reviewFromPlay
          ? "Back to play"
          : boardFirst
            ? "Back to Games"
            : "Back to Review";
  const reviewPosition = useMemo(
    () =>
      boardFirst &&
      view === "review" &&
      Number.isInteger(reviewMomentPly) &&
      analysis.status === "ready" &&
      analysis.route === reviewRoute
        ? observedGameMoves(analysis.game, analysis.analysis).find(
            ({ ply }) => ply === reviewMomentPly,
          )
        : undefined,
    [view, reviewMomentPly, analysis, reviewRoute],
  );
  const unknownMoment =
    Number.isInteger(reviewMomentPly) &&
    analysis.status === "ready" &&
    analysis.route === reviewRoute &&
    reviewPosition === undefined;
  useEffect(() => {
    if (unknownMoment) setView("review", reviewRoute);
  }, [unknownMoment, reviewRoute, setView]);
  // Board-first: the game's moments, marked on its replay.
  const watchMarkerState: WatchMarkers = useMemo(() => {
    if (analysis.status === "idle" || analysis.route !== reviewRoute)
      return { kind: "checking" };
    if (analysis.status === "failed") return { kind: "failed" };
    if (analysis.status !== "ready") return { kind: "checking" };
    return {
      kind: "ready",
      markers: watchMarkers(
        observedGameMoves(analysis.game, analysis.analysis),
        analysis.analysis.moments,
      ),
    };
  }, [analysis, reviewRoute]);
  const reviewRecord =
    analysis.status !== "idle" && analysis.route === reviewRoute
      ? analysis.game
      : undefined;
  const reviewMatchup = reviewRecord ? reviewGameSummary(reviewRecord) : null;
  const watching =
    boardFirst && view === "review" && !Number.isInteger(reviewMomentPly);
  const watchReport = useGameReport(
    watching ? reviewRecord : undefined,
    history.name,
  );
  const reportOpening = useOpeningReview(
    reviewReport ? reviewRecord : undefined,
  );
  function openFullReplay() {
    setView("review", reviewRoute + "/replay");
  }
  function openFullReport() {
    setView("review", reviewRoute + "/report");
  }
  function exploreReviewPosition(fen: string, orientation: PlayerColor) {
    setView("next-move");
    if (location.hash === "#next-move")
      writeEntryValues(history.name, {
        [replayNextMoveKey]: { fen, orientation },
      });
  }
  const reviewSource =
    reviewRecord?.origin.type === "pgn-upload" &&
    /^lichess-[a-z0-9]{8}\.pgn$/i.test(reviewRecord.origin.sourceName) ? (
      <a
        href={
          "https://lichess.org/" + reviewRecord.origin.sourceName.slice(8, -4)
        }
        target="_blank"
        rel="noreferrer"
        aria-label="Lichess game"
        title="Open Lichess game"
      >
        <span aria-hidden="true">↗</span>
      </a>
    ) : undefined;
  function renderSkillLessons(skill: Skill) {
    const topic =
      skill === "rook" || skill === "endgames"
        ? "rook"
        : skill === "threats"
          ? "attack"
          : undefined;
    if (skill !== "vision" && topic === undefined) return null;
    return (
      <PracticeSection
        name="Lessons"
        loading={<LoadingState>Opening lessons…</LoadingState>}
      >
        <StudySkill.Provider value={skill}>
          <StudyScreen
            key={skill}
            history={snapshot}
            pattern={
              skill === "vision" && snapshot.status === "ready"
                ? snapshot.plan.practice[0]
                : undefined
            }
            initialTopic={topic}
            analyzeReply={loadReviewReply}
            assessPosition={readBoardPosition}
            storageKey={history.key("chesscue-study-roadmaps-v1")}
            profile={profile}
          />
        </StudySkill.Provider>
      </PracticeSection>
    );
  }

  const lessonSkill = location.hash.startsWith("#study/")
    ? skillSchema.safeParse(location.hash.split("/")[1]).data
    : undefined;
  const panelLessons = lessonSkill ? renderSkillLessons(lessonSkill) : null;
  function reviewRetriesByUnit(mistakes: readonly ReviewMistake[]) {
    const opens = new Map<string, (goal: string) => void>();
    const moves = snapshot.status === "ready" ? snapshot.moves : [];
    for (const mistake of mistakes) {
      if (mistake.completed) continue;
      const retry = reviewMistakePractice(mistake);
      if (!retry) continue;
      const unit =
        mistake.unitId ??
        unitForPosition(retry.exercise, moves, mistake.gameId);
      if (!opens.has(unit))
        opens.set(unit, (goal) => {
          openPractice({ id: mistake.id, exercise: retry.exercise, goal });
        });
    }
    return opens;
  }
  function gamePracticeByUnit(mistakes: readonly ReviewMistake[]) {
    const gamePractice = reviewRetriesByUnit(mistakes);
    const moves = snapshot.status === "ready" ? snapshot.moves : [];
    const add = (unit: string, open: (goal: string) => void) => {
      if (!gamePractice.has(unit)) gamePractice.set(unit, open);
    };
    const seenPositions = new Set(
      mistakes.map(({ fen }) => fen.split(" ").slice(0, 4).join(" ")),
    );
    for (const item of duePractice) {
      if (
        snapshot.status !== "ready" ||
        !snapshot.games.some(
          (game) => game.id === item.sourceGameId && game.moves.length > 0,
        )
      )
        continue;
      add(unitForPosition(item.exercise, moves, item.sourceGameId), (goal) => {
        openPractice({ ...item, goal });
      });
    }
    const retries = moves
      .filter((move) => move.outcome === "retry")
      .toSorted((left, right) => right.impactCp - left.impactCp);
    for (const { drill } of [
      ...(recentReviewMove ? [recentReviewMove] : []),
      ...retries,
    ]) {
      const unit = unitForDrill(drill);
      const position = drill.exercise.fen.split(" ").slice(0, 4).join(" ");
      if (seenPositions.has(position) || skillPuzzleSolved(drill.exercise))
        continue;
      seenPositions.add(position);
      add(unit, (goal) => {
        startGameDrill(drill, goal);
      });
    }
    return gamePractice;
  }
  function skillPuzzleSolved(exercise: PracticeExercise) {
    return history.practiceDone("skill-puzzle-v1:" + exercise.id);
  }
  async function openSkillPuzzle(
    { id: unitId, exercises, goal }: CurriculumUnit,
    signal: AbortSignal,
  ): Promise<boolean> {
    const mistakes = await listReviewMistakes(history.name).catch(
      () => reviewMistakes,
    );
    signal.throwIfAborted();
    const fromGames = gamePracticeByUnit(mistakes).get(unitId);
    if (fromGames) {
      fromGames(goal);
      return true;
    }
    const next = exercises.find((exercise) => !skillPuzzleSolved(exercise));
    const motifs = panelPuzzleMotifs[unitId];
    const isSolved = ({ exercise }: LibraryPuzzle) =>
      skillPuzzleSolved(exercise);
    const library = motifs
      ? await import("../features/curriculum/puzzle-catalog").catch(() => null)
      : null;
    signal.throwIfAborted();
    const installed =
      library && motifs
        ? library.nextInstalledSkillPuzzle(motifs, isSolved)
        : undefined;
    if (installed) {
      openLibraryPuzzle(installed, goal);
      return true;
    }
    if (next) {
      openPractice({ id: next.id, exercise: next, goal });
      return true;
    }
    if (library && motifs && navigator.onLine) {
      const published = await library
        .nextPublishedSkillPuzzle(motifs, isSolved, signal)
        .catch(() => undefined);
      signal.throwIfAborted();
      if (published) {
        openLibraryPuzzle(published, goal);
        return true;
      }
    }
    return false;
  }
  function renderCardLessons(unitId: string) {
    const skill = panelCurriculumLessons[unitId];
    if (!skill) return null;
    return (
      <button
        className="review-action"
        type="button"
        onClick={() => {
          setView("training", "#study/" + skill);
        }}
      >
        Lessons
      </button>
    );
  }
  function openLibraryPuzzle({ exercise }: LibraryPuzzle, goal?: string) {
    openPractice({ id: exercise.id, exercise, goal });
  }
  function backFromReview() {
    watchResume.delete(reviewRoute);
    if ((reviewReplay || reviewReport) && !boardFirst) {
      if (reviewParent === reviewRoute)
        returnToParent(() => {
          setView("review", reviewRoute);
        });
      else setView("review", reviewRoute);
      return;
    }
    if (reviewParent?.startsWith("#result/")) {
      returnToParent(() => {
        setView("review-home");
      });
      return;
    }
    if (reviewFromPlay) {
      returnToParent(() => {
        setView("play");
      });
      return;
    }
    setView("review-home");
  }
  function backFromPractice() {
    const parent = parentPage();
    if (parent?.startsWith("#study/") || parent === "#skill-tree") {
      returnToParent(() => {
        setView("training");
      });
    } else {
      setView("training");
    }
  }
  const boardBack =
    view === "review"
      ? { label: reviewBackLabel, onBack: backFromReview }
      : view === "practice"
        ? {
            label: "Back to Practice",
            onBack: backFromPractice,
          }
        : view === "play"
          ? {
              label: "Back to game mode",
              onBack: () => {
                setView("play-mode");
              },
            }
          : null;

  // Focus mode in the side panel (only ✕); on wide screens the left rail
  // stays, as it does while playing a game.
  if (view === "next-move")
    return (
      <NextMovePage
        onNavigate={(tab) => {
          if (tab === "play") setView("play-mode");
          else if (tab === "games") setView("review-home");
          else setView(tab);
        }}
      />
    );

  if (reviewReport && !boardFirst)
    return (
      <AppShell
        mode={{
          kind: "focus",
          exitLabel: reviewBackLabel,
          onExit: backFromReview,
          top: <h1 className="game-replay__title">Full report</h1>,
        }}
      >
        {missingGame ? (
          <p role="alert">This game is unavailable in this player’s history.</p>
        ) : reviewRecord ? (
          <Suspense
            fallback={
              <PositionLoading>Opening the full report…</PositionLoading>
            }
          >
            <GameReportScreen
              key={JSON.stringify([history.name, reviewRoute])}
              game={reviewRecord}
              owner={history.name}
              opening={
                reportOpening.kind === "ready"
                  ? reportOpening.review.opening.name
                  : undefined
              }
              title={
                reviewMatchup
                  ? `${reviewMatchup.title} · ${reviewMatchup.result}`
                  : undefined
              }
              onExplore={exploreReviewPosition}
            />
          </Suspense>
        ) : (
          <PositionLoading>Opening the full report…</PositionLoading>
        )}
      </AppShell>
    );

  if (reviewReplay && !boardFirst)
    return (
      <AppShell
        mode={{
          kind: "focus",
          exitLabel: reviewBackLabel,
          onExit: backFromReview,
          top: (
            <>
              <h1 className="game-replay__title">Full replay</h1>
              <Pill onClick={openFullReport}>Full report</Pill>
            </>
          ),
        }}
      >
        {missingGame ? (
          <p role="alert">This game is unavailable in this player’s history.</p>
        ) : reviewRecord ? (
          <GameReviewExperience
            key={gameRoute}
            compact
            replayOnly
            game={reviewRecord}
            {...(analysis.status === "ready" && {
              analysis: analysis.analysis,
            })}
            onExploreNextMove={exploreReviewPosition}
            reviewTitle={
              reviewMatchup
                ? `${reviewMatchup.title} · ${reviewMatchup.result}`
                : undefined
            }
            reviewSource={reviewSource}
          />
        ) : (
          <PositionLoading>Opening the full replay…</PositionLoading>
        )}
      </AppShell>
    );

  if (watching)
    return (
      <AppShell
        mode={{
          kind: "focus",
          exitLabel: reviewBackLabel,
          onExit: backFromReview,
        }}
      >
        {missingGame ? (
          <p role="alert">This game is unavailable in this player’s history.</p>
        ) : reviewRecord ? (
          <GameWatchScreen
            key={reviewRoute}
            game={reviewRecord}
            title={watchTitle(reviewMatchup)}
            subtitle={watchSubtitle(reviewRecord, reviewMatchup)}
            opponent={reviewMatchup?.opponent}
            markers={watchMarkerState}
            evaluations={
              watchReport.kind === "ready"
                ? {
                    kind: "ready",
                    evaluations: watchReport.report.evaluations,
                  }
                : watchReport
            }
            resume={watchResume.get(reviewRoute)}
            onTry={(ply) => {
              watchResume.set(reviewRoute, { kind: "marker", ply });
              setView("review", `${reviewRoute}/moment/${String(ply)}`);
            }}
            onAnalyze={(fen, ply) => {
              watchResume.set(reviewRoute, { kind: "paused", ply });
              exploreReviewPosition(fen, reviewRecord.playerColor ?? "white");
            }}
          />
        ) : (
          <PositionLoading>Opening your game…</PositionLoading>
        )}
      </AppShell>
    );

  if (
    boardFirst &&
    view === "review" &&
    !missingGame &&
    (analysis.status === "idle" ||
      analysis.status === "running" ||
      (analysis.status === "ready" && analysis.route !== reviewRoute))
  )
    return (
      <AppShell
        mode={{
          kind: "focus",
          exitLabel: reviewBackLabel,
          onExit: backFromReview,
        }}
      >
        <PositionLoading>Opening this moment…</PositionLoading>
      </AppShell>
    );

  function renderUsernameImport(site?: GameSite) {
    return (
      <UsernameImport
        key={site}
        site={site}
        storageKey={history.key(IMPORT_USERNAMES_KEY)}
        onImport={importRecentGames}
      />
    );
  }

  const usernameGames = view === "import" && recentImportSite !== null;
  const reviewHome = (view === "review-home" || usernameGames) && (
    <SidePanelReview
      boardFirst={boardFirst}
      usernameImport={
        boardFirst || usernameGames
          ? renderUsernameImport(recentImportSite ?? undefined)
          : undefined
      }
      pendingAnalysis={pendingImportAnalysis}
      watchLichess={extensionPanel}
      repository={repository}
      historyRevision={snapshotRevision}
      openGame={(route) => {
        setView("import", route);
      }}
      openSavedGame={(route) => {
        setView("review", route);
      }}
      importFrom={(site) => {
        setView("import", usernameImportPaths[site]);
      }}
      importPgn={() => {
        setView("import", "#import");
      }}
    />
  );

  if (
    boardFirst &&
    (isBoardFirstView(view) || usernameGames || reviewPosition !== undefined)
  )
    return (
      <BoardFirstScreens
        key={reviewPosition ? reviewRoute : undefined}
        view={
          isBoardFirstView(view)
            ? view
            : usernameGames
              ? "review-home"
              : "moment"
        }
        reviewHome={reviewHome}
        review={
          reviewPosition && {
            position: reviewPosition,
            alternateSide: reviewPerspective !== undefined,
            exitLabel: "Back to the game",
            onExit: () => {
              setView("review", reviewRoute);
            },
          }
        }
        navigate={navigateBoardFirst}
        history={history}
        snapshot={snapshot}
        ratings={ratings}
        playerName={user?.name ?? "You"}
        signedIn={user !== null}
        onOpenAccount={openAccount}
        onPlay={() => {
          setView("play-mode");
        }}
        onGames={() => {
          setView("review-home");
        }}
        onImport={() => {
          setView("review-home");
        }}
        onImportFrom={(site) => {
          setView("import", usernameImportPaths[site]);
        }}
      />
    );

  if (boardFirst && view === "result") {
    const game = ratedGame?.id === routedGameId(gameRoute) ? ratedGame : null;
    const rated = game !== null && tutorGameMode(game) === "rated";
    const read =
      resultRead?.gameId === game?.id ? resultRead?.moves : undefined;
    const ownMoves = read === undefined || read === "failed" ? [] : read;
    const retries = ownMoves
      .filter(({ outcome }) => outcome === "retry")
      .toSorted((a, b) => a.ply - b.ply);
    // What the player did well, from this game's own analysis.
    const goodMoves = goodMovesInGame(ownMoves);
    const moments: ResultMoments =
      read === "failed"
        ? { kind: "failed" }
        : read === undefined
          ? { kind: "reading" }
          : { kind: "found", count: retries.length };
    const progress = deriveProgress({
      attempts: resultAttempts,
      games: [],
      // Only the streak and XP are shown here; neither reads the curriculum.
      curriculum: [],
      now: new Date(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return (
      <AppShell
        mode={{
          kind: "tabs",
          current: "play",
          onNavigate: (tab) => {
            if (tab === "play") setView("play-mode");
            else if (tab === "games") setView("review-home");
            else setView(tab);
          },
          start: (
            <>
              <StreakChip days={progress.streak.current} />
              <XpChip xp={progress.xp} />
            </>
          ),
          end: (
            <Avatar
              name={user?.name ?? "You"}
              badgeUrl={rankArt[rankForElo(targetElo).name]}
              onClick={() => {
                setView("profile");
              }}
            />
          ),
        }}
      >
        {game === null ? (
          missingGame ? (
            <p role="alert">
              This game is unavailable in this player’s history.
            </p>
          ) : (
            <LoadingState shape="board">Opening your game…</LoadingState>
          )
        ) : (
          <ResultScreen
            position={finalPosition(game)}
            rating={
              !rated
                ? { kind: "unrated" }
                : selectedRating !== undefined
                  ? {
                      kind: "rated",
                      before: selectedRating.before,
                      after: selectedRating.after,
                    }
                  : ratingError
                    ? { kind: "failed" }
                    : { kind: "loading" }
            }
            moments={moments}
            goodMoves={goodMoves}
            assessPosition={readBar}
            opening={
              resultOpening.kind === "ready"
                ? {
                    name: resultOpening.review.opening.name,
                    summary: resultOpening.review.summary,
                    frames: resultOpening.review.frames,
                  }
                : undefined
            }
            share={
              <Suspense
                fallback={<SkeletonLines>Opening sharing…</SkeletonLines>}
              >
                <ShareWin
                  game={game}
                  uid={user?.uid ?? null}
                  session={session}
                />
              </Suspense>
            }
            onLookAtMoments={() => {
              const first = retries[0];
              if (first)
                setView(
                  "moment",
                  "#moment/" + encodeURIComponent(gameMomentId(first)),
                );
            }}
            onPlayAgain={() => {
              openGame(rated ? "rated" : "coached");
            }}
            onRetryRating={() => {
              void refreshRatings();
            }}
          />
        )}
      </AppShell>
    );
  }

  function navigateSection(destination: PanelDestination) {
    setView(
      extensionPanel && destination === "play" ? "play-mode" : destination,
    );
  }

  return (
    <div
      className={extensionPanel ? "app-frame" : "app-frame app-frame--desktop"}
    >
      <header className="app-bar">
        <div className="app-bar__leading">
          <div ref={setBoardBackSlot} className="app-bar__board-back-slot" />
          <div className="app-bar__leading-default">
            {boardBack ? (
              <BoardBackControl {...boardBack} />
            ) : (
              <button
                className="brand"
                type="button"
                aria-label="ChessCue"
                title="ChessCue"
                onClick={() => {
                  setView("play");
                }}
              >
                <img src="/favicon.svg" alt="" width="32" height="32" />
              </button>
            )}
          </div>
        </div>
        {!extensionPanel && !boardFirst && (
          <PanelTabs
            placement="header"
            current={activeNavigationView}
            onNavigate={navigateSection}
          />
        )}
        {boardFirst ? (
          <div className="app-bar__profile">
            <Avatar
              name={user?.name ?? "You"}
              badgeUrl={rankArt[rankForElo(targetElo).name]}
              onClick={() => {
                setView("profile");
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="account-button"
            aria-label="Account"
            title="Account"
            aria-current={
              view === "account" || view === "ranks" ? "page" : undefined
            }
            onClick={openAccount}
          >
            <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="7" r="3.5" />
              <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
            </svg>
          </button>
        )}
      </header>
      {extensionPanel && !boardFirst && (
        <PanelTabs
          current={activeNavigationView}
          onNavigate={navigateSection}
        />
      )}
      {boardFirst && (
        <div className="board-first-tabs">
          <TabBar
            current={
              view === "play" || view === "play-mode" || view === "result"
                ? "play"
                : view === "review-home" ||
                    view === "review" ||
                    view === "import"
                  ? "games"
                  : undefined
            }
            onNavigate={(tab) => {
              if (tab === "play") setView("play-mode");
              else if (tab === "games") setView("review-home");
              else setView(tab);
            }}
          />
        </div>
      )}
      {reviewHome}
      {view === "race" &&
        ((hostedRaceSignIn || nativeGoogleSignIn) && user === null ? (
          <HostedRaces
            nativeGoogle={nativeGoogleSignIn}
            session={session}
            error={accountError}
            id={socialHash.startsWith("#race/") ? socialHash.slice(6) : null}
          />
        ) : (
          <Suspense fallback={<LoadingState>Loading race…</LoadingState>}>
            <RaceView
              panel
              key={socialHash}
              id={socialHash.startsWith("#race/") ? socialHash.slice(6) : null}
              user={user}
              session={session}
              ratings={ratings}
              accountError={accountError}
              uploadsPending={sync.pending > 0}
              conflict={sync.conflicts.some((k) => k.startsWith("games/"))}
              onPlay={() => {
                openGame("rated");
              }}
            />
          </Suspense>
        ))}
      {view === "win" && (
        <Suspense
          fallback={<LoadingState shape="board">Loading win…</LoadingState>}
        >
          <SharedWinView
            key={socialHash}
            id={socialHash.slice(socialHash.indexOf("/") + 1)}
            guest={socialHash.startsWith("#mate/")}
            session={session}
            unavailable={!!accountError}
            onPlay={() => {
              openGame("rated");
            }}
          />
        </Suspense>
      )}
      {view === "ranks" &&
        (profileReady && !ratingError ? (
          <RankPath
            history={ratings}
            onPlay={() => {
              openGame("rated");
            }}
          />
        ) : ratingError ? (
          <p role="status">Rank unavailable</p>
        ) : (
          <LoadingState>Loading rank path…</LoadingState>
        ))}
      {view === "account" && (
        <AccountPanel
          user={user}
          history={history}
          session={session}
          error={accountError}
          sync={sync}
          merged={() => {
            setPlayEntry(restorePlayEntry(history));
            refreshHistory();
            window.dispatchEvent(new Event("chesscue-history"));
          }}
        >
          <div className="account-progress">
            {!profileReady ? (
              <LoadingState>Loading your progress…</LoadingState>
            ) : ratingError ? (
              <p role="alert">
                Your rank could not be loaded.{" "}
                <button
                  type="button"
                  className="review-action"
                  onClick={() => {
                    void refreshRatings();
                  }}
                >
                  Try again
                </button>
              </p>
            ) : (
              <RatingProgress
                history={ratings}
                onRankPath={() => {
                  setView("ranks");
                }}
              />
            )}
          </div>
        </AccountPanel>
      )}

      {view === "play" ? (
        <PlayGameScreen
          compact={extensionPanel}
          noteScope={history.name}
          mode={playMode}
          readyToStart={profileReady}
          placementCount={placementCount(ratings.at(-1))}
          resumeGameId={playEntry?.gameId}
          engine={engine}
          assessPosition={readBoardPosition}
          analyzeCoachMove={loadReviewReply}
          analyzeCoachObservation={loadCoachObservation}
          repository={repository}
          createGameId={newGameId}
          createPositionId={newPositionId}
          targetElo={targetElo}
          focusTheme={profile.nextGame.focus}
          focusTitle={titleCase(profile.nextGame.focus)}
          focus={focus}
          onGameCompleted={handleCompletedTutorGame}
          onChangeMode={() => {
            setView("play-mode");
          }}
          onCoachJoined={(gameId) => {
            const entry = { mode: "coached", gameId } as const;
            rememberPlayEntry(entry);
            setPlayEntry(entry);
          }}
        />
      ) : null}

      {view === "play-mode" ? (
        <main className="content-shell play-mode-page">
          <section
            className="play-mode-setup"
            aria-labelledby="play-mode-title"
          >
            <ScreenHeader id="play-mode-title" title="Game mode" />
            <GameModeChoices
              repository={repository}
              activeMode={playMode}
              activeGameId={playEntry?.gameId}
              ready={profileReady}
              onOpen={openGame}
              onNextMove={() => {
                setView("next-move");
              }}
            />
            {recentWin && (
              <div className="play-mode-social">
                <Suspense
                  fallback={<SkeletonLines>Opening sharing…</SkeletonLines>}
                >
                  <ShareWin
                    key={recentWin.id}
                    game={recentWin}
                    uid={user?.uid ?? null}
                    session={session}
                  />
                </Suspense>
              </div>
            )}
          </section>
        </main>
      ) : null}

      {view === "result" && ratedGame === null && !missingGame && (
        <main className="content-shell">
          <LoadingState shape="board">Opening your game…</LoadingState>
        </main>
      )}
      {view === "result" && missingGame && (
        <p role="alert">This game is unavailable in this player’s history.</p>
      )}
      {view === "result" && ratedGame !== null ? (
        <main
          className={
            "content-shell rating-result" +
            (selectedRating?.placementGame === PLACEMENT_GAMES
              ? " rating-result--reveal"
              : "")
          }
        >
          {selectedRating !== undefined ? (
            <div>
              <RatingProgress
                history={ratings}
                result={selectedRating}
                onNextPlacement={() => {
                  openGame("rated");
                }}
                onRankPath={() => {
                  setView("ranks");
                }}
              />
              {selectedRating.result === "Won" && (
                <Suspense
                  fallback={<SkeletonLines>Loading sharing…</SkeletonLines>}
                >
                  <a className="review-action" href="#races">
                    Race friends
                  </a>
                  <ShareWin
                    game={ratedGame}
                    uid={user?.uid ?? null}
                    session={session}
                  />
                </Suspense>
              )}
              {selectedRating.placementGame === undefined &&
                rankForElo(selectedRating.after).floor >
                  rankForElo(selectedRating.before).floor && (
                  <h2>{rankForElo(selectedRating.after).name} unlocked</h2>
                )}
            </div>
          ) : (
            <section aria-live="polite">
              <h1>
                {ratingError ? (
                  "Your rating is unavailable"
                ) : (
                  <LoadingText>Calculating your Elo</LoadingText>
                )}
              </h1>
              {ratingError ? (
                <button
                  className="review-action"
                  type="button"
                  onClick={() => {
                    void refreshRatings();
                  }}
                >
                  Try again
                </button>
              ) : null}
            </section>
          )}
          <section className="rating-result__next">
            <p className="section-kicker">From your learning plan</p>
            <h1>
              {foundMate
                ? "You spotted mate in one"
                : titleCase(profile.nextGame.focus)}
            </h1>
            <p>
              {foundMate
                ? "You finished this game by spotting a mate without a hint."
                : mateProgress.total > 0
                  ? `You found mate in one on ${String(mateProgress.found)} of your last ${String(mateProgress.total)} rated opportunities.`
                  : "Review a moment from this game or practice on a fresh board."}
            </p>
            <button
              type="button"
              className="primary-link"
              onClick={practiceFocus}
            >
              {recommendedExercise === undefined
                ? "Play a coached game"
                : "Practice this skill"}
            </button>
            <button
              type="button"
              className="review-action"
              onClick={() => {
                analyzeGame(ratedGame);
              }}
            >
              Review this game
            </button>
            {selectedRating && placementCount(selectedRating) === null && (
              <button
                type="button"
                className="review-action"
                onClick={() => {
                  openGame("rated");
                }}
              >
                Play another rated game
              </button>
            )}
          </section>
        </main>
      ) : null}

      {view === "practice" &&
        !activePractice &&
        (snapshot.status === "checking" || openingReviewMistake ? (
          <LoadingState shape="board">Opening puzzle…</LoadingState>
        ) : (
          <p role="status">This practice position is unavailable.</p>
        ))}
      {view === "practice" && activePractice !== null ? (
        <PracticePosition
          key={activePractice.id}
          compact
          exercise={activePractice.exercise}
          gamePrompt={activePractice.gamePrompt}
          goal={activePractice.goal}
          analyzeReply={loadReviewReply}
          assessPosition={readBoardPosition}
          onRatedGame={() => {
            openGame("rated");
          }}
          onComplete={() => {
            if (savedMistake) {
              void completeReviewMistake(history.name, savedMistake.id)
                .then(() => {
                  window.dispatchEvent(new Event("chesscue-review-practice"));
                })
                .catch(() => {
                  setMistakeSaveError(
                    "Practice completion could not be saved.",
                  );
                });
              return;
            }
            if (!duePractice.some(({ id }) => id === activePractice.id)) {
              try {
                history.completePractice(
                  "skill-puzzle-v1:" + activePractice.exercise.id,
                );
              } catch {
                setMistakeSaveError("Practice completion could not be saved.");
              }
              return;
            }
            try {
              history.completePractice(activePractice.id);
              window.dispatchEvent(new Event("chesscue-history"));
            } catch {
              /* Keep the local queue usable for this session. */
            }
            setDuePractice((items) =>
              items.filter(({ id }) => id !== activePractice.id),
            );
          }}
        />
      ) : null}

      {view === "import" && !usernameGames ? (
        <main className="content-shell content-shell--narrow">
          <button
            type="button"
            className="lesson-back"
            onClick={() => {
              setView("review-home");
            }}
          >
            {boardFirst && recentImportSite
              ? "Back to Games"
              : "Back to Review"}
          </button>
          {gameImportSite === null && recentImportSite === null && (
            <nav
              className="username-import__sources"
              aria-label="Game import sources"
            >
              <button
                type="button"
                className="review-action"
                onClick={() => {
                  setView("import", usernameImportPaths.lichess);
                }}
              >
                Lichess
              </button>
              <button
                type="button"
                className="review-action"
                onClick={() => {
                  setView("import", usernameImportPaths.chesscom);
                }}
              >
                Chess.com
              </button>
              <button
                type="button"
                className="review-action"
                aria-current="page"
                onClick={() => {
                  setView("import", "#import");
                }}
              >
                PGN
              </button>
            </nav>
          )}
          {location.protocol === "chrome-extension:" && gameImportSite ? (
            <ExternalGameImport
              key={location.hash}
              route={location.hash}
              site={gameImportSite}
              importGame={importExternalGame}
              review={analyzeGame}
              manual={() => {
                setView("import", "#import");
              }}
            />
          ) : (
            <ImportGamesPanel
              onImport={handleImport}
              onReview={({ game, perspective, saved }: ImportedReview) => {
                analyzeGame(game, perspective, saved);
              }}
              onViewPlan={() => {
                setView("training");
              }}
            />
          )}
        </main>
      ) : null}

      {view === "training" && panelLessons && (
        <main className="content-shell">
          {location.hash.split("/").length === 2 && (
            <button
              type="button"
              className="lesson-back"
              aria-label="Back to Skill tree"
              onClick={() => {
                returnToParent(() => {
                  setView("training");
                });
              }}
            >
              Back to Skill tree
            </button>
          )}
          {panelLessons}
        </main>
      )}
      {view === "training" && !panelLessons && (
        <section className="training-header">
          <ScreenHeader title="Skill tree" />
          <PracticeSection
            name="ChessCue curriculum"
            loading={<LoadingState>Loading skill tree…</LoadingState>}
          >
            <PracticeCurriculum
              recommendation={curriculumRecommendation}
              lessons={renderCardLessons}
              onOpenSkill={openSkillPuzzle}
              onPractice={(exercise) => {
                openPractice({ id: exercise.id, exercise });
              }}
            />
          </PracticeSection>
          {!extensionPanel &&
            snapshot.status === "ready" &&
            snapshot.games.length === 0 && (
              <TrainingAnalysisStatus
                state={snapshot}
                onPlay={() => {
                  openGame("rated");
                }}
                onImport={() => {
                  setView("import");
                }}
              />
            )}
          {mistakeSaveError && <p role="status">{mistakeSaveError}</p>}
        </section>
      )}

      {view === "review" ? (
        <main className="content-shell review-page">
          {savedReviewRoute === gameRoute && !missingGame && (
            <p role="status" className="review-page__notice">
              Opened your saved review.
            </p>
          )}
          {reviewPerspective && !missingGame && (
            <p className="review-page__notice">
              Reviewing {reviewPerspective === "white" ? "White" : "Black"}’s
              moves.
            </p>
          )}
          {!missingGame && analysis.status === "idle" && (
            <LoadingState shape="board">Opening your review…</LoadingState>
          )}
          {missingGame ? (
            <p role="alert">
              This game is unavailable in this player’s history.
            </p>
          ) : analysis.status === "running" ? (
            <section className="review-page__state" aria-live="polite">
              <LoadingMark large />
              <p className="section-kicker">Stockfish review</p>
              <h1>Analyzing your game</h1>
              <p>
                Checking each decision and validating every replay line. This
                can take a few seconds.
              </p>
              {reviewRecord && (
                <>
                  <Pill onClick={openFullReplay}>Full replay</Pill>
                  <Pill onClick={openFullReport}>Full report</Pill>
                </>
              )}
            </section>
          ) : null}
          {analysis.status === "failed" ? (
            <section className="review-page__state">
              <p className="section-kicker">Review unavailable</p>
              <h1>We could not analyze this game</h1>
              <p role="alert">{analysis.message}</p>
              <button
                className="review-action"
                type="button"
                onClick={() => {
                  analyzeGame(analysis.game, reviewPerspective);
                }}
              >
                Try analysis again
              </button>
              {reviewRecord && (
                <>
                  <Pill onClick={openFullReplay}>Full replay</Pill>
                  <Pill onClick={openFullReport}>Full report</Pill>
                </>
              )}
            </section>
          ) : null}
          {analysis.status === "ready" && analysis.route === reviewRoute ? (
            <div className="review-page__experience">
              <Pill onClick={openFullReport}>Full report</Pill>
              <GameReviewExperience
                key={gameRoute}
                analyzeReply={loadReviewReply}
                assessPosition={readBoardPosition}
                game={analysis.game}
                analysis={analysis.analysis}
                coachProvider={reviewCoachProvider}
                reviewTitle={
                  reviewMatchup
                    ? (reviewMatchup.opponent
                        ? "vs. " + reviewMatchup.opponent + " · "
                        : "") + reviewMatchup.result
                    : undefined
                }
                reviewSource={reviewSource}
                compact
                onMistake={async (evidence) => {
                  const game = analysis.game;
                  if (!game.result || !game.completedAt) return null;
                  const unitId = unitForPosition(
                    { fen: evidence.fen, theme: "other" },
                    [
                      ...(snapshot.status === "ready" ? snapshot.moves : []),
                      ...observedGameMoves(game, analysis.analysis),
                    ],
                    game.id,
                  );
                  try {
                    const added = await saveReviewMistake(
                      history.name,
                      game.id,
                      evidence,
                      unitId,
                    );
                    if (!added) return null;
                    window.dispatchEvent(new Event("chesscue-review-practice"));
                  } catch {
                    setMistakeSaveError(
                      "A review mistake could not be saved for practice.",
                    );
                    return null;
                  }
                  return import("../domain/material/installed-curriculum").then(
                    ({ skillLocation }) => ({
                      location: skillLocation(unitId),
                      unitId,
                    }),
                    () => ({ location: "", unitId }),
                  );
                }}
                onTrainingComplete={
                  reviewPerspective
                    ? null
                    : (log) => {
                        void handleTrainingComplete(log);
                      }
                }
              />
            </div>
          ) : null}
        </main>
      ) : null}
    </div>
  );
}
