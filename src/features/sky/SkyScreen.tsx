import { useLayoutEffect, useRef, useState } from "react";
import "@fontsource/newsreader/latin-600-italic.css";

import type {
  MomentAttemptRecord,
  StarState,
  unitHistory,
} from "../../domain/progress";
import { Button } from "../../shared/ui/primitives";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import { constellationFor } from "./constellations";
import { StarMark } from "./StarMark";
import { isLit, starLabels } from "./star-state";
import { StarSheet } from "./StarSheet";
import "./sky.css";

interface SkyUnit {
  readonly unitId: string;
  readonly title: string;
}

export interface SkyScreenProps {
  readonly stages: readonly {
    readonly stageId: string;
    readonly title: string;
    readonly units: readonly SkyUnit[];
  }[];
  readonly stars: ReadonlyMap<string, StarState>;
  readonly newestStar: string | undefined;
  readonly history: (unitId: string) => ReturnType<typeof unitHistory>;
  readonly onLook: (source: MomentAttemptRecord["source"]) => void;
}

const chartWidth = 288;
const legend = ["not-seen", "missed", "spotted", "shining"] as const;

function backgroundStars() {
  let seed = 7;
  function next() {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  }

  return Array.from({ length: 220 }, () => ({
    x: next() * chartWidth,
    heightFraction: next(),
    radius: 0.35 + next() * 0.9,
    opacity: 0.15 + next() * 0.35,
  }));
}

const dust = backgroundStars();

function layOutSky(stages: SkyScreenProps["stages"]) {
  let chartHeight = 0;
  const constellations = stages.map((stage, index) => {
    const layout = constellationFor(stage.stageId, index, stage.units.length);
    const top = chartHeight;
    chartHeight += layout.height;
    return { ...stage, layout, top };
  });
  return { constellations, chartHeight: Math.max(chartHeight, 440) };
}

export function SkyScreen({
  stages,
  stars,
  newestStar,
  history,
  onLook,
}: SkyScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const { constellations, chartHeight } = layOutSky(stages);

  const units = stages.flatMap(({ units }) => units);
  const selected = units.find(({ unitId }) => unitId === selectedId);
  const litCount = units.filter(({ unitId }) =>
    isLit(stars.get(unitId)),
  ).length;
  const shiningCount = units.filter(
    ({ unitId }) => stars.get(unitId) === "shining",
  ).length;
  const empty = units.every(
    ({ unitId }) => (stars.get(unitId) ?? "not-seen") === "not-seen",
  );

  useLayoutEffect(() => {
    const chart = chartRef.current;
    const button = chart?.querySelector(".sky-star--newest button");
    if (!chart || !button) return;

    const bounds = chart.getBoundingClientRect();
    const star = button.getBoundingClientRect();
    chart.scrollTop +=
      star.top + star.height / 2 - bounds.top - bounds.height / 2;
  }, [newestStar, chartHeight]);

  useLayoutEffect(() => {
    if (selected) return;
    openerRef.current?.focus({ preventScroll: true });
    openerRef.current = null;
  }, [selected]);

  return (
    <section className="sky-screen" aria-label="Your sky">
      <header className="sky-header">
        <h1>Your sky</h1>
        <p>
          <strong>{litCount}</strong> of {units.length} ideas spotted ·{" "}
          <strong>{shiningCount}</strong> shining
        </p>
        <ul className="sky-legend" aria-label="Star states">
          {legend.map((state) => (
            <li key={state}>
              <svg viewBox="-10 -10 20 20" aria-hidden="true">
                <StarMark state={state} />
              </svg>
              {starLabels[state]}
            </li>
          ))}
        </ul>
      </header>

      <div className="sky-region">
        <div
          className="sky-chart"
          ref={chartRef}
          inert={selected !== undefined}
        >
          {empty && (
            <div className="sky-empty">
              <RookCharacter mood="idle" />
              <p>Spot your first idea and the first star appears here.</p>
            </div>
          )}
          <svg
            className="sky-svg"
            viewBox={`0 0 ${String(chartWidth)} ${String(chartHeight)}`}
            role="group"
            aria-label="Curriculum star chart"
          >
            {dust.map(({ x, heightFraction, radius, opacity }, index) => (
              <circle
                key={index}
                className="sky-dust"
                cx={x}
                cy={heightFraction * chartHeight}
                r={radius}
                opacity={opacity}
                aria-hidden="true"
              />
            ))}
            {constellations.map(({ stageId, title, units, layout, top }) => {
              const count = units.filter(({ unitId }) =>
                isLit(stars.get(unitId)),
              ).length;

              return (
                <g key={stageId} transform={`translate(0 ${String(top)})`}>
                  <text
                    className="sky-stage-title"
                    x={layout.label === "start" ? 12 : 276}
                    y={21}
                    textAnchor={layout.label}
                  >
                    {title} · {count}/{units.length}
                  </text>
                  {layout.edges.map(([start, end]) => {
                    const a = layout.points[start];
                    const b = layout.points[end];
                    const unitA = units[start];
                    const unitB = units[end];
                    if (!a || !b || !unitA || !unitB) return null;
                    const lit =
                      isLit(stars.get(unitA.unitId)) &&
                      isLit(stars.get(unitB.unitId));
                    return (
                      <line
                        key={`${String(start)}-${String(end)}`}
                        className={lit ? "sky-edge sky-edge--lit" : "sky-edge"}
                        x1={a[0]}
                        y1={a[1]}
                        x2={b[0]}
                        y2={b[1]}
                        aria-hidden="true"
                      />
                    );
                  })}
                  {units.map(({ unitId, title: unitTitle }, index) => {
                    const point = layout.points[index];
                    if (!point) return null;
                    const [x, y] = point;
                    const state = stars.get(unitId) ?? "not-seen";
                    const newest = newestStar === unitId;

                    return (
                      <g
                        className={
                          newest ? "sky-star sky-star--newest" : "sky-star"
                        }
                        key={unitId}
                        transform={`translate(${String(x)} ${String(y)})`}
                      >
                        <StarMark state={state} />
                        <foreignObject x={-42} y={-22} width={84} height={66}>
                          <Button
                            className={`sky-star__button sky-star__button--${state}`}
                            variant="ghost"
                            aria-label={`${unitTitle}, ${starLabels[state].toLowerCase()}`}
                            aria-haspopup="dialog"
                            onClick={(event) => {
                              openerRef.current = event.currentTarget;
                              setSelectedId(unitId);
                            }}
                          >
                            <span>{unitTitle}</span>
                          </Button>
                        </foreignObject>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        {selected && (
          <StarSheet
            title={selected.title}
            state={stars.get(selected.unitId) ?? "not-seen"}
            moments={history(selected.unitId)}
            onClose={() => {
              setSelectedId(null);
            }}
            onLook={(source) => {
              setSelectedId(null);
              onLook(source);
            }}
          />
        )}
      </div>
    </section>
  );
}
