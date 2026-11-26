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
} from "../shared/navigation/history-entry";
import { recommendCurriculumUnit } from "../domain/curriculum/recommend-unit";
import { usePlayingSnapshot } from "./use-playing-snapshot";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import { LichessImport } from "../extension/LichessImport";
import { SidePanelReview } from "../extension/SidePanelReview";
import type { LichessExport } from "../extension/lichess-export";
import { importGames } from "../application/import-games/import-games";
import { evaluateReviewReply } from "../application/analyze-game/analyze-review-reply";
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
import { type VerifiedGameDrill } from "../domain/curriculum/game-drill";
import { mateOpportunities } from "../domain/game/coach-moments";
import type { PracticeExercise } from "../domain/transfer/types";
import { GameTraining } from "../features/progression/GameTraining";
import {
  INITIAL_PLAYER_ELO,
  ratedOpponentElo,
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
import { CurriculumCard } from "../features/curriculum/CurriculumCard";
import {
  ImportGamesPanel,
  type ImportGamesRequest,
  type ImportedReview,
} from "../features/import-games/ImportGamesPanel";
import { PlayGameScreen } from "../features/play/PlayGameScreen";
import { ProfileOverview } from "../features/profile/ProfileOverview";
import { GameReviewExperience } from "../features/review/GameReviewExperience";
import type { LessonContentProvider } from "../infrastructure/ai/lesson-content-provider";
import { loadFirebaseClientConfig } from "../infrastructure/config/firebase-environment";
import { StockfishAnalysisEngine } from "../infrastructure/engine/stockfish-analysis-engine";
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
import { Fragment, lazy, Suspense } from "react";
import { AccountPanel } from "../features/account/AccountPanel";
import { RankPath } from "../features/progression/RankPath";
import { SkillTree, type Skill } from "../features/progression/SkillTree";
import { rankForElo } from "../domain/game/rank-path";

const PracticeCurriculum = lazy(async () => ({
  default: (await import("../features/curriculum/PracticeCurriculum"))
    .PracticeCurriculum,
}));
const SharedPuzzleLibrary = lazy(async () => ({
  default: (await import("../features/curriculum/SharedPuzzleLibrary"))
    .SharedPuzzleLibrary,
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
const SharedWinView = lazy(async () => ({
  default: (await import("../features/race/SharedWin")).SharedWinView,
}));
function socialView(hash: string) {
  if (hash === "#races" || hash.startsWith("#race/")) return "race";
  if (hash.startsWith("#win/") || hash.startsWith("#mate/")) return "win";
  return null;
}
type AppView =
  | "race"
  | "win"
  | "ranks"
  | "play"
  | "account"
  | "play-mode"
  | "import"
  | "training"
  | "review"
  | "review-home"
  | "result"
  | "practice";

interface PracticeItem {
  readonly cue?: AuthoredCue;
  readonly sourceGameId?: string;
  readonly id: string;
  readonly exercise: PracticeExercise;
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
const loadReviewReply = (
  fen: string,
  signal: AbortSignal,
  compareAlternatives?: boolean,
) => evaluateReviewReply(reviewReplyEngine, fen, signal, compareAlternatives);
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
  const task = previousAnalysis
    .then(async () => {
      const stored = await analysisRepository.get(game.id, ANALYSIS_VERSION);
      if (!stored.ok) return err(stored.error.message);
      if (stored.value !== null)
        return ok(completedAnalysisFromRecord(stored.value));
      const result = await analyzeCompletedGame({
        game,
        engine: analysisEngine,
        analysisVersion: ANALYSIS_VERSION,
        timeBudgetPerPositionMs: 120,
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
      if (persisted.ok) window.dispatchEvent(new Event("chesscue-history"));
      return persisted.ok ? ok(result.value) : err(persisted.error.message);
    })
    .catch(() => err("This game could not be analyzed."))
    .finally(() => {
      runningAnalyses.delete(key);
    });
  previousAnalysis = task;
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
      timeBudgetPerPositionMs: 120,
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
  | { readonly status: "running" }
  | {
      readonly status: "ready";
      readonly game: GameRecord;
      readonly analysis: CompletedGameAnalysis;
    }
  | {
      readonly status: "failed";
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

const extensionPanel =
  location.protocol === "chrome-extension:" &&
  new URLSearchParams(location.search).get("panel") === "1";
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
  if (extensionPanel && (hash === "" || hash === "#review-home"))
    return "review-home";
  if (hash.startsWith("#review/")) return "review";
  if (hash.startsWith("#practice/")) return "practice";
  if (hash.startsWith("#result/")) return "result";
  if (hash === "#skill-tree" || hash.startsWith("#study/")) return "training";
  if (hash === "#rank-path") return "ranks";
  if (hash === "#account") return "account";
  if (
    hash === "#import" ||
    (location.protocol === "chrome-extension:" && hash.startsWith("#lichess/"))
  )
    return "import";
  if (hash === "#play-mode") return "play-mode";
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
export function App() {
  useEffect(startSubmissionSync, []);
  const [socialHash, setSocialHash] = useState(window.location.hash);
  const [entryRevision, setEntryRevision] = useState(0);
  const [view, setView] = useState<AppView>(() => routeView(location.hash));
  const [requested, setRequested] = useState(() => {
    try {
      return (
        socialView(window.location.hash) !== null ||
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
      if (next === "race" || next === "win" || next === "account")
        setRequested(true);
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
                location.hash.startsWith("#lichess/")) ||
              current === "ranks" ||
              current === "training" ||
              current === "review" ||
              current === "review-home" ||
              current === "play-mode" ||
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
        play: extensionPanel ? "#play" : "",
        account: "#account",
        ranks: "#rank-path",
        "play-mode": "#play-mode",
        practice: "#practice",
      };
      const target = path ?? paths[next] ?? "";
      if (location.hash !== target) enterPage(target, history.name);
      setSocialHash(target);
      setView(next);
    },
    [uid, history],
  );
  if (
    location.protocol === "chrome-extension:" &&
    socialHash.startsWith("#lichess/") &&
    requested &&
    !session
  ) {
    return (
      <main className="content-shell">
        <p role="status">{accountError ?? "Opening your ChessCue history…"}</p>
      </main>
    );
  }
  return (
    <HistoryOwner.Provider value={history.name}>
      <PlayerApp
        key={history.name + String(entryRevision)}
        history={history}
        socialHash={socialHash}
        user={user}
        session={session}
        accountError={accountError}
        view={view}
        setView={navigate}
        openAccount={() => {
          setRequested(true);
          navigate("account");
        }}
      />
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
  openAccount,
}: {
  socialHash: string;
  history: PlayerHistory;
  user: AccountIdentity | null;
  session: AccountSession | null;
  accountError: string | null;
  view: AppView;
  setView: (view: AppView, path?: string) => void;
  openAccount: () => void;
}) {
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
  const [contributingGames, setContributingGames] = useState({
    import: 0,
    tutor: 0,
  });
  const [profileReady, setProfileReady] = useState(false);
  const [ratings, setRatings] = useState<readonly RatingEntry[]>([]);
  const [ratedGame, setRatedGame] = useState<GameRecord | null>(null);
  const [recentWin, setRecentWin] = useState<GameRecord | null>(null);
  const [ratingError, setRatingError] = useState(false);
  const [studyVisit, setStudyVisit] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(() => {
    const parsed = skillSchema.safeParse(location.hash.split("/")[1]);
    return location.hash.startsWith("#study/") && parsed.success
      ? parsed.data
      : null;
  });
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
  const snapshot = usePlayingSnapshot(
    history,
    view === "training" || (view === "practice" && !curated && !mistakeDrill),
    snapshotRevision,
    loadGameAnalysis,
  );
  const curriculumRecommendation = useMemo(
    () =>
      snapshot.status === "ready"
        ? recommendCurriculumUnit(snapshot.moves)
        : null,
    [snapshot],
  );
  const GameAnalysisSection = extensionPanel ? "details" : Fragment;
  const recentReview = extensionPanel ? readRecentReview(history) : undefined;
  const recentReviewId = recentReview ? routedGameId(recentReview.route) : null;
  const recentReviewMoves =
    snapshot.status === "ready" && recentReviewId !== null
      ? snapshot.moves.filter((move) => move.game.id === recentReviewId)
      : [];
  const recentReviewDrill = (
    recentReviewMoves.find((move) => move.ply === recentReview?.ply) ??
    recentReviewMoves
      .filter((move) => move.outcome === "retry")
      .toSorted((a, b) => b.impactCp - a.impactCp)[0]
  )?.drill;
  const [drillCue, setDrillCue] = useState<AuthoredCue | null>(null);
  const primaryMove =
    snapshot.status === "ready"
      ? snapshot.plan.practice[0]?.moves[0]
      : undefined;
  const gameDrill = primaryMove?.drill ?? null;
  const trainingGame =
    primaryMove?.game ??
    (snapshot.status === "ready" ? snapshot.games.at(-1) : null) ??
    null;
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);
  const reviewCoachProvider = useReviewCoachProvider(view === "review");
  const activeNavigationView =
    extensionPanel && (view === "review" || view === "import")
      ? "review-home"
      : view === "review" || view === "practice"
        ? "training"
        : view === "result" || view === "play-mode" || view === "race"
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
      packRun:
        "authorship" in item.exercise
          ? exerciseSchema.safeParse(item.exercise).data?.authorship.runId
          : undefined,
      generated: item.exercise.id.startsWith("archive-")
        ? exerciseSchema.parse(item.exercise)
        : undefined,
    });
  }
  const anotherExercise =
    activePractice === null ||
    activePractice.exercise.id.startsWith("archive-curriculum-")
      ? undefined
      : transferExercisesForTheme(activePractice.exercise.theme).find(
          ({ id }) =>
            id !== activePractice.exercise.id &&
            !activePractice.seenExercises.includes(id),
        );
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

  const refreshAdaptiveProfile = useCallback(async (): Promise<void> => {
    const result = await loadAdaptiveProfile({
      games: repository,
      analyses: analysisRepository,
      reviews: reviewEvidenceRepository,
      initialTargetElo: 1450,
      curriculumVersion: "1.0.0",
      computedAt: new Date().toISOString(),
    });
    if (result.ok) {
      setProfile(result.value.profile);
      setContributingGames(result.value.contributingGames);
    }
  }, [repository, analysisRepository, reviewEvidenceRepository]);

  useEffect(() => {
    if (view !== "account" && view !== "race") return;
    const refresh = () => {
      void refreshRatings();
      if (view === "account") void refreshAdaptiveProfile();
    };
    refresh();
    window.addEventListener("chesscue-history", refresh);
    return () => {
      window.removeEventListener("chesscue-history", refresh);
    };
  }, [view, refreshAdaptiveProfile, refreshRatings]);
  const refreshHistory = useCallback(() => {
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

  const navigation = useMemo(
    () =>
      extensionPanel
        ? [
            { id: "review-home" as const, label: "Review" },
            { id: "training" as const, label: "Practice" },
            { id: "play" as const, label: "Play" },
          ]
        : [
            { id: "play" as const, label: "Play" },
            { id: "training" as const, label: "Training plan" },
            { id: "import" as const, label: "Import games" },
          ],
    [],
  );

  async function handleImport(request: ImportGamesRequest, singleGame = false) {
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
        const result = importGames({
          ...request,
          existingFingerprints: new Set(gamesByFingerprint.keys()),
          idFactory: newGameId,
          now: () => new Date().toISOString(),
          curriculumVersion: "1.0.0",
          configurationVersion: "1.0.0",
        });

        if (singleGame && result.items.length !== 1)
          throw new Error("Expected a single completed Lichess game.");
        await queueSubmittedGames(
          result.items.flatMap((item) =>
            item.status === "accepted"
              ? [item.game.originalPgn]
              : item.status === "duplicate"
                ? [item.originalPgn]
                : [],
          ),
        );
        const savedGames = new Map<number, GameRecord>();
        for (const item of result.items) {
          if (item.status === "duplicate") {
            const saved = gamesByFingerprint.get(item.fingerprint);
            if (saved) savedGames.set(item.index, saved);
            continue;
          }
          if (item.status !== "accepted") continue;
          const saved = await repository.put(item.game.record);
          if (!saved.ok) throw new Error(saved.error.message);
          const { record } = item.game;
          if (record.fingerprint !== null)
            gamesByFingerprint.set(record.fingerprint, record);
        }
        if (result.items.some(({ status }) => status === "accepted")) {
          setSnapshotRevision((n) => n + 1);
        }
        window.dispatchEvent(new Event("chesscue-history"));
        void refreshAdaptiveProfile();
        return { ...result, savedGames };
      },
    );
  }

  async function importLichessGame(
    game: LichessExport,
    color: PlayerColor,
  ): Promise<GameRecord> {
    const result = await handleImport(
      {
        text: game.pgn,
        source: { type: "upload", fileName: "lichess-" + game.id + ".pgn" },
        playerColor: color,
      },
      true,
    );
    const item = result.items[0];
    if (item?.status === "accepted") return item.game.record;
    if (item?.status === "duplicate") {
      const saved = result.savedGames.get(item.index);
      if (saved?.playerColor === color) return saved;
      throw new Error(
        "This game is already in your history from the other side.",
      );
    }
    throw new Error(item?.issue.message ?? "The game could not be imported.");
  }

  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [missingGame, setMissingGame] = useState(false);
  const gameRoute = location.hash;
  const sideSegment = gameRoute.split("/")[2];
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
      const id = routedGameId(gameRoute);
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
      setAnalysis({ status: "running" });
      const game = reviewPerspective
        ? { ...record.value, playerColor: reviewPerspective }
        : record.value;
      const result = reviewPerspective
        ? await loadPerspectiveAnalysis(game, request.signal)
        : await loadGameAnalysis(history, game);
      if (stale()) return;
      if (extensionPanel && result.ok) {
        try {
          localStorage.setItem(
            history.key(recentReviewKey),
            JSON.stringify({
              route: gameRoute,
              ply: result.value.moments[0]?.ply ?? null,
            }),
          );
        } catch {
          // Keep this review usable if local storage is unavailable.
        }
      }
      setAnalysis(
        result.ok
          ? { status: "ready", game, analysis: result.value }
          : { status: "failed", game, message: result.error },
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
    gameRoute,
    history,
    repository,
    reviewAttempt,
    reviewPerspective,
    refreshAdaptiveProfile,
  ]);
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

  function startGameDrill(drill: VerifiedGameDrill) {
    openPractice({
      id: drill.exercise.id,
      ...(drillCue?.id === drill.exercise.id &&
      drillCue.fen === drill.exercise.fen
        ? { cue: drillCue }
        : {}),
      exercise: drill.exercise,
      gamePrompt: {
        moveLabel: drill.moveLabel,
        question:
          drillCue?.id === drill.exercise.id
            ? drillCue.question
            : cachedReflection(drill.exercise.theme),
      },
    });
  }

  async function handleTrainingComplete(log: ReviewTrainingLog): Promise<void> {
    if (analysis.status !== "ready") return;
    const persisted = await reviewEvidenceRepository.put(
      createReviewEvidenceRecord({ gameId: analysis.game.id, log }),
    );
    if (persisted.ok) {
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
  const reviewBackLabel = reviewParent?.startsWith("#result/")
    ? "Back to game result"
    : extensionPanel
      ? "Back to Review"
      : reviewParent === "" || reviewParent === "#play"
        ? "Back to play"
        : reviewParent === "#import"
          ? "Back to import games"
          : "Back to training plan";
  const reviewBackButton = (
    <button
      className={extensionPanel ? "review-navigation__icon" : "lesson-back"}
      type="button"
      aria-label={extensionPanel ? reviewBackLabel : undefined}
      title={extensionPanel ? reviewBackLabel : undefined}
      onClick={() => {
        if (extensionPanel && !reviewParent?.startsWith("#result/")) {
          setView("review-home");
          return;
        }
        returnToParent(() => {
          setView(extensionPanel ? "review-home" : "training");
        });
      }}
    >
      {extensionPanel ? <span aria-hidden="true">←</span> : reviewBackLabel}
    </button>
  );

  return (
    <div className="app-frame">
      <header className="app-bar">
        <button
          className="brand"
          type="button"
          onClick={() => {
            setView("play");
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            ♜
          </span>
          <strong>ChessCue</strong>
        </button>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`app-command app-command--${item.id}`}
              type="button"
              aria-current={
                activeNavigationView === item.id ? "page" : undefined
              }
              onClick={() => {
                if (item.id === "training") {
                  setSelectedSkill(null);
                  setStudyVisit((n) => n + 1);
                }
                setView(
                  extensionPanel && item.id === "play" ? "play-mode" : item.id,
                );
              }}
            >
              <span className="app-command__icon" aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="account-button"
          aria-current={
            view === "account" || view === "ranks" ? "page" : undefined
          }
          onClick={openAccount}
        >
          Account
        </button>
      </header>
      {view === "review-home" && (
        <SidePanelReview
          repository={repository}
          historyRevision={snapshotRevision}
          lastReview={recentReview?.route ?? null}
          openGame={(route) => {
            setView("import", route);
          }}
          resumeReview={(route) => {
            setView("review", route);
          }}
          importPgn={() => {
            setView("import", "#import");
          }}
        />
      )}
      {view === "race" && (
        <Suspense fallback={<p>Loading race…</p>}>
          <RaceView
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
      )}
      {view === "win" && (
        <Suspense fallback={<p>Loading win…</p>}>
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
        ) : (
          <p role="status">
            {ratingError ? "Rank unavailable" : "Loading rank path…"}
          </p>
        ))}
      {view === "account" && (
        <AccountPanel
          compact={extensionPanel}
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
              <p>Loading your progress…</p>
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
            <ProfileOverview
              profile={profile}
              contributingGames={contributingGames}
            />
          </div>
        </AccountPanel>
      )}

      {view === "play" ? (
        <PlayGameScreen
          noteScope={history.name}
          mode={playMode}
          readyToStart={profileReady}
          placementCount={placementCount(ratings.at(-1))}
          resumeGameId={playEntry?.gameId}
          engine={engine}
          assessPosition={readBoardPosition}
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
        <main className="content-shell">
          <section
            className="play-mode-setup"
            aria-labelledby="play-mode-title"
          >
            <h1 id="play-mode-title">Game mode</h1>
            <div className="game-mode-choices">
              {(["rated", "coached"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`game-mode-choice game-mode-choice--${mode}`}
                  aria-labelledby={`mode-${mode}`}
                  aria-describedby={`mode-${mode}-description`}
                  disabled={!profileReady}
                  onClick={() => {
                    openGame(mode);
                  }}
                >
                  <strong id={`mode-${mode}`}>
                    {mode === "rated" ? "Rated" : "Coached"}
                  </strong>
                  <span id={`mode-${mode}-description`}>
                    {mode === "rated"
                      ? "Play unassisted for Elo."
                      : "Play unrated with optional coach notes."}
                  </span>
                </button>
              ))}
            </div>
            <div className="play-mode-social">
              <a className="review-action" href="#races">
                Elo races
              </a>
              {recentWin && (
                <Suspense>
                  <ShareWin
                    key={recentWin.id}
                    game={recentWin}
                    uid={user?.uid ?? null}
                    session={session}
                  />
                </Suspense>
              )}
            </div>
          </section>
        </main>
      ) : null}

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
                <Suspense>
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
                {ratingError
                  ? "Your rating is unavailable"
                  : "Calculating your Elo"}
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

      {view === "practice" && !activePractice && (
        <p role="status">
          {snapshot.status === "checking" || openingReviewMistake
            ? "Opening practice…"
            : "This practice position is unavailable."}
        </p>
      )}
      {view === "practice" && activePractice !== null ? (
        <PracticePosition
          key={activePractice.id}
          compact={extensionPanel}
          exercise={activePractice.exercise}
          gamePrompt={activePractice.gamePrompt}
          analyzeReply={loadReviewReply}
          assessPosition={readBoardPosition}
          onRatedGame={() => {
            openGame("rated");
          }}
          onTrainingPlan={() => {
            if (
              parentPage()?.startsWith("#study/") ||
              parentPage() === "#skill-tree"
            )
              returnToParent(() => {
                setView("training");
              });
            else setView("training");
          }}
          onAnotherPosition={
            anotherExercise === undefined
              ? undefined
              : () => {
                  openPractice({
                    id: anotherExercise.id,
                    exercise: anotherExercise,
                    seenExercises: [
                      ...activePractice.seenExercises,
                      activePractice.exercise.id,
                    ],
                  });
                }
          }
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
            if (!duePractice.some(({ id }) => id === activePractice.id)) return;
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

      {view === "import" ? (
        <main className="content-shell content-shell--narrow">
          {extensionPanel && (
            <button
              type="button"
              className="lesson-back"
              onClick={() => {
                setView("review-home");
              }}
            >
              Back to Review
            </button>
          )}
          {location.protocol === "chrome-extension:" &&
          location.hash.startsWith("#lichess/") ? (
            <LichessImport
              key={location.hash}
              route={location.hash}
              importGame={importLichessGame}
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

      {view === "training" && (
        <header className="training-header">
          <h1>{extensionPanel ? "Practice" : "Training plan"}</h1>
          <PracticeSection name="ChessCue curriculum">
            <PracticeCurriculum
              recommendation={curriculumRecommendation}
              onPractice={(exercise) => {
                openPractice({ id: exercise.id, exercise });
              }}
            />
          </PracticeSection>
          {mistakeSaveError && <p role="status">{mistakeSaveError}</p>}
          {reviewMistakes.some(({ completed }) => !completed) && (
            <section
              className="side-panel-follow-up review-mistake-queue"
              aria-label="Mistakes from PGN reviews"
            >
              <h2>Mistakes from PGN reviews</h2>
              <ul>
                {reviewMistakes
                  .filter(({ completed }) => !completed)
                  .flatMap((mistake) => {
                    const drill = reviewMistakePractice(mistake);
                    if (!drill) return [];
                    return [
                      <li key={mistake.id}>
                        <button
                          type="button"
                          className="review-action"
                          onClick={() => {
                            openPractice({
                              id: mistake.id,
                              exercise: drill.exercise,
                            });
                          }}
                        >
                          Retry {drill.attemptedSan}
                        </button>
                      </li>,
                    ];
                  })}
              </ul>
            </section>
          )}
          {extensionPanel && recentReviewDrill && (
            <section
              className="side-panel-follow-up"
              aria-label="Practice from your last review"
            >
              <h2>From your last review</h2>
              <button
                type="button"
                className="primary-link"
                onClick={() => {
                  startGameDrill(recentReviewDrill);
                }}
              >
                {recentReviewDrill.moveLabel}
              </button>
            </section>
          )}
          <PracticeSection name="Shared puzzle library">
            <SharedPuzzleLibrary
              onPractice={({ exercise }) => {
                openPractice({ id: exercise.id, exercise });
              }}
            />
          </PracticeSection>
        </header>
      )}
      {view === "training" ? (
        <GameAnalysisSection
          {...(extensionPanel
            ? { className: "shared-puzzle-library practice-game-analysis" }
            : {})}
        >
          {extensionPanel && <summary>Game analysis by skill</summary>}
          <SkillTree
            profile={profile}
            selected={selectedSkill}
            onSelect={(skill) => {
              const hash = "#study/" + skill;
              if (hash !== location.hash) {
                enterPage(hash, history.name);
                setStudyVisit((n) => n + 1);
              }
              setSelectedSkill(skill);
            }}
            lessons={(skill) => {
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
                  loading={<p role="status">Opening lessons…</p>}
                >
                  <StudySkill.Provider value={skill}>
                    <StudyScreen
                      key={skill + String(studyVisit)}
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
            }}
            snapshot={snapshot}
            onImport={() => {
              setView("import");
            }}
            onPlay={() => {
              openGame("rated");
            }}
            evidence={
              snapshot.status === "ready"
                ? snapshot.plan.backRank
                : { total: 0, found: 0, missedFen: null }
            }
            verifiedDrill={gameDrill}
            onStartDrill={startGameDrill}
            duePractice={
              snapshot.status === "ready"
                ? duePractice.filter((item) =>
                    snapshot.games.some(
                      (game) =>
                        game.id === item.sourceGameId && game.moves.length > 0,
                    ),
                  )
                : []
            }
            onDuePractice={(id) => {
              const item = duePractice.find((practice) => practice.id === id);
              if (!item) return;
              openPractice(item);
            }}
            gameTraining={
              trainingGame && (
                <GameTraining
                  key={gameDrill?.exercise.id ?? trainingGame.id}
                  drill={gameDrill}
                  message={
                    gameDrill
                      ? null
                      : "Open the game review to see its checked positions."
                  }
                  onCue={setDrillCue}
                  onRetry={startGameDrill}
                  onFollowUp={(exercise, question) => {
                    openPractice({
                      id: exercise.id,
                      exercise: question
                        ? { ...exercise, prompt: question }
                        : exercise,
                    });
                  }}
                  onReview={() => {
                    analyzeGame(trainingGame);
                  }}
                  onRatedGame={() => {
                    openGame("rated");
                  }}
                  observations={
                    gameDrill === null
                      ? 0
                      : profile.mastery[
                          gameDrill.exercise.theme ===
                          "premature-central-exchange"
                            ? "central-pawn-tension"
                            : gameDrill.exercise.theme
                        ].evidenceCount
                  }
                  storageKey={history.key("chesscue-game-training-path-v1")}
                />
              )
            }
            onPractice={(theme) => {
              const exercise = transferExercisesForTheme(theme).find(
                (item) => item.difficulty === "unlabeled",
              );
              if (!exercise) return;
              const scheduled = duePractice.find(
                (item) => item.exercise.id === exercise.id,
              );
              openPractice(scheduled ?? { id: exercise.id, exercise });
            }}
            focusGame={
              gameDrill &&
              profile.mastery[profile.nextGame.focus].evidenceCount > 0 &&
              (gameDrill.exercise.theme === "premature-central-exchange"
                ? "central-pawn-tension"
                : gameDrill.exercise.theme) === profile.nextGame.focus ? (
                <>
                  <CurriculumCard
                    prescription={{
                      ...profile.nextGame,
                      targetElo: ratedOpponentElo(targetElo),
                    }}
                    mastery={profile.mastery[profile.nextGame.focus]}
                  />
                  <button
                    className="primary-link"
                    type="button"
                    onClick={() => {
                      openGame("coached");
                    }}
                  >
                    Play this focus game
                  </button>
                </>
              ) : null
            }
          />
        </GameAnalysisSection>
      ) : null}

      {view === "review" ? (
        <main className="content-shell review-page">
          {(!extensionPanel || analysis.status !== "ready" || missingGame) &&
            reviewBackButton}
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
          {missingGame ? (
            <p role="alert">
              This game is unavailable in this player’s history.
            </p>
          ) : analysis.status === "running" ? (
            <section className="review-page__state" aria-live="polite">
              <p className="section-kicker">Stockfish review</p>
              <h1>Analyzing your game</h1>
              <p>
                Checking each decision and validating every replay line. This
                can take a few seconds.
              </p>
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
            </section>
          ) : null}
          {analysis.status === "ready" ? (
            <div className="review-page__experience">
              <GameReviewExperience
                key={analysis.game.id}
                analyzeReply={loadReviewReply}
                assessPosition={readBoardPosition}
                game={analysis.game}
                analysis={analysis.analysis}
                coachProvider={reviewCoachProvider}
                reviewBack={extensionPanel ? reviewBackButton : undefined}
                reviewSource={
                  extensionPanel ? (
                    <p className="review-page__notice">
                      {analysis.game.origin.type === "pgn-upload" &&
                      /^lichess-[a-z0-9]{8}\.pgn$/i.test(
                        analysis.game.origin.sourceName,
                      ) ? (
                        <a
                          href={
                            "https://lichess.org/" +
                            analysis.game.origin.sourceName.slice(8, -4)
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          Lichess game
                        </a>
                      ) : analysis.game.origin.type === "tutor" ? (
                        "ChessCue game"
                      ) : (
                        "Imported game"
                      )}
                    </p>
                  ) : undefined
                }
                compact={extensionPanel}
                onMistake={
                  analysis.game.origin.type === "tutor"
                    ? undefined
                    : (evidence) => {
                        if (!analysis.game.result || !analysis.game.completedAt)
                          return;
                        void saveReviewMistake(
                          history.name,
                          analysis.game.id,
                          evidence,
                        )
                          .then(() => {
                            window.dispatchEvent(
                              new Event("chesscue-review-practice"),
                            );
                          })
                          .catch(() => {
                            setMistakeSaveError(
                              "A review mistake could not be saved for practice.",
                            );
                          });
                      }
                }
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
