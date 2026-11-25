import { usePlayingSnapshot } from "./use-playing-snapshot";
import { err, ok, type Result } from "../shared/result/result";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
import { importGames } from "../application/import-games/import-games";
import { evaluateReviewReply } from "../application/analyze-game/analyze-review-reply";
import {
  assessPosition,
  type AssessPosition,
} from "../application/analyze-game/assess-position";
import type { ReviewTrainingLog } from "../domain/analysis/review-training";
import { buildPlayerProfile, type PlayerProfile } from "../domain/curriculum";
import {
  createGameId,
  createPositionId,
  type GameId,
  type GameRecord,
  type TutorGameMode,
} from "../domain/game/types";
import { CurriculumCard } from "../features/curriculum/CurriculumCard";
import {
  ImportGamesPanel,
  type ImportGamesRequest,
} from "../features/import-games/ImportGamesPanel";
import { PlayGameScreen } from "../features/play/PlayGameScreen";
import { ProfileOverview } from "../features/profile/ProfileOverview";
import { GameReviewExperience } from "../features/review/GameReviewExperience";
import type { LessonContentProvider } from "../infrastructure/ai/lesson-content-provider";
import { loadFirebaseClientConfig } from "../infrastructure/config/firebase-environment";
import { StockfishAnalysisEngine } from "../infrastructure/engine/stockfish-analysis-engine";
import { StockfishGameEngine } from "../infrastructure/engine/stockfish-game-engine";
import { useRaceAccount } from "../features/race/use-race-account";
import { AccountPanel } from "../features/account/AccountPanel";
import { initialSync } from "../application/sync-games/sync-status";
import type { PlayerHistory } from "../infrastructure/persistence/player-history";
import {
  ratingHistory,
  placementCount,
  INITIAL_PLAYER_ELO,
} from "../domain/game/rating";

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
type AppView = "play" | "import" | "training" | "review" | "study";
function raceRoute(hash: string) {
  if (hash === "#account") return "account";
  if (hash === "#races" || hash.startsWith("#race/")) return "race";
  if (hash.startsWith("#win/") || hash.startsWith("#mate/")) return "win";
  return null;
}

const engine = new StockfishGameEngine();
const analysisEngine = new StockfishAnalysisEngine();
const reviewReplyEngine = new StockfishAnalysisEngine();
const loadReviewReply = (fen: string, signal: AbortSignal) =>
  evaluateReviewReply(reviewReplyEngine, fen, signal);
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

type AnalysisViewState =
  | { readonly status: "idle" }
  | { readonly status: "running"; readonly game: GameRecord }
  | {
      readonly status: "ready";
      readonly game: GameRecord;
      readonly analysis: CompletedGameAnalysis;
    }
  | { readonly status: "failed"; readonly message: string };

const initialProfile = buildPlayerProfile({
  initialTargetElo: 1450,
  curriculumVersion: "1.0.0",
  computedAt: new Date().toISOString(),
  evidence: [],
  tutorGames: [],
});

const playModeStorage = "chesscue-active-play-mode";

interface PlaySelection {
  readonly mode: TutorGameMode;
  readonly gameId?: GameId;
}

function readPlaySelection(history: PlayerHistory): PlaySelection {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(history.key(playModeStorage)) ?? "null",
    );
    if (
      typeof value === "object" &&
      value !== null &&
      "mode" in value &&
      (value.mode === "rated" || value.mode === "coached")
    ) {
      return {
        mode: value.mode,
        ...("gameId" in value &&
        typeof value.gameId === "string" &&
        value.gameId.trim()
          ? { gameId: createGameId(value.gameId) }
          : {}),
      };
    }
  } catch {
    /* A saved mode is optional and game storage remains authoritative. */
  }
  return { mode: "rated" };
}

function savePlaySelection(history: PlayerHistory, selection: PlaySelection) {
  try {
    localStorage.setItem(
      history.key(playModeStorage),
      JSON.stringify(selection),
    );
  } catch {
    /* The user can still change modes in this visit. */
  }
}

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

export function App() {
  const [hash, setHash] = useState(location.hash);
  const [accessRequested, setAccessRequested] = useState(
    () =>
      !!raceRoute(location.hash) ||
      localStorage.getItem("chesscue-auth-used") === "1",
  );
  useEffect(() => {
    const navigate = () => {
      setHash(location.hash);
      if (raceRoute(location.hash)) setAccessRequested(true);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const account = useRaceAccount(accessRequested);
  return <PlayerApp key={account.history.name} account={account} hash={hash} />;
}
function PlayerApp({
  account,
  hash,
}: {
  account: ReturnType<typeof useRaceAccount>;
  hash: string;
}) {
  const { user, session, history } = account;
  const repository = history.games,
    analysisRepository = history.analyses,
    reviewEvidenceRepository = history.reviews;
  const loadAnalysis = useCallback(
    (game: GameRecord) => loadGameAnalysis(history, game),
    [history],
  );
  const social = raceRoute(hash);
  const [view, changeView] = useState<AppView>("play");
  const setView = useCallback((next: AppView) => {
    if (raceRoute(location.hash)) location.hash = "";
    changeView(next);
  }, []);
  const [sync, setSync] = useState(initialSync);
  const [ratedGames, setRatedGames] = useState<readonly GameRecord[]>([]);
  const ratings = useMemo(() => ratingHistory(ratedGames), [ratedGames]);
  const latestWin = ratings.findLast((r) => r.result === "Won");
  const wonGame =
    latestWin && ratedGames.find((g) => g.id === latestWin.gameId);
  function openRatedGame() {
    selectPlayMode("rated");
    setView("play");
  }
  const refreshGames = useCallback(async () => {
    const all = await repository.listCompleted();
    if (all.ok) setRatedGames(all.value);
  }, [repository]);
  const refreshSync = useCallback(() => {
    void refreshGames();
  }, [refreshGames]);
  useEffect(
    () => session?.sync(history, setSync, refreshSync),
    [session, history, refreshSync],
  );
  useEffect(() => {
    void refreshGames();
    window.addEventListener("chesscue-history", refreshSync);
    return () => window.removeEventListener("chesscue-history", refreshSync);
  }, [refreshGames, refreshSync]);

  useLayoutEffect(() => {
    if (view === "review") window.scrollTo(0, 0);
  }, [view]);
  const [playSelection, setPlaySelection] = useState(() =>
    readPlaySelection(history),
  );
  const [playInstance, setPlayInstance] = useState(0);

  function selectPlayMode(mode: TutorGameMode) {
    const selection = { mode };
    savePlaySelection(history, selection);
    setPlaySelection(selection);
    setPlayInstance((instance) => instance + 1);
  }

  function rememberCoachJoin(gameId: GameId) {
    const selection: PlaySelection = { mode: "coached", gameId };
    savePlaySelection(history, selection);
    setPlaySelection(selection);
  }
  const [analysis, setAnalysis] = useState<AnalysisViewState>({
    status: "idle",
  });
  const [profile, setProfile] = useState<PlayerProfile>(initialProfile);
  const [contributingGames, setContributingGames] = useState({
    import: 0,
    tutor: 0,
  });
  const [profileReady, setProfileReady] = useState(false);
  const snapshot = usePlayingSnapshot(
    repository,
    analysisRepository,
    view === "study",
    loadAnalysis,
  );
  const reviewCoachProvider = useReviewCoachProvider(view === "review");
  const activeNavigationView =
    view === "review" || view === "study" ? "training" : view;
  const targetElo = profile.nextGame.targetElo;
  const focus = profile.nextGame.reason;

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
    setProfileReady(true);
  }, [repository, analysisRepository, reviewEvidenceRepository]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshAdaptiveProfile();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [refreshAdaptiveProfile]);

  const navigation = useMemo(
    () => [
      { id: "play" as const, label: "Play" },
      { id: "import" as const, label: "Bring games" },
      { id: "training" as const, label: "Training plan" },
    ],
    [],
  );

  async function handleImport(request: ImportGamesRequest) {
    const completed = await repository.listCompleted();
    if (!completed.ok) throw new Error(completed.error.message);

    const existingFingerprints = new Set(
      completed.value.flatMap((game) =>
        game.fingerprint === null ? [] : [game.fingerprint],
      ),
    );
    const result = importGames({
      ...request,
      existingFingerprints,
      idFactory: newGameId,
      now: () => new Date().toISOString(),
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
    });

    for (const item of result.items) {
      if (item.status !== "accepted") continue;
      const saved = await repository.put(item.game.record);
      if (!saved.ok) throw new Error(saved.error.message);
    }
    await refreshAdaptiveProfile();
    return result;
  }

  const analyzeGame = useCallback(
    async (game: GameRecord): Promise<void> => {
      setView("review");
      setAnalysis({ status: "running", game });
      const result = await loadAnalysis(game);
      if (!result.ok) {
        setAnalysis({ status: "failed", message: result.error });
        return;
      }
      setAnalysis({ status: "ready", game, analysis: result.value });
      await refreshAdaptiveProfile();
    },
    [refreshAdaptiveProfile, loadAnalysis, setView],
  );

  async function analyzeLatestGame(): Promise<void> {
    const completed = await repository.listCompleted();
    if (!completed.ok) {
      setView("review");
      setAnalysis({ status: "failed", message: completed.error.message });
      return;
    }
    const game = completed.value.findLast(
      (record) => record.result !== null && record.playerColor !== null,
    );
    if (game === undefined) {
      setView("review");
      setAnalysis({
        status: "failed",
        message:
          "Finish a tutor game or import a completed game with your color before requesting a review.",
      });
      return;
    }
    await analyzeGame(game);
  }

  const handleCompletedTutorGame = useCallback(
    async (game: GameRecord): Promise<void> => {
      window.dispatchEvent(new Event("chesscue-history"));
      await analyzeGame(game);
    },
    [analyzeGame],
  );

  async function handleTrainingComplete(log: ReviewTrainingLog): Promise<void> {
    if (analysis.status !== "ready") return;
    const persisted = await reviewEvidenceRepository.put(
      createReviewEvidenceRecord({ gameId: analysis.game.id, log }),
    );
    if (persisted.ok) await refreshAdaptiveProfile();
  }

  const header = (
    <header className="app-bar">
      <button
        className="brand"
        type="button"
        onClick={() => {
          setView("play");
        }}
      >
        <span className="brand-mark" aria-hidden="true" />
        <span>
          <strong>ChessCue</strong>
          <small>Adaptive training</small>
        </span>
      </button>
      <nav aria-label="Primary navigation">
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={activeNavigationView === item.id ? "page" : undefined}
            onClick={() => {
              setView(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button
        className="local-status"
        type="button"
        onClick={() => {
          location.hash = "account";
        }}
      >
        Account
      </button>
    </header>
  );
  if (social)
    return (
      <div className="app-frame">
        {header}

        {social === "account" && (
          <AccountPanel
            user={user}
            session={session}
            history={history}
            sync={sync}
            error={account.error}
            merged={() => {
              window.dispatchEvent(new Event("chesscue-history"));
              void refreshAdaptiveProfile();
            }}
          >
            <section>
              <a className="review-action" href="#races">
                Elo races
              </a>
              <p>
                {placementCount(ratings.at(-1)) === null
                  ? String(ratings.at(-1)?.after) + " Elo"
                  : "In placement"}
              </p>
              {wonGame && (
                <Suspense>
                  <ShareWin
                    key={wonGame.id}
                    game={wonGame}
                    session={session}
                    uid={user?.uid ?? null}
                  />
                </Suspense>
              )}
            </section>
          </AccountPanel>
        )}
        {social === "race" && (
          <Suspense fallback={<p>Loading race…</p>}>
            <RaceView
              key={hash}
              id={hash.startsWith("#race/") ? hash.slice(6) : null}
              user={user}
              session={session}
              ratings={ratings}
              onPlay={openRatedGame}
              accountError={account.error}
              conflict={sync.conflicts.some((k) => k.startsWith("games/"))}
              uploadsPending={sync.pending > 0}
            />
          </Suspense>
        )}
        {social === "win" && (
          <Suspense fallback={<p>Loading win…</p>}>
            <SharedWinView
              key={hash}
              id={hash.slice(hash.indexOf("/") + 1)}
              guest={hash.startsWith("#mate/")}
              session={session}
              unavailable={!!account.error}
              onPlay={openRatedGame}
            />
          </Suspense>
        )}
      </div>
    );
  return (
    <div className="app-frame">
      {header}{" "}
      {view === "play" && profileReady ? (
        <PlayGameScreen
          noteScope={history.name}
          key={playInstance}
          mode={playSelection.mode}
          {...(playSelection.gameId === undefined
            ? {}
            : { resumeGameId: playSelection.gameId })}
          onModeChange={selectPlayMode}
          onCoachJoined={rememberCoachJoin}
          engine={engine}
          repository={repository}
          createGameId={newGameId}
          createPositionId={newPositionId}
          targetElo={
            playSelection.mode === "rated"
              ? (ratings.at(-1)?.after ?? INITIAL_PLAYER_ELO)
              : targetElo
          }
          focusTheme={profile.nextGame.focus}
          focusTitle={titleCase(profile.nextGame.focus)}
          focus={focus}
          onGameCompleted={handleCompletedTutorGame}
        />
      ) : null}
      {view === "play" && !profileReady ? (
        <main className="content-shell review-page">
          <section className="review-page__state" aria-live="polite">
            <p className="section-kicker">ChessCue</p>
            <h1>Loading your training plan</h1>
            <p>
              Rebuilding your next focus from saved games and review evidence.
            </p>
          </section>
        </main>
      ) : null}
      {view === "import" ? (
        <main className="content-shell content-shell--narrow">
          <ImportGamesPanel onImport={handleImport} />
        </main>
      ) : null}
      {view === "training" ? (
        <main className="content-shell training-layout">
          <div className="training-hero">
            <p className="section-kicker">Your next experience</p>
            <CurriculumCard
              prescription={profile.nextGame}
              mastery={profile.mastery[profile.nextGame.focus]}
            />
            <button
              className="primary-link"
              type="button"
              onClick={() => {
                setView("play");
              }}
            >
              Play this focus game
            </button>
          </div>
          <section
            className="review-card study-entry"
            aria-labelledby="study-title"
          >
            <h2 id="study-title">Study positions</h2>
            <p>Compare a move from your game with a historical example.</p>
            <button
              type="button"
              className="review-action"
              onClick={() => {
                setView("study");
              }}
            >
              Open study board
            </button>
          </section>
          <div className="training-profile">
            <ProfileOverview
              profile={profile}
              contributingGames={contributingGames}
            />
          </div>
          <section className="review-card" aria-labelledby="review-card-title">
            <p className="section-kicker">Stockfish review</p>
            <h2 id="review-card-title">Analyze your latest game</h2>
            <p>
              Tutor and imported games use the same validated analysis before a
              moment can influence your curriculum.
            </p>
            <button
              className="review-action"
              type="button"
              onClick={() => {
                void analyzeLatestGame();
              }}
            >
              Analyze latest game
            </button>
          </section>
        </main>
      ) : null}
      {view === "study" && (
        <main className="content-shell review-page study-page">
          <button
            type="button"
            className="lesson-back"
            onClick={() => {
              setView("training");
            }}
          >
            Back to training plan
          </button>
          <Suspense fallback={<p role="status">Opening study positions…</p>}>
            <StudyScreen
              history={snapshot}
              pattern={
                snapshot.status === "ready"
                  ? snapshot.plan.practice[0]
                  : undefined
              }
              storageKey={history.key("chesscue-study-roadmaps-v1")}
              profile={profile}
            />
          </Suspense>
        </main>
      )}
      {view === "review" &&
        wonGame &&
        (analysis.status === "ready" || analysis.status === "running") &&
        analysis.game.id === wonGame.id && (
          <Suspense>
            <ShareWin
              game={wonGame}
              session={session}
              uid={user?.uid ?? null}
            />
          </Suspense>
        )}
      {view === "review" ? (
        <main className="content-shell review-page">
          <button
            className="lesson-back"
            type="button"
            onClick={() => {
              setView("training");
            }}
          >
            Back to training plan
          </button>
          {analysis.status === "running" ? (
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
                  void analyzeLatestGame();
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
                onTrainingComplete={(log) => {
                  void handleTrainingComplete(log);
                }}
              />
            </div>
          ) : null}
        </main>
      ) : null}
    </div>
  );
}
