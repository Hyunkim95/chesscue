import { LoadingMark } from "../../shared/loading/LoadingState";
import { EmptyState } from "../../shared/empty-state/EmptyState";
import {
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { curriculum } from "../../domain/material/installed-curriculum";
import type { CurriculumUnit } from "../../domain/material/curriculum";
import type { CurriculumRecommendation } from "../../domain/curriculum/recommend-unit";
import type { VerifiedTransferExercise } from "../../domain/transfer/types";
import {
  HistoryOwner,
  useEntryState,
  writeEntryValues,
} from "../../shared/navigation/history-entry";
import { ChessBoard } from "../board/ChessBoard";
import { skillSymbol } from "./skill-symbols";
import "./skill-seal.css";
import "./practice-tree.css";

export function PracticeCurriculum({
  recommendation,
  onPractice,
  lessons,
  onOpenSkill,
  savedRetries,
}: {
  readonly savedRetries?: ReadonlyMap<string, () => void> | undefined;
  readonly lessons?: ((unitId: string) => ReactNode) | undefined;
  readonly onOpenSkill?:
    | ((unit: CurriculumUnit, signal: AbortSignal) => Promise<boolean>)
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
  const owner = useContext(HistoryOwner);
  const pending = useRef<AbortController | null>(null);
  const [opening, setOpening] = useState<{
    unitId: string;
    status: "opening" | "unavailable";
  } | null>(null);
  const [returnAnchor, setReturnAnchor] = useEntryState(
    "curriculum.returnAnchor",
    z.object({ unitId: z.string(), top: z.number() }).nullable(),
    null,
  );
  useLayoutEffect(() => {
    if (!returnAnchor) return;
    const frame = requestAnimationFrame(() => {
      const node = document.getElementById(
        detailId + "-" + returnAnchor.unitId,
      );
      if (!node) return;
      window.scrollBy({
        top: node.getBoundingClientRect().top - returnAnchor.top,
        behavior: "instant",
      });
      node.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [detailId, returnAnchor]);
  useLayoutEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );

  const recommendedStage = curriculum.stages.find((stage) =>
    stage.units.some((unit) => unit.id === recommendation?.unitId),
  );
  const stage =
    curriculum.stages.find((item) => item.id === stageChoice) ??
    recommendedStage ??
    curriculum.stages[0];
  if (!stage) return null;
  const selectedId = unitId ?? recommendation?.unitId;

  function renderStage(stage: (typeof curriculum.stages)[number]) {
    const selectedUnit = stage.units.find((unit) => unit.id === selectedId);
    const lessonAction = selectedUnit ? lessons?.(selectedUnit.id) : null;
    const unavailable =
      opening?.status === "unavailable" && opening.unitId === selectedId;
    const expandedUnit = !onOpenSkill || unavailable ? selectedUnit : null;
    const expandedRow = Math.ceil(
      (stage.units.findIndex((unit) => unit.id === expandedUnit?.id) + 1) / 2,
    );

    return (
      <ol className="practice-tree__nodes" aria-label={stage.title + " units"}>
        {stage.units.map((unit, index) => {
          const recommended = unit.id === recommendation?.unitId;
          const selected = unit.id === selectedId;
          const loading =
            opening?.status === "opening" && opening.unitId === unit.id;
          const row = Math.floor(index / 2) + 1;
          const terminal =
            Boolean(onOpenSkill) &&
            index === stage.units.length - 1 &&
            index % 2 === 0;
          const gridColumn = terminal ? "1 / -1" : (index % 2) + 1;
          const gridRow = expandedRow > 0 && row > expandedRow ? row + 1 : row;
          const showPanel = expandedUnit?.id === unit.id;
          return (
            <li key={unit.id} role="listitem">
              <button
                type="button"
                className="practice-tree__node"
                aria-pressed={selected}
                id={detailId + "-" + unit.id}
                aria-controls={showPanel ? detailId : undefined}
                aria-busy={loading}
                style={{
                  gridRow,
                  gridColumn,
                }}
                aria-label={
                  unit.title +
                  (recommended ? ", recommended from your games" : "")
                }
                data-recommended={recommended}
                data-terminal={terminal || undefined}
                onClick={(event) => {
                  if (!onOpenSkill) {
                    setUnitId(unit.id);
                    requestAnimationFrame(() => {
                      detail.current?.scrollIntoView({ block: "nearest" });
                    });
                    return;
                  }
                  pending.current?.abort();
                  const request = new AbortController();
                  pending.current = request;
                  if (owner)
                    writeEntryValues(owner, {
                      "curriculum.unit": unit.id,
                      "curriculum.returnAnchor": {
                        unitId: unit.id,
                        top: event.currentTarget.getBoundingClientRect().top,
                      },
                    });
                  setOpening({ unitId: unit.id, status: "opening" });
                  void onOpenSkill(unit, request.signal)
                    .catch(() => false)
                    .then((opened) => {
                      if (opened || request.signal.aborted) return;
                      setUnitId(unit.id);
                      setOpening({ unitId: unit.id, status: "unavailable" });
                    });
                }}
              >
                <span
                  className="skill-seal practice-tree__seal"
                  aria-hidden="true"
                >
                  {loading ? <LoadingMark /> : skillSymbol(unit.id)}
                  {recommended && <i>★</i>}
                </span>
                <span className="practice-tree__name">
                  {loading ? "Opening puzzle…" : unit.title}
                </span>
              </button>
              {selected && lessonAction && (
                <details
                  className="practice-tree__more"
                  style={{ gridRow, gridColumn }}
                >
                  <summary aria-label="More for this skill">⋯</summary>
                  {lessonAction}
                </details>
              )}
              {showPanel && (
                <div
                  className="practice-tree__challenge"
                  ref={detail}
                  id={detailId}
                  style={{ gridRow: row + 1 }}
                  aria-label={unit.title + " exercises"}
                  role="group"
                >
                  {!onOpenSkill && <p>{unit.goal}</p>}
                  {!onOpenSkill && recommendation?.unitId === unit.id && (
                    <p className="practice-tree__evidence">
                      <span aria-hidden="true">★ </span>From your{" "}
                      {recommendation.games === 1
                        ? "game"
                        : String(recommendation.games) + " games"}{" "}
                      · {recommendation.example.drill.moveLabel} ·{" "}
                      {recommendation.example.drill.played}
                    </p>
                  )}
                  <div className="practice-tree__actions">
                    {savedRetries?.has(unit.id) && (
                      <button
                        type="button"
                        className="review-action"
                        onClick={savedRetries.get(unit.id)}
                      >
                        Retry move from review
                      </button>
                    )}
                    {unavailable && (
                      <EmptyState
                        art="practice"
                        title="Skill puzzles complete"
                        description="Choose another skill to keep practicing."
                      />
                    )}
                    {!onOpenSkill && (
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
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section
      className={
        onOpenSkill
          ? "practice-tree practice-tree--continuous"
          : "practice-tree"
      }
      aria-label="Curriculum skill tree"
    >
      <span className="practice-tree__announcement" role="status">
        {opening?.status === "opening" && "Opening puzzle…"}
      </span>
      {onOpenSkill ? (
        <>
          {recommendation &&
            recommendedStage &&
            recommendedStage !== curriculum.stages[0] && (
              <button
                type="button"
                className="practice-tree__return"
                onClick={() => {
                  const node = document.getElementById(
                    detailId + "-" + recommendation.unitId,
                  );
                  node?.scrollIntoView({ block: "center" });
                  node?.focus({ preventScroll: true });
                }}
              >
                ★ Go to recommended skill
              </button>
            )}
          {curriculum.stages.map((item) => (
            <section
              key={item.id}
              className="practice-tree__stage"
              aria-labelledby={detailId + "-stage-" + item.id}
            >
              <h2 id={detailId + "-stage-" + item.id}>{item.title}</h2>
              {renderStage(item)}
            </section>
          ))}
        </>
      ) : (
        <>
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
                  pending.current?.abort();
                  setOpening(null);
                  setReturnAnchor(null);
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
          {renderStage(stage)}
        </>
      )}
      {!onOpenSkill &&
        recommendedStage &&
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
