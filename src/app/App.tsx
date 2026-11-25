import { usePlayingSnapshot } from "./use-playing-snapshot";
import { err, ok, type Result } from "../shared/result/result";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
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
import type { ReviewTrainingLog } from "../domain/analysis/review-training";
import { buildPlayerProfile, type PlayerProfile } from "../domain/curriculum";
import {
  createGameId,
  createPositionId,
  type GameRecord,
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
import { IndexedDbGameRepository } from "../infrastructure/persistence/indexeddb-game-repository";
import { IndexedDbAnalysisRepository } from "../infrastructure/persistence/indexeddb-analysis-repository";
import { IndexedDbReviewEvidenceRepository } from "../infrastructure/persistence/indexeddb-review-evidence-repository";

const StudyScreen = lazy(() =>
  import("../features/study/StudyScreen").then((module) => ({
    default: module.StudyScreen,
  })),
);
type AppView = "play" | "import" | "training" | "review" | "study";

const repository = new IndexedDbGameRepository();
const analysisRepository = new IndexedDbAnalysisRepository();
const reviewEvidenceRepository = new IndexedDbReviewEvidenceRepository();
const engine = new StockfishGameEngine();
const analysisEngine = new StockfishAnalysisEngine();
const firebaseConfiguration = loadFirebaseClientConfig();

const runningAnalyses = new Map<
  string,
  Promise<Result<CompletedGameAnalysis, string>>
>();
let previousAnalysis: Promise<unknown> = Promise.resolve();

function loadGameAnalysis(
  game: GameRecord,
): Promise<Result<CompletedGameAnalysis, string>> {
  const key = game.id;
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
  | { readonly status: "running" }
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
  const [view, setView] = useState<AppView>("play");
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
    loadGameAnalysis,
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
  }, []);

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
      setAnalysis({ status: "running" });
      const result = await loadGameAnalysis(game);
      if (!result.ok) {
        setAnalysis({ status: "failed", message: result.error });
        return;
      }
      setAnalysis({ status: "ready", game, analysis: result.value });
      await refreshAdaptiveProfile();
    },
    [refreshAdaptiveProfile],
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
              aria-current={
                activeNavigationView === item.id ? "page" : undefined
              }
              onClick={() => {
                setView(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="local-status" title="Games are saved in this browser">
          <span aria-hidden="true" /> Local-first
        </span>
      </header>

      {view === "play" && profileReady ? (
        <PlayGameScreen
          engine={engine}
          repository={repository}
          createGameId={newGameId}
          createPositionId={newPositionId}
          targetElo={targetElo}
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
              storageKey="chesscue-study-roadmaps-v1"
              profile={profile}
            />
          </Suspense>
        </main>
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
