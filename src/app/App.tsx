import { useMemo, useState } from "react";

import { importGames } from "../application/import-games/import-games";
import { buildPlayerProfile } from "../domain/curriculum";
import { createGameId, createPositionId } from "../domain/game/types";
import { CurriculumCard } from "../features/curriculum/CurriculumCard";
import {
  ImportGamesPanel,
  type ImportGamesRequest,
} from "../features/import-games/ImportGamesPanel";
import { PlayGameScreen } from "../features/play/PlayGameScreen";
import { ProfileOverview } from "../features/profile/ProfileOverview";
import { StockfishGameEngine } from "../infrastructure/engine/stockfish-game-engine";
import { IndexedDbGameRepository } from "../infrastructure/persistence/indexeddb-game-repository";

type AppView = "play" | "import" | "training";

const repository = new IndexedDbGameRepository();
const engine = new StockfishGameEngine();

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

export function App() {
  const [view, setView] = useState<AppView>("play");
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
            ♞
          </span>
          <span>
            <strong>Chess Tutor</strong>
            <small>Adaptive training</small>
          </span>
        </button>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? "page" : undefined}
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
          </section>
        </main>
      ) : null}
    </div>
  );
}
