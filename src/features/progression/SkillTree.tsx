import { starterPack } from "../../domain/material/pack";
import { useState, type ReactNode } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { ChessBoard } from "../board/ChessBoard";
import type {
  PlayerProfile,
  CurriculumTheme,
} from "../../domain/curriculum/types";
import type { LearningTheme } from "../../domain/analysis/types";
import type { VerifiedGameDrill } from "../../domain/curriculum/game-drill";
import type { PracticeExercise } from "../../domain/transfer/types";
import type { SnapshotState } from "../../app/use-playing-snapshot";
import type { MovePattern } from "../../domain/curriculum/playing-snapshot";
import { TrainingAnalysisStatus, SkillMoveEvidence } from "./PlayingSnapshot";
import "./progression.css";

const nodes = [
  {
    id: "vision",
    name: "Board vision",
    glyph: "✦",
    x: 50,
    y: 10,
    parent: null,
    description: starterPack.skills.vision.question,
  },
  {
    id: "threats",
    name: "Threats",
    glyph: "♜",
    x: 17,
    y: 39,
    parent: "vision",
    description: starterPack.skills.threats.question,
  },
  {
    id: "safety",
    name: "Piece safety",
    glyph: "♞",
    x: 50,
    y: 39,
    parent: "vision",
    description: starterPack.skills.safety.question,
  },
  {
    id: "endgames",
    name: "Endgames",
    glyph: "♚",
    x: 83,
    y: 39,
    parent: "vision",
    description: starterPack.skills.endgames.question,
  },
  {
    id: "backrank",
    name: "Back-rank mates",
    glyph: "♜",
    x: 17,
    y: 72,
    parent: "threats",
    description: starterPack.skills.backrank.question,
  },
  {
    id: "forks",
    name: "Knight forks",
    glyph: "♞",
    x: 50,
    y: 72,
    parent: "threats",
    description: starterPack.skills.forks.question,
  },
  {
    id: "rook",
    name: "Rook endings",
    glyph: "♔",
    x: 83,
    y: 72,
    parent: "endgames",
    description: starterPack.skills.rook.question,
  },
] as const;
export type Skill = (typeof nodes)[number]["id"];
const themes: Partial<Record<Skill, CurriculumTheme>> = {
  threats: "one-move-threat",
  safety: "hanging-piece",
  endgames: "endgame-technique",
};
const focusSkills: Record<CurriculumTheme, Skill> = {
  "hanging-piece": "safety",
  "one-move-threat": "threats",
  "central-pawn-tension": "vision",
  "king-safety": "safety",
  development: "vision",
  calculation: "vision",
  "endgame-technique": "endgames",
  other: "vision",
};
function themeBranch(theme: LearningTheme): Skill {
  return focusSkills[
    theme === "premature-central-exchange" ? "central-pawn-tension" : theme
  ];
}

export interface BackRankEvidence {
  found: number;
  total: number;
  missedFen: string | null;
}
function RetryMate({
  fen,
  onPractice,
}: {
  fen: string;
  onPractice: () => void;
}) {
  const [selected, setSelected] = useState<Square | null>(null),
    [last, setLast] = useState<string | null>(null),
    [reply, setReply] = useState("");
  const [promotion, setPromotion] = useState<Square | null>(null);
  const chess = new Chess(last ?? fen),
    orientation = new Chess(fen).turn() === "w" ? "white" : "black";
  const legal = selected
    ? chess.moves({ square: selected, verbose: true })
    : [];
  function choose(s: Square) {
    const options = legal.filter((m) => m.to === s);
    setPromotion(null);
    if (options.some((move) => move.promotion)) {
      setPromotion(s);
      return;
    }
    const move = options[0];
    if (move) {
      attempt(move);
      return;
    }
    setSelected(chess.get(s)?.color === chess.turn() ? s : null);
  }
  function attempt(move: Move) {
    setPromotion(null);
    chess.move(move.san);
    setSelected(null);
    if (chess.isCheckmate()) {
      setLast(chess.fen());
      setReply("Checkmate. You found the finish.");
    } else setReply("The king still has a reply. Try another move.");
  }
  return (
    <div className="skill-retry">
      <ChessBoard
        label="Replay the missed mate"
        fen={last ?? fen}
        orientation={orientation}
        onSquareSelect={choose}
        selectedSquare={selected}
        legalTargets={legal.map((move) => move.to)}
        disabled={last !== null}
      />
      {promotion && (
        <div className="progress-actions">
          {legal
            .filter((m) => m.to === promotion)
            .map((m) => (
              <button
                key={m.san}
                className="review-action"
                onClick={() => {
                  attempt(m);
                }}
              >
                {m.san}
              </button>
            ))}
        </div>
      )}
      <p role="status">{reply || "Your move. Find mate in one."}</p>
      <button className="review-action" onClick={onPractice}>
        Practice mate in one
      </button>
    </div>
  );
}
export function SkillTree({
  profile,
  evidence,
  onPractice,
  duePractice,
  onDuePractice,
  selected,
  onSelect,
  lessons,
  focusGame,
  verifiedDrill,
  onStartDrill,
  snapshot,
  onPlay,
  onImport,
  gameTraining,
}: {
  profile: PlayerProfile;
  evidence: BackRankEvidence;
  onPractice: (theme: LearningTheme) => void;
  duePractice: readonly {
    readonly id: string;
    readonly exercise: PracticeExercise;
  }[];
  onDuePractice: (id: string) => void;
  selected: Skill | null;
  onSelect: (skill: Skill) => void;
  lessons: (skill: Skill) => ReactNode;
  focusGame: ReactNode;
  verifiedDrill: VerifiedGameDrill | null;
  onStartDrill: (drill: VerifiedGameDrill) => void;
  snapshot: SnapshotState;
  onPlay: () => void;
  onImport: () => void;
  gameTraining: ReactNode;
}) {
  const gameBranch = focusSkills[profile.nextGame.focus];
  const drillTheme = verifiedDrill?.exercise.theme;
  const drillBranch = drillTheme === undefined ? null : themeBranch(drillTheme);
  const scheduled = duePractice.map((item) => ({
    ...item,
    branch: themeBranch(item.exercise.theme),
  }));
  const focus: Skill = verifiedDrill?.backRank
    ? "backrank"
    : (drillBranch ??
      (evidence.missedFen ? "backrank" : (scheduled[0]?.branch ?? gameBranch)));
  const [replay, setReplay] = useState(false);
  const skill = nodes.find((n) => n.id === (selected ?? focus)) ?? nodes[0];
  const scheduledHere = scheduled.filter(({ branch }) => branch === skill.id);
  const nextPractice = scheduled.find(({ branch }) => branch === focus);
  const path = new Set<Skill>();
  let branch: Skill | null =
    verifiedDrill || nextPractice || evidence.missedFen ? focus : null;
  while (branch) {
    path.add(branch);
    const here: (typeof nodes)[number] | undefined = nodes.find(
      (n) => n.id === branch,
    );
    branch = here?.parent ?? null;
  }
  const practice = snapshot.status === "ready" ? snapshot.plan.practice : [];
  const strengths = snapshot.status === "ready" ? snapshot.plan.strengths : [];
  function branchOf(pattern: MovePattern) {
    return pattern.key === "back-rank" ? "backrank" : themeBranch(pattern.key);
  }
  const branchPractice = practice.filter((p) => branchOf(p) === skill.id);
  const branchStrengths = strengths.filter((p) => branchOf(p) === skill.id);
  const pattern = branchPractice[0],
    strength = branchStrengths[0];
  const description = pattern
    ? pattern.games > 1
      ? `In ${String(pattern.games)} of your games, Stockfish found a stronger move involving ${pattern.name}. Replay the decisions below.`
      : `One game has a position to revisit for ${pattern.name}. More games will show whether it repeats.`
    : strength
      ? `You handled ${strength.name} well in ${String(strength.games)} ${strength.games === 1 ? "game" : "games"}. You can replay the moves below.`
      : skill.description;
  function status(id: Skill) {
    if (id === focus && verifiedDrill) return "From your game";
    if (scheduled.some(({ branch }) => branch === id)) return "Practice ready";
    if (id === focus && evidence.missedFen) return "Next to train";
    if (id === "backrank" && evidence.total)
      return evidence.missedFen ? "Miss to replay" : "Found unaided";
    if (practice.some((pattern) => branchOf(pattern) === id))
      return "Moves to revisit";
    if (strengths.some((pattern) => branchOf(pattern) === id))
      return "Checked strengths";
    const theme = themes[id];
    if (theme && profile.mastery[theme].evidenceCount)
      return profile.mastery[theme].status === "established"
        ? "Established"
        : "In progress";
    return "Explore";
  }
  return (
    <main className="skill-world">
      <section className="progress-wrap">
        <TrainingAnalysisStatus
          state={snapshot}
          onPlay={onPlay}
          onImport={onImport}
        />
        <div className="skill-map" role="group" aria-label="Chess skills">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {nodes.map((n) => {
              const parent = nodes.find((p) => p.id === n.parent);
              return parent ? (
                <line
                  key={n.id}
                  x1={parent.x}
                  y1={parent.y}
                  x2={n.x}
                  y2={n.y}
                  className={path.has(n.id) ? "lit" : undefined}
                />
              ) : null;
            })}
          </svg>
          {nodes.map((n) => (
            <div
              className="skill-node"
              key={n.id}
              style={{ left: String(n.x) + "%", top: String(n.y) + "%" }}
              data-recommended={path.has(n.id) && n.id === focus}
            >
              <button
                className="skill-node__select"
                type="button"
                aria-label={n.name + " · " + status(n.id)}
                aria-pressed={skill.id === n.id}
                data-lit={path.has(n.id)}
                onClick={() => {
                  onSelect(n.id);
                  setReplay(false);
                }}
              >
                <span aria-hidden="true">{n.glyph}</span>
                <strong>{n.name}</strong>
                {status(n.id) !== "Explore" && <small>{status(n.id)}</small>}
              </button>
              {n.id === focus && (verifiedDrill ?? nextPractice) && (
                <button
                  className="skill-node__launch"
                  type="button"
                  onClick={() => {
                    if (verifiedDrill) onStartDrill(verifiedDrill);
                    else if (nextPractice) onDuePractice(nextPractice.id);
                  }}
                >
                  Start drill
                </button>
              )}
            </div>
          ))}
        </div>
        {(selected !== null || path.size > 0) && (
          <section className="skill-detail" aria-live="polite">
            <h2>{skill.name}</h2>
            <p>{description}</p>
            {snapshot.status === "ready" && (
              <SkillMoveEvidence
                key={skill.id}
                practice={branchPractice}
                strengths={branchStrengths}
                games={snapshot.games}
                onReplay={onStartDrill}
              />
            )}
            {!replay &&
              scheduledHere.map(({ id, exercise, branch }) => (
                <button
                  className="review-action"
                  key={id}
                  type="button"
                  onClick={() => {
                    onDuePractice(id);
                  }}
                >
                  Practice{" "}
                  {branch === "backrank"
                    ? "back-rank mates"
                    : exercise.theme.replaceAll("-", " ")}
                </button>
              ))}
            {skill.id === "backrank" && (
              <>
                <p>
                  {evidence.total
                    ? `Found ${String(evidence.found)} of ${String(evidence.total)} back-rank mates in recent rated opportunities.`
                    : "No Gemini-classified back-rank mates in recent rated games."}
                </p>
                {replay && evidence.missedFen ? (
                  <RetryMate
                    fen={evidence.missedFen}
                    onPractice={() => {
                      onPractice("one-move-threat");
                    }}
                  />
                ) : (
                  <div className="progress-actions">
                    {evidence.missedFen && (
                      <button
                        className="primary-link"
                        onClick={() => {
                          setReplay(true);
                        }}
                      >
                        Replay the missed mate
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {(skill.id === "threats" || skill.id === "safety") &&
              scheduledHere.length === 0 && (
                <button
                  className="review-action"
                  onClick={() => {
                    onPractice(
                      skill.id === "safety"
                        ? "hanging-piece"
                        : "one-move-threat",
                    );
                  }}
                >
                  Practice this skill
                </button>
              )}
            {lessons(skill.id)}
            {skill.id === focus && gameTraining && (
              <details className="skill-extra">
                <summary>Training path from your game</summary>
                {gameTraining}
              </details>
            )}
            {focusGame &&
              (skill.id === gameBranch ? (
                <div className="skill-focus-game">{focusGame}</div>
              ) : (
                <details className="skill-focus-game">
                  <summary>Next coached game</summary>
                  {focusGame}
                </details>
              ))}
          </section>
        )}
        {selected === null && path.size === 0 && gameTraining}
      </section>
    </main>
  );
}
