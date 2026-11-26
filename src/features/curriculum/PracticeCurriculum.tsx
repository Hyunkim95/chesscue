import { useRef } from "react";
import { z } from "zod";
import material from "../../../scripts/material/curriculum.generated.json?raw";
import type { CurriculumRecommendation } from "../../domain/curriculum/recommend-unit";
import { installedCurriculumSchema } from "../../domain/material/curriculum";
import type { VerifiedTransferExercise } from "../../domain/transfer/types";
import { useEntryState } from "../../shared/navigation/history-entry";

const curriculum = installedCurriculumSchema.parse(JSON.parse(material));

export function PracticeCurriculum({
  recommendation,
  onPractice,
}: {
  readonly recommendation: CurriculumRecommendation | null;
  readonly onPractice: (exercise: VerifiedTransferExercise) => void;
}) {
  const recommendedRow = useRef<HTMLElement | null>(null);
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
  const suggestedStage = curriculum.stages.find(({ units }) =>
    units.some(({ id }) => id === recommendation?.unitId),
  );
  const suggestedUnit = suggestedStage?.units.find(
    ({ id }) => id === recommendation?.unitId,
  );
  const openStage =
    stageChoice ?? suggestedStage?.id ?? curriculum.stages[0]?.id;

  return (
    <section
      className="shared-puzzle-library practice-curriculum"
      aria-labelledby="curriculum-title"
    >
      <h2 id="curriculum-title">Curriculum skill tree</h2>
      {recommendation && suggestedStage && suggestedUnit && (
        <section
          aria-label="Recommended from your games"
          className="practice-curriculum__recommendation"
        >
          <h3>Recommended from your games</h3>
          <p>
            <strong>{suggestedUnit.title}</strong>
          </p>
          <p>
            {recommendation.games === 1
              ? "One game to revisit"
              : `Moves to revisit in ${String(recommendation.games)} games`}
            {" · "}
            {recommendation.example.drill.moveLabel} ·{" "}
            {recommendation.example.drill.played}
          </p>
          <button
            type="button"
            onClick={() => {
              setStageChoice(suggestedStage.id);
              setUnitId(suggestedUnit.id);
              requestAnimationFrame(() => {
                recommendedRow.current?.focus();
              });
            }}
          >
            Open recommended unit
          </button>
        </section>
      )}
      <div
        role="group"
        aria-label="Curriculum stages"
        className="practice-curriculum__branches"
      >
        {curriculum.stages.map((stage) => (
          <details key={stage.id} open={stage.id === openStage}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                setStageChoice(openStage === stage.id ? "" : stage.id);
                setUnitId(null);
              }}
            >
              {stage.title}
            </summary>
            <ol
              className="practice-curriculum__units"
              aria-label={stage.title + " units"}
            >
              {stage.units.map((unit) => (
                <li
                  key={unit.id}
                  data-recommended={unit.id === suggestedUnit?.id}
                >
                  <details open={stage.id === openStage && unit.id === unitId}>
                    <summary
                      ref={
                        unit.id === suggestedUnit?.id
                          ? recommendedRow
                          : undefined
                      }
                      onClick={(event) => {
                        event.preventDefault();
                        setUnitId(unit.id === unitId ? null : unit.id);
                      }}
                    >
                      <span>{unit.title}</span>
                      {unit.id === suggestedUnit?.id && (
                        <span className="practice-curriculum__label">
                          Recommended
                        </span>
                      )}
                    </summary>
                    <p>{unit.goal}</p>
                    <div
                      className="shared-puzzle-library__choices practice-exercises"
                      role="group"
                      aria-label="Exercises"
                    >
                      {unit.exercises.map((exercise, index) => (
                        <button
                          key={exercise.id}
                          type="button"
                          onClick={() => {
                            onPractice(exercise);
                          }}
                        >
                          Exercise {String(index + 1)}
                        </button>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}
