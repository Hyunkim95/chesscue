import type {
  MomentAttemptRecord,
  StarState,
  unitHistory,
} from "../../domain/progress";
import { Button, Sheet } from "../../shared/ui/primitives";
import { StarMark } from "./StarMark";
import { starLabels } from "./star-state";

const momentLabels = {
  missed: { mark: "✗", text: "Missed" },
  spotted: { mark: "✓", text: "Spotted" },
  played: { mark: "★", text: "Played it" },
} as const;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const nextSteps = {
  "not-seen": "Spot this idea in one of your moments to light this star.",
  missed: "Try this idea again in a moment to light this star.",
  spotted: "Play this idea in a real game to make this star shine.",
  shining: "Look for another chance to play this idea in a real game.",
} satisfies Record<StarState, string>;

export function StarSheet({
  title,
  state,
  moments,
  onClose,
  onLook,
}: {
  readonly title: string;
  readonly state: StarState;
  readonly moments: ReturnType<typeof unitHistory>;
  readonly onClose: () => void;
  readonly onLook: (source: MomentAttemptRecord["source"]) => void;
}) {
  return (
    <div className="sky-sheet">
      <Sheet open title={title} onClose={onClose} className="sky-star-sheet">
        <p className={`sky-sheet__status sky-sheet__status--${state}`}>
          <svg viewBox="-10 -10 20 20" aria-hidden="true">
            <StarMark state={state} />
          </svg>
          {starLabels[state]}
        </p>
        {moments.length === 0 ? (
          <p className="sky-sheet__empty">No moments for this idea yet.</p>
        ) : (
          <ol className="sky-sheet__history" aria-label="Moments, newest first">
            {moments.map(({ kind, at, source }, index) => {
              const { mark, text } = momentLabels[kind];
              const date = dateFormat.format(new Date(at));

              return (
                <li key={index}>
                  <div
                    className={`sky-sheet__moment sky-sheet__moment--${kind}`}
                  >
                    <span aria-hidden="true">{mark}</span>
                    <div>
                      <strong>{text}</strong>
                      <small>
                        <time dateTime={at}>{date}</time>
                        {" · "}
                        {source.kind === "game" ? "Game" : "Practice"}
                      </small>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    className="sky-sheet__look"
                    aria-label={`Look at moment ${String(index + 1)}, ${text.toLowerCase()}, ${date}`}
                    onClick={() => {
                      onLook(source);
                    }}
                  >
                    Look <span aria-hidden="true">›</span>
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        <p className="sky-sheet__next">{nextSteps[state]}</p>
        <Button wide onClick={onClose}>
          Close
        </Button>
      </Sheet>
    </div>
  );
}
