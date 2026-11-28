import { z } from "zod";
import {
  useStudyNavigation,
  returnToParent,
  useEntryState,
} from "../../shared/navigation/history-entry";
import { useLayoutEffect, useRef } from "react";
import type { HistoricalGame } from "../../domain/study/historical-game";
import {
  explainStudyLine,
  type StudyOrigin,
} from "../../domain/study/study-connection";
import type { StudyAI } from "../../infrastructure/ai/study-gemini";
import { PositionChat } from "./PositionChat";

export function HistoricalStudy({
  found,
  origin,
  ai,
  onBack,
  onCompare,
}: {
  found: HistoricalGame & { goal: string; origin?: StudyOrigin | null };
  origin: StudyOrigin | null;
  ai: StudyAI | null;
  onBack: () => void;
  onCompare: (source: StudyOrigin) => void;
}) {
  const enterStudy = useStudyNavigation();
  const [view, setView] = useEntryState(
    "historical.side",
    z.enum(["initial", "personal", "historical"]),
    "initial",
  );
  const container = useRef<HTMLDivElement>(null);
  const personal = found.origin?.position ? found.origin : null;
  function showPersonal() {
    enterStudy("historical-comparison");
    setView("personal");
  }
  useLayoutEffect(() => {
    if (view === "initial") return;
    const heading = container.current?.querySelector<HTMLElement>(
      ":scope > div:not([hidden]) .study-shell > h2",
    );
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start" });
  }, [view]);
  return (
    <div ref={container} className="historical-study">
      <div hidden={view === "personal"}>
        <PositionChat
          ai={ai}
          lesson={found.lesson}
          question={found.lesson.question}
          orientation={found.orientation}
          backLabel="Back to historical search"
          backVisible={view !== "personal"}
          onBack={onBack}
          replay
          alternateBoard={
            personal && (
              <button
                type="button"
                className="review-action"
                onClick={showPersonal}
              >
                Your position · {personal.played}
              </button>
            )
          }
          connection={
            <section
              className="study-panel study-connection"
              aria-label="Game connection"
            >
              {found.origin && (
                <>
                  <h3>Your move</h3>
                  <small>
                    {found.origin.gameLabel} · {found.origin.day} ·{" "}
                    {found.origin.theme}
                  </small>
                  <p>
                    You played{" "}
                    {personal ? (
                      <button
                        type="button"
                        className="study-move-link"
                        onClick={showPersonal}
                      >
                        {personal.played}
                      </button>
                    ) : (
                      <strong>{found.origin.played}</strong>
                    )}
                    {found.origin.reply ? (
                      <>
                        {" "}
                        and your opponent replied{" "}
                        <strong>{found.origin.reply}</strong>
                      </>
                    ) : null}
                    . Stockfish preferred{" "}
                    <strong>{found.origin.preferred}</strong>.
                  </p>
                </>
              )}
              <h3>
                {found.origin ? "Why this position fits" : "In this position"}
              </h3>
              <p>
                {explainStudyLine(
                  found.lesson.fen,
                  found.lesson.continuation,
                  found.origin,
                )}
              </p>
              {!personal && origin && (
                <button
                  type="button"
                  className="review-action"
                  onClick={() => {
                    onCompare(origin);
                  }}
                >
                  Compare with my {origin.played}
                </button>
              )}
            </section>
          }
          sources={
            <div className="historical-sources">
              <p>Verified game score · {found.goal}</p>
              <a href={found.scoreUrl} target="_blank" rel="noreferrer">
                PGN score collection
              </a>
            </div>
          }
        />
      </div>
      {personal && view !== "initial" && (
        <div hidden={view !== "personal"}>
          <PositionChat
            ai={ai}
            orientation={personal.position.orientation}
            lesson={{
              title: "Your game before " + personal.played,
              fen: personal.position.fen,
              continuation: personal.position.continuation,
              insight:
                "You played " +
                personal.played +
                ". Stockfish preferred " +
                personal.preferred +
                ".",
              question: found.lesson.question,
            }}
            question={found.lesson.question}
            backLabel="Back to historical board"
            backVisible={view === "personal"}
            onBack={() => {
              returnToParent(() => {
                setView("historical");
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
