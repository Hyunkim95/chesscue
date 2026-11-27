import { LoadingText } from "../../shared/loading/LoadingState";
import type { AuthoredCue } from "../../domain/material/verified";
import { exerciseSchema } from "../../domain/material/verified";
import { starterPack } from "../../domain/material/pack";
import { reflectionSchema } from "../../domain/material/reflection";
import { useEffect, useRef, useState } from "react";

import type { VerifiedGameDrill } from "../../domain/curriculum/game-drill";
import type { VerifiedTransferExercise } from "../../domain/transfer/types";

type Action = "nano" | "cloud";
interface Path {
  readonly source: "cloud" | "pack";
  readonly followUpId: string | null;
  readonly question: string | null;
  readonly exercise?: VerifiedTransferExercise;
}

async function beforeAbort<T>(
  signal: AbortSignal,
  request: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let rejectAbort: (() => void) | undefined;
  try {
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => {
        reject(new Error("The request timed out or was cancelled."));
      };
      signal.addEventListener("abort", rejectAbort, { once: true });
    });
    return await Promise.race([request(), cancelled]);
  } finally {
    if (rejectAbort) signal.removeEventListener("abort", rejectAbort);
  }
}

export function GameTraining({
  drill,
  message,
  onCue,
  onRetry,
  onFollowUp,
  onReview,
  onRatedGame,
  observations,
  storageKey,
}: {
  drill: VerifiedGameDrill | null;
  message: string | null;
  onCue: (cue: AuthoredCue) => void;
  onRetry: (drill: VerifiedGameDrill) => void;
  onFollowUp: (
    exercise: VerifiedTransferExercise,
    question: string | null,
  ) => void;
  onReview?: (() => void) | undefined;
  onRatedGame: () => void;
  observations: number;
  storageKey: string;
}) {
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [path, setPath] = useState<Path | null>(() => {
    if (!drill) return null;
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "null",
      );
      if (
        !saved ||
        typeof saved !== "object" ||
        !("runId" in saved) ||
        saved.runId !== starterPack.runId ||
        !("drillId" in saved) ||
        saved.drillId !== drill.exercise.id ||
        !("source" in saved) ||
        (saved.source !== "pack" && saved.source !== "cloud") ||
        !("question" in saved) ||
        !("followUpId" in saved)
      )
        return null;
      const question =
        saved.question === null ? null : reflectionSchema.parse(saved.question);
      const exercise =
        "exercise" in saved ? exerciseSchema.parse(saved.exercise) : null;
      const id = saved.followUpId;
      if (
        exercise &&
        (exercise.id !== id ||
          exercise.theme !== drill.exercise.theme ||
          exercise.fen === drill.exercise.fen ||
          exercise.authorship.route !== "cloud")
      )
        return null;
      if (
        id !== null &&
        (typeof id !== "string" ||
          !(
            (exercise?.id === id && exercise.theme === drill.exercise.theme) ||
            drill.followUps.some((x) => x.id === id)
          ))
      )
        return null;
      return {
        source: saved.source,
        question,
        followUpId: id,
        ...(exercise ? { exercise } : {}),
      };
    } catch {
      // A path can still be built without local storage.
    }
    return null;
  });
  const run = useRef<AbortController | null>(null);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      run.current?.abort();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  function showPath(drillId: string, next: Path) {
    setPath(next);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ runId: starterPack.runId, drillId, ...next }),
      );
    } catch {
      // The displayed path stays available for this session.
    }
  }

  async function act(action: Action) {
    if (drill === null) return;
    const controller = new AbortController();
    run.current?.abort();
    run.current = controller;
    setPending(action);
    setNotice("");
    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(action === "nano" ? 12_000 : 18_000),
      ]);
      if (action === "nano") {
        const prompt = await beforeAbort(signal, async () => {
          const ai =
            await import("../../infrastructure/ai/skill-training-gemini");
          return ai.draftOfflineCue(drill, signal);
        });
        if (controller.signal.aborted) return;
        onCue(prompt);
        setNotice("Gemini Nano wrote this question on your device.");
      } else {
        const draft = await beforeAbort(signal, async () => {
          const ai =
            await import("../../infrastructure/ai/skill-training-gemini");
          return ai.draftCloudFollowUp(drill, observations, signal);
        });
        if (controller.signal.aborted) return;
        showPath(drill.exercise.id, {
          source: "cloud",
          followUpId: draft?.followUpId ?? null,
          question: draft?.question ?? null,
          ...(draft?.exercise ? { exercise: draft.exercise } : {}),
        });
      }
    } catch {
      if (controller.signal.aborted) return;
      if (action === "cloud") {
        showPath(drill.exercise.id, {
          source: "pack",
          question: null,
          followUpId: drill.followUps[0]?.id ?? null,
        });
        setNotice(
          "Cloud generation is unavailable. Using the installed Gemini and Stockfish material.",
        );
      } else {
        setNotice(
          "Gemini Nano is unavailable on this device. The verified drill is ready with its cached Gemini prompt.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  }

  const followUp =
    path?.exercise ??
    (path && drill?.followUps.find(({ id }) => id === path.followUpId));
  const reviewButton = onReview && (
    <button
      className="review-action"
      type="button"
      disabled={pending !== null}
      onClick={onReview}
    >
      Review this game
    </button>
  );
  if (drill === null && message === null && !onReview) return null;

  return (
    <section className="skill-focus-game" aria-labelledby="game-training-title">
      <h3 id="game-training-title">Train from this game</h3>
      {drill ? (
        <>
          <p>
            {drill.moveLabel} ·{" "}
            {drill.imported ? "Imported game" : "ChessCue game"} ·{" "}
            <time dateTime={drill.completedAt}>
              {new Date(drill.completedAt).toLocaleDateString()}
            </time>
          </p>
          <details>
            <summary>Show what Stockfish checked</summary>
            <p>
              You played {drill.played}. Stockfish’s stronger move was{" "}
              {drill.candidate}.
            </p>
            {reviewButton}
          </details>
          <div className="progress-actions">
            <button
              className="review-action"
              disabled={pending !== null}
              onClick={() => void act("nano")}
            >
              {pending === "nano" ? (
                <LoadingText>Preparing a local prompt…</LoadingText>
              ) : (
                "Personalize with Gemini Nano"
              )}
            </button>
            <button
              className="review-action"
              disabled={!online || pending !== null}
              onClick={() => void act("cloud")}
            >
              {pending === "cloud" ? (
                <LoadingText>Building your path…</LoadingText>
              ) : online ? (
                "Build path online"
              ) : (
                "Go online to build a path"
              )}
            </button>
          </div>
          {path && (
            <section
              className="game-training-path"
              aria-label="Verified training path"
            >
              <p className="section-kicker">
                {path.source === "cloud"
                  ? "Path personalized with Gemini Cloud"
                  : "Cached Gemini training path"}
              </p>
              <ol>
                <li>
                  <button
                    className="review-action"
                    onClick={() => {
                      onRetry(drill);
                    }}
                  >
                    Replay {drill.moveLabel.toLowerCase()}
                  </button>
                </li>
                {followUp && (
                  <li>
                    <button
                      className="review-action"
                      onClick={() => {
                        onFollowUp(followUp, path.question);
                      }}
                    >
                      Try a verified follow-up position
                    </button>
                  </li>
                )}
                <li>
                  <button className="review-action" onClick={onRatedGame}>
                    Look for it in a rated game
                  </button>
                </li>
              </ol>
            </section>
          )}
        </>
      ) : (
        <>
          {message && <p role="status">{message}</p>}
          {reviewButton}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
