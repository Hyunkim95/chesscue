import { useEffect, useMemo, useState } from "react";

import {
  analyzeCompletedGame,
  type CompletedGameAnalysis,
} from "../application/analyze-game/analyze-completed-game";
import { importGames } from "../application/import-games/import-games";
import { buildPlayerProfile } from "../domain/curriculum";
import {
  createGameId,
  createPositionId,
  type GameRecord,
} from "../domain/game/types";
import {
  canonicalHangingPieceFacts,
  hangingPiecePlaybook,
} from "../domain/lessons";
import { CurriculumCard } from "../features/curriculum/CurriculumCard";
import {
  ImportGamesPanel,
  type ImportGamesRequest,
} from "../features/import-games/ImportGamesPanel";
import { LessonExperience } from "../features/lessons";
import { PlayGameScreen } from "../features/play/PlayGameScreen";
import { ProfileOverview } from "../features/profile/ProfileOverview";
import { GameReviewExperience } from "../features/review/GameReviewExperience";
import type { LessonContentProvider } from "../infrastructure/ai/lesson-content-provider";
import { loadFirebaseClientConfig } from "../infrastructure/config/firebase-environment";
import { StockfishAnalysisEngine } from "../infrastructure/engine/stockfish-analysis-engine";
import { StockfishGameEngine } from "../infrastructure/engine/stockfish-game-engine";
import { IndexedDbGameRepository } from "../infrastructure/persistence/indexeddb-game-repository";

type AppView = "play" | "import" | "training" | "review" | "lesson";

const repository = new IndexedDbGameRepository();
const engine = new StockfishGameEngine();
const analysisEngine = new StockfishAnalysisEngine();
const firebaseConfiguration = loadFirebaseClientConfig();
const demoLessonRunId = crypto.randomUUID();
const demoLessonStartedAt = new Date().toISOString();

type AnalysisViewState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | {
      readonly status: "ready";
      readonly game: GameRecord;
      readonly analysis: CompletedGameAnalysis;
    }
  | { readonly status: "failed"; readonly message: string };

const seededProfile = buildPlayerProfile({
  initialTargetElo: 1450,
  curriculumVersion: "1.0.0",
  computedAt: "2026-11-24T12:00:00.000Z",
  evidence: [
    {
      id: "evidence-hanging-1",
      theme: "hanging-piece",
      origin: "tutor",
      outcome: "weakness",
      impact: 0.9,
      confidence: 0.92,
      occurredAt: "2026-11-23T12:00:00.000Z",
      phase: "middlegame",
      sourceGameId: "seed-game-1",
    },
    {
      id: "evidence-hanging-2",
      theme: "hanging-piece",
      origin: "import",
      outcome: "weakness",
      impact: 0.8,
      confidence: 0.8,
      occurredAt: "2026-11-22T12:00:00.000Z",
      phase: "opening",
      sourceGameId: "seed-game-2",
    },
  ],
  tutorGames: [
    { id: "seed-game-1", completedAt: "2026-11-23T12:00:00.000Z", score: 0 },
    { id: "seed-game-3", completedAt: "2026-11-24T08:00:00.000Z", score: 1 },
  ],
});

const newGameId = () => createGameId(crypto.randomUUID());
const newPositionId = () => createPositionId(crypto.randomUUID());
const titleCase = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function useLessonProvider(enabled: boolean): LessonContentProvider | null {
  const [provider, setProvider] = useState<LessonContentProvider | null>(null);

  useEffect(() => {
    if (
      !enabled ||
      !firebaseConfiguration.ok ||
      firebaseConfiguration.value === null
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
        enableAppCheck: import.meta.env.PROD,
      });
      if (firebase.status !== "ready") return;
      setProvider(
        providerModule.createFirebaseHybridLessonContentProvider({
          firebaseApp: firebase.services.app,
          timeoutMs: 10_000,
        }),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return provider;
}

export function App() {
  const [view, setView] = useState<AppView>("play");
  const [analysis, setAnalysis] = useState<AnalysisViewState>({
    status: "idle",
  });
  const lessonProvider = useLessonProvider(view === "lesson");
  const activeNavigationView =
    view === "lesson" || view === "review" ? "training" : view;
  const targetElo = seededProfile.nextGame.targetElo;
  const focus = seededProfile.nextGame.reason;

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
    return result;
  }

  async function analyzeLatestTutorGame(): Promise<void> {
    setView("review");
    setAnalysis({ status: "running" });
    const completed = await repository.listCompleted();
    if (!completed.ok) {
      setAnalysis({ status: "failed", message: completed.error.message });
      return;
    }
    const game = completed.value.findLast(
      (record) => record.origin.type === "tutor" && record.result !== null,
    );
    if (game === undefined) {
      setAnalysis({
        status: "failed",
        message: "Finish a tutor game before requesting a verified review.",
      });
      return;
    }

    const controller = new AbortController();
    const result = await analyzeCompletedGame({
      game,
      engine: analysisEngine,
      analysisVersion: "stockfish-19-lite@1",
      timeBudgetPerPositionMs: 120,
      signal: controller.signal,
    });
    if (!result.ok) {
      setAnalysis({ status: "failed", message: result.error.message });
      return;
    }
    setAnalysis({ status: "ready", game, analysis: result.value });
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

      {view === "play" ? (
        <PlayGameScreen
          engine={engine}
          repository={repository}
          createGameId={newGameId}
          createPositionId={newPositionId}
          targetElo={targetElo}
          focusTitle={titleCase(seededProfile.nextGame.focus)}
          focus={focus}
        />
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
              prescription={seededProfile.nextGame}
              mastery={seededProfile.mastery[seededProfile.nextGame.focus]}
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
          <div className="training-profile">
            <ProfileOverview profile={seededProfile} />
          </div>
          <section
            className="playbook-note"
            aria-labelledby="playbook-note-title"
          >
            <p className="section-kicker">Lesson agents</p>
            <h2 id="playbook-note-title">Predictable by playbook</h2>
            <p>
              Lessons follow versioned teaching steps. Stockfish supplies the
              facts, while AI may personalize wording without changing scoring,
              progression, or your next game.
            </p>
            <button
              className="primary-link"
              type="button"
              onClick={() => {
                setView("lesson");
              }}
            >
              Start playbook lesson
            </button>
          </section>
          <section className="review-card" aria-labelledby="review-card-title">
            <p className="section-kicker">Stockfish review</p>
            <h2 id="review-card-title">Analyze your latest tutor game</h2>
            <p>
              The analysis worker validates every line before a moment can
              influence your curriculum.
            </p>
            <button
              className="review-action"
              type="button"
              onClick={() => {
                void analyzeLatestTutorGame();
              }}
            >
              Analyze latest game
            </button>
          </section>
        </main>
      ) : null}

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
                  void analyzeLatestTutorGame();
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
                isPracticeAvailable={(theme) => theme === "hanging-piece"}
                onPracticePosition={() => {
                  setView("lesson");
                }}
              />
            </div>
          ) : null}
        </main>
      ) : null}

      {view === "lesson" ? (
        <main className="content-shell lesson-shell">
          <button
            className="lesson-back"
            type="button"
            onClick={() => {
              setView("training");
            }}
          >
            Back to training plan
          </button>
          <LessonExperience
            runId={demoLessonRunId}
            startedAt={demoLessonStartedAt}
            playbook={hangingPiecePlaybook}
            facts={canonicalHangingPieceFacts}
            provider={lessonProvider}
          />
        </main>
      ) : null}
    </div>
  );
}
