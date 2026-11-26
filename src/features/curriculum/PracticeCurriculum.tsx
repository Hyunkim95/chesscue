import { useRef } from "react";
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
}: {
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
  const recommendedStage = curriculum.stages.find((stage) =>
    stage.units.some((unit) => unit.id === recommendation?.unitId),
  );
  const stage =
    curriculum.stages.find((item) => item.id === stageChoice) ??
    recommendedStage ??
    curriculum.stages[0];
  if (!stage) return null;
  const unit = stage.units.find(
    (item) => item.id === (unitId ?? recommendation?.unitId),
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
        {stage.units.map((item) => {
          const recommended = item.id === recommendation?.unitId;
          return (
            <li key={item.id}>
              <button
                type="button"
                className="practice-tree__node"
                aria-pressed={item.id === unit?.id}
                aria-label={
                  item.title +
                  (recommended ? ", recommended from your games" : "")
                }
                data-recommended={recommended}
                onClick={() => {
                  setUnitId(item.id);
                  requestAnimationFrame(() => {
                    detail.current?.scrollIntoView({ block: "nearest" });
                  });
                }}
              >
                <span className="practice-tree__seal" aria-hidden="true">
                  {symbols[item.id] ?? "◇"}
                  {recommended && <i>★</i>}
                </span>
                <span className="practice-tree__name">{item.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {unit && (
        <div
          className="practice-tree__challenge"
          ref={detail}
          key={unit.id}
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
              · {recommendation.example.drill.moveLabel} ·{" "}
              {recommendation.example.drill.played}
            </p>
          )}
          <div className="practice-tree__positions">
            {unit.exercises.map((exercise, index) => (
              <div className="practice-tree__position" key={exercise.id}>
                <div aria-hidden="true">
                  <ChessBoard
                    fen={exercise.fen}
                    orientation={
                      exercise.fen.split(" ")[1] === "b" ? "black" : "white"
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
        </div>
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
