import type { StarState } from "../../domain/progress";

export function StarMark({ state }: { readonly state: StarState }) {
  return (
    <g className={`sky-mark sky-mark--${state}`} aria-hidden="true">
      {state === "shining" ? (
        <path d="M0-8 2-2 8 0 2 2 0 8-2 2-8 0-2-2Z" />
      ) : state === "spotted" ? (
        <path d="M0-5.5 5.5 0 0 5.5-5.5 0Z" />
      ) : (
        <circle r={state === "missed" ? 4.5 : 2.8} />
      )}
    </g>
  );
}
