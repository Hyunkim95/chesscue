import type {
  MomentAttemptRecord,
  StarState,
  unitHistory,
} from "../../domain/progress";
import { useId, useState } from "react";
import { Button, Sheet } from "../../shared/ui/primitives";
import { StarMark } from "./StarMark";
import { starLabels } from "./star-state";

const momentLabels = {
  missed: { mark: "✗", text: "Missed" },
  spotted: { mark: "✓", text: "Spotted" },
  played: { mark: "★", text: "Played it" },
} as const;

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const historyPageSize = 20;

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
  retry,
  followUp,
  onClose,
  onLook,
}: {
  readonly title: string;
  readonly state: StarState;
  readonly moments: ReturnType<typeof unitHistory> | undefined;
  readonly retry?: MomentAttemptRecord["source"] | undefined;
  readonly followUp?: MomentAttemptRecord["source"] | undefined;
  readonly onClose: () => void;
  readonly onLook: (source: MomentAttemptRecord["source"]) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(historyPageSize);
  const closeId = useId();
  const hasPractice = retry !== undefined || followUp !== undefined;
  return (
    <div className="sky-sheet">
      <Sheet open title={title} onClose={onClose} className="sky-star-sheet">
        <p className={`sky-sheet__status sky-sheet__status--${state}`}>
          <svg viewBox="-10 -10 20 20" aria-hidden="true">
            <StarMark state={state} />
          </svg>
          {starLabels[state]}
        </p>
        {hasPractice && (
          <div className="sky-sheet__practice">
            {retry && (
              <Button
                wide
                onClick={() => {
                  onLook(retry);
                }}
              >
                Try a missed position
              </Button>
            )}
            {followUp && (
              <Button
                wide
                variant={retry ? "ghost" : "primary"}
                onClick={() => {
                  onLook(followUp);
                }}
              >
                Try a similar puzzle
              </Button>
            )}
          </div>
        )}
        {moments === undefined ? (
          <p className="sky-sheet__empty" role="status">
            Loading moments…
          </p>
        ) : moments.length === 0 ? (
          <p className="sky-sheet__empty">No moments for this idea yet.</p>
        ) : (
          <ol className="sky-sheet__history" aria-label="Moments, newest first">
            {moments
              .slice(0, visibleCount)
              .map(({ kind, at, source }, index) => {
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
            {moments.length > visibleCount && (
              <li>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (moments.length <= visibleCount + historyPageSize) {
                      document
                        .getElementById(closeId)
                        ?.focus({ preventScroll: true });
                    }
                    setVisibleCount((count) => count + historyPageSize);
                  }}
                >
                  Show more moments
                </Button>
              </li>
            )}
          </ol>
        )}
        {!hasPractice && <p className="sky-sheet__next">{nextSteps[state]}</p>}
        <Button
          wide
          variant={hasPractice ? "ghost" : "primary"}
          className={hasPractice ? "sky-sheet__close" : undefined}
          id={closeId}
          onClick={onClose}
        >
          Close
        </Button>
      </Sheet>
    </div>
  );
}
