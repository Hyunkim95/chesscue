import { EmptyState } from "../../shared/empty-state/EmptyState";
import { useId, useRef, type ReactNode } from "react";
import { z } from "zod";
import material from "../../../scripts/material/curriculum.generated.json?raw";
import type { CurriculumRecommendation } from "../../domain/curriculum/recommend-unit";
import { installedCurriculumSchema } from "../../domain/material/curriculum";
import type { VerifiedTransferExercise } from "../../domain/transfer/types";
import { useEntryState } from "../../shared/navigation/history-entry";
import { ChessBoard } from "../board/ChessBoard";
import "./practice-tree.css";

const curriculum = installedCurriculumSchema.parse(JSON.parse(material));

// The symbols label training themes. Selection and recommendations have their own cues.
const symbols: Readonly<Record<string, string>> = {
  "read-the-board": "◉",
  "get-out-of-check": "♚",
  "count-captures": "⇄",
  "see-the-threat": "♞",
  "simple-mates": "♛",
  "develop-with-purpose": "♘",
  "mating-patterns": "♛",
  "double-attack": "♞",
  "line-tactics": "♝",
  "open-attack-line": "♜",
  "passed-pawn-race": "♟",
  "calculate-replies": "⇄",
  "change-the-defender": "♝",
  "test-a-sacrifice": "♞",
  "pawn-ending": "♟",
  "choose-trades": "⇄",
  "activate-a-piece": "♘",
  "pawn-breaks": "♟",
  "king-attack-plan": "♚",
  "rook-ending": "♜",
  "opening-structure": "♙",
};

export function PracticeCurriculum({
  recommendation,
  onPractice,
  lessons,
  recommendedPuzzle,
}: {
  readonly lessons?: ((unitId: string) => ReactNode) | undefined;
  readonly recommendedPuzzle?:
    | ((
        unitId: string,
        exercises: readonly VerifiedTransferExercise[],
      ) => ReactNode)
    | undefined;
  readonly recommendation: CurriculumRecommendation | null;
  readonly onPractice: (exercise: VerifiedTransferExercise) => void;
}) {
  const [stageChoice, setStageChoice] = useEntryState(
    "curriculum.stage",
    z.string().nullable(),
    null,
  );
  const [unitId, setUnitId] = useEntryState(
    "curriculum.unit",
    z.string().nullable(),
    null,
  );
  const detail = useRef<HTMLDivElement>(null);
  const detailId = useId();
  const recommendedStage = curriculum.stages.find((stage) =>
    stage.units.some((unit) => unit.id === recommendation?.unitId),
  );
  const stage =
    curriculum.stages.find((item) => item.id === stageChoice) ??
    recommendedStage ??
    curriculum.stages[0];
  if (!stage) return null;
  const selectedId = unitId ?? recommendation?.unitId;
  const selectedRow = Math.ceil(
    (stage.units.findIndex(({ id }) => id === selectedId) + 1) / 2,
  );
  return (
    <section className="practice-tree" aria-label="Curriculum skill tree">
      <div
        className="practice-tree__root"
        role="group"
        aria-label="Curriculum stages"
      >
        <label>
          <select
            aria-label="Curriculum stage"
            value={stage.id}
            onChange={(event) => {
              setStageChoice(event.currentTarget.value);
              setUnitId(null);
            }}
          >
            {curriculum.stages.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <span aria-hidden="true">⌄</span>
        </label>
      </div>
      <ol className="practice-tree__nodes" aria-label={stage.title + " units"}>
        {stage.units.map((unit, index) => {
          const recommended = unit.id === recommendation?.unitId;
          const selected = unit.id === selectedId;
          const row = Math.floor(index / 2) + 1;
          const column = (index % 2) + 1;
          return (
            <li key={unit.id} role="listitem">
              <button
                type="button"
                className="practice-tree__node"
                aria-pressed={selected}
                aria-controls={selected ? detailId : undefined}
                style={{
                  gridRow: selectedRow > 0 && row > selectedRow ? row + 1 : row,
                  gridColumn: column,
                }}
                aria-label={
                  unit.title +
                  (recommended ? ", recommended from your games" : "")
                }
                data-recommended={recommended}
                onClick={() => {
                  setUnitId(unit.id);
                  requestAnimationFrame(() => {
                    detail.current?.scrollIntoView({ block: "nearest" });
                  });
                }}
              >
                <span className="practice-tree__seal" aria-hidden="true">
                  {symbols[unit.id] ?? "◇"}
                  {recommended && <i>★</i>}
                </span>
                <span className="practice-tree__name">{unit.title}</span>
              </button>
              {selected && (
                <div
                  className="practice-tree__challenge"
                  ref={detail}
                  id={detailId}
                  style={{ gridRow: row + 1 }}
                  aria-label={unit.title + " exercises"}
                  role="group"
                >
                  <p>{unit.goal}</p>
                  {recommendation?.unitId === unit.id && (
                    <p className="practice-tree__evidence">
                      <span aria-hidden="true">★ </span>From your{" "}
                      {recommendation.games === 1
                        ? "game"
                        : String(recommendation.games) + " games"}{" "}
                      {!recommendedPuzzle && (
                        <>
                          {" "}
                          · {recommendation.example.drill.moveLabel} ·{" "}
                          {recommendation.example.drill.played}
                        </>
                      )}
                    </p>
                  )}
                  {recommendedPuzzle ? (
                    recommendedPuzzle(unit.id, unit.exercises)
                  ) : (
                    <div className="practice-tree__positions">
                      {unit.exercises.map((exercise, index) => (
                        <div
                          className="practice-tree__position"
                          key={exercise.id}
                        >
                          <div aria-hidden="true">
                            <ChessBoard
                              fen={exercise.fen}
                              orientation={
                                exercise.fen.split(" ")[1] === "b"
                                  ? "black"
                                  : "white"
                              }
                              label={unit.title}
                            />
                          </div>
                          <button
                            type="button"
                            aria-label={"Exercise " + String(index + 1)}
                            title={"Play exercise " + String(index + 1)}
                            onClick={() => {
                              onPractice(exercise);
                            }}
                          >
                            <span aria-hidden="true">▶</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {lessons?.(unit.id)}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {recommendedPuzzle && selectedRow === 0 && (
        <EmptyState
          art="practice"
          title="Choose a skill"
          description="Select a skill above to get a puzzle."
        />
      )}
      {recommendedStage &&
        recommendedStage.id !== stage.id &&
        recommendation && (
          <button
            type="button"
            className="practice-tree__return"
            onClick={() => {
              setStageChoice(recommendedStage.id);
              setUnitId(recommendation.unitId);
            }}
          >
            ★ Recommended skill
          </button>
        )}
    </section>
  );
}
