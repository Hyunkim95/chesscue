import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  courses,
  libraryRoadmap,
  recommendedTopic,
  suggestedStart,
  roadmapSchema,
  topicSchema,
  type Roadmap,
  type StudyTopic,
} from "../../domain/study/roadmap";
import type { PlayerProfile } from "../../domain/curriculum/types";
import type { StudyAI } from "../../infrastructure/ai/study-gemini";
import type { GameRecord } from "../../domain/game/types";
import { PersonalGameStudy } from "./PersonalGameStudy";
import type { HistoricalGame } from "../../domain/study/historical-game";
import { PositionChat } from "./PositionChat";
import type { MovePattern } from "../../domain/curriculum/playing-snapshot";
import {
  studyOrigin,
  type StudyOrigin,
} from "../../domain/study/study-connection";
import { HistoricalStudy } from "./HistoricalStudy";
import { LessonChallenge } from "./LessonChallenge";
import "./study.css";

type RequestState =
  | { status: "idle" }
  | { status: "researching" }
  | { status: "error"; message: string };
function loadRoadmaps(key: string): Roadmap[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item: unknown) => {
      const parsed = roadmapSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}
export function StudyScreen({
  initialTopic,
  history,
  pattern,
  storageKey,
  profile,
}: {
  initialTopic?: StudyTopic | undefined;
  pattern?: MovePattern | undefined;
  history:
    | { status: "checking" }
    | { status: "ready"; games: readonly GameRecord[] }
    | { status: "failed"; message: string };
  storageKey: string;
  profile: PlayerProfile;
}) {
  const content = useRef<HTMLElement>(null);
  const includeMove = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState(initialTopic !== undefined);
  const completed = history.status === "ready" ? history.games : undefined;
  const games = useMemo(
    () =>
      completed
        ?.filter((game) => {
          if (!game.playerColor || !game.result || !game.completedAt)
            return false;
          const startsOnPlayerTurn =
            game.initialFen.split(" ")[1] ===
            (game.playerColor === "black" ? "b" : "w");
          return game.moves.length >= (startsOnPlayerTurn ? 1 : 2);
        })
        .toReversed() ?? [],
    [completed],
  );
  const [topic, setTopic] = useState<StudyTopic>(
    () => initialTopic ?? recommendedTopic(profile),
  );
  const [exampleOpen, setExampleOpen] = useState(initialTopic !== undefined);
  const [found, setFound] = useState<
    (HistoricalGame & { goal: string; origin?: StudyOrigin | null }) | null
  >(null);
  const [goal, setGoal] = useState("");
  const [draft, setDraft] = useState<Roadmap | null>(() =>
    initialTopic === undefined
      ? null
      : libraryRoadmap(initialTopic, suggestedStart(profile, initialTopic)),
  );
  const [saved, setSaved] = useState(() => loadRoadmaps(storageKey));
  const savedForTopic = saved.filter(
    (item) => initialTopic === undefined || item.topic === initialTopic,
  );
  const [exploring, setExploring] = useState(false);
  const [lesson, setLesson] = useState<number | null>(null);
  const [state, setState] = useState<RequestState>({ status: "idle" });
  const [online, setOnline] = useState(navigator.onLine);
  const [ai, setAI] = useState<StudyAI | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let live = true;
    void import("../../infrastructure/ai/study-gemini")
      .then((m) => {
        if (live) setAI(m.createStudyAI());
      })
      .catch(() => {
        /* Built-in study stays available. */
      });
    const update = () => {
      setOnline(navigator.onLine);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      live = false;
      controller.current?.abort();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const startAt = suggestedStart(profile, topic);
  const suggestedGoal =
    pattern?.name ?? (initialTopic ? courses[initialTopic].title : "");
  const searchGoal = goal.trim() || suggestedGoal;
  const origin = useMemo(() => studyOrigin(pattern), [pattern]);
  function open(roadmap: Roadmap) {
    controller.current?.abort();
    setDraft(roadmap);
    setTopic(roadmap.topic);
    setLesson(null);
    setState({ status: "idle" });
  }
  async function research() {
    if (!ai || !online || !searchGoal) return;
    const run = new AbortController();
    controller.current?.abort();
    controller.current = run;
    setState({ status: "researching" });
    try {
      const requestOrigin =
        !goal.trim() || includeMove.current?.checked ? origin : null;
      const query = requestOrigin
        ? searchGoal +
          ". In my game I played " +
          requestOrigin.played +
          "; Stockfish preferred " +
          requestOrigin.preferred +
          ". Find a position illustrating the same decision."
        : searchGoal;
      const result = await ai.research(query, run.signal);
      if (run.signal.aborted) return;
      if (result.ok) {
        setFound({ ...result.value, goal: searchGoal, origin: requestOrigin });
        setState({ status: "idle" });
        return;
      }
      const messages = {
        quota:
          "Gemini search has reached its usage limit. Try again later or browse the offline examples.",
        "app-check":
          import.meta.env.DEV &&
          import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true"
            ? "Firebase could not verify this browser. Register its App Check debug token, then reload and retry."
            : "Firebase could not verify this browser. Reload and try again or browse the offline examples.",
        unavailable:
          "Gemini Cloud is unavailable. Try again later or browse the offline examples.",
        unverified:
          "No matching game score and move could be verified. Try a more specific goal or browse the offline examples.",
      };
      setState({ status: "error", message: messages[result.error] });
    } catch {
      if (!run.signal.aborted)
        setState({
          status: "error",
          message:
            "Cloud research could not finish. Try again or browse the offline examples.",
        });
    }
  }
  function save(roadmap: Roadmap) {
    try {
      const records = [
        ...loadRoadmaps(storageKey).filter(
          (item) => item.topic !== roadmap.topic,
        ),
        roadmap,
      ];
      localStorage.setItem(storageKey, JSON.stringify(records));
      setSaved(records);
      setState({ status: "idle" });
    } catch {
      setState({
        status: "error",
        message:
          "The roadmap could not be saved. Check this browser’s storage and try again.",
      });
    }
  }
  useLayoutEffect(() => {
    if (lesson !== null || found !== null)
      content.current?.scrollIntoView({ block: "start" });
  }, [draft, lesson, exampleOpen, found, library]);
  const course = courses[topic];
  const selected = lesson === null ? undefined : course.lessons[lesson];
  if (found)
    return (
      <HistoricalStudy
        found={found}
        origin={origin}
        ai={ai}
        onBack={() => {
          setFound(null);
        }}
        onCompare={(source) => {
          setFound({ ...found, origin: source });
        }}
      />
    );
  if (draft && selected && lesson !== null && !exploring)
    return (
      <LessonChallenge
        key={topic + String(lesson)}
        topic={topic}
        lessonIndex={lesson}
        onBack={() => {
          setLesson(null);
        }}
        onNext={
          lesson < courses[topic].lessons.length - 1
            ? () => {
                setLesson(lesson + 1);
              }
            : undefined
        }
      />
    );
  if (draft && selected && lesson !== null)
    return (
      <PositionChat
        key={topic + String(lesson)}
        ai={ai}
        lesson={selected}
        question={draft.questions[lesson] ?? selected.question}
        onBack={() => {
          setLesson(null);
        }}
      />
    );
  if (!library && history.status === "checking")
    return (
      <section
        className="content-shell study-shell"
        aria-label="Lessons and position practice"
      >
        <p role="status">Opening your games…</p>
      </section>
    );
  if (!library && games.length > 0)
    return (
      <PersonalGameStudy
        ai={ai}
        games={games}
        onLibrary={() => {
          setLibrary(true);
        }}
      />
    );
  if (online && !exampleOpen)
    return (
      <section
        ref={content}
        className="content-shell study-shell"
        aria-label="Lessons and position practice"
      >
        <div className="study-panel">
          <h2>Find a historical game</h2>
          <p>
            Gemini searches the PGN Mentor archive for a game that illustrates
            your goal.
          </p>
          <label>
            What would you like to learn?
            <textarea
              rows={2}
              maxLength={240}
              value={goal}
              disabled={state.status === "researching"}
              onChange={(event) => {
                setGoal(event.currentTarget.value);
              }}
              placeholder="For example, how do I use an open file?"
            />
          </label>
          {goal.trim() && origin && (
            <label className="study-origin-toggle">
              <input
                ref={includeMove}
                type="checkbox"
                disabled={state.status === "researching"}
              />
              Use my {origin.played} as the starting point
            </label>
          )}
          {!goal.trim() && suggestedGoal && (
            <p>
              {pattern ? "Pattern from your games" : "Selected topic"} ·{" "}
              {suggestedGoal}
              {origin
                ? " · " +
                  origin.played +
                  " (Stockfish preferred " +
                  origin.preferred +
                  ")"
                : ""}
            </p>
          )}
          <div className="study-actions">
            <button
              className="primary-link"
              disabled={!ai || !searchGoal || state.status === "researching"}
              onClick={() => void research()}
            >
              {state.status === "researching"
                ? "Finding and verifying a game…"
                : "Find game with Gemini"}
            </button>
            <button
              className="review-action"
              onClick={() => {
                controller.current?.abort();
                setState({ status: "idle" });
                setExampleOpen(true);
              }}
            >
              Browse offline examples
            </button>
            {games.length > 0 && !initialTopic && (
              <button
                className="study-back"
                onClick={() => {
                  controller.current?.abort();
                  setState({ status: "idle" });
                  setLibrary(false);
                }}
              >
                Back to your games
              </button>
            )}
          </div>
          {!ai && (
            <p role="status">Online research requires a Firebase connection.</p>
          )}
          {state.status === "error" && <p role="alert">{state.message}</p>}
        </div>
      </section>
    );
  const roadmap = draft ?? libraryRoadmap(topic, startAt);
  const isSaved = saved.some(
    (item) => JSON.stringify(item) === JSON.stringify(roadmap),
  );
  return (
    <section
      ref={content}
      className="skill-challenges"
      aria-label="Lessons and position practice"
    >
      <ol className="skill-challenge-list">
        {course.lessons.map((step, index) => (
          <li key={step.title}>
            <div>
              <h3>{step.title}</h3>
              <p>{roadmap.questions[index]}</p>
            </div>
            <button
              type="button"
              className={
                index === roadmap.startAt ? "primary-link" : "review-action"
              }
              aria-label={"Play " + step.title}
              onClick={() => {
                if (!draft) open(roadmap);
                setExploring(false);
                setLesson(index);
              }}
            >
              Play <span aria-hidden="true">▸</span>
            </button>
          </li>
        ))}
      </ol>
      <details className="skill-study-options">
        <summary>More options</summary>
        <a href={course.url} target="_blank" rel="noreferrer">
          {course.source}
        </a>
        {draft?.source === "cloud" && draft.reference !== null && (
          <a
            href={
              draft.reference === "score"
                ? "https://lichess.org/study/" + course.studyChapter
                : course.researchUrls[draft.reference]
            }
            target="_blank"
            rel="noreferrer"
          >
            Read the research source
          </a>
        )}
        {initialTopic === undefined && (
          <label>
            Study topic
            <select
              value={topic}
              onChange={(event) => {
                const next = topicSchema.safeParse(event.target.value);
                if (next.success) {
                  controller.current?.abort();
                  setTopic(next.data);
                  setDraft(null);
                  setState({ status: "idle" });
                }
              }}
            >
              {topicSchema.options.map((id) => (
                <option value={id} key={id}>
                  {courses[id].title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="study-actions">
          <button
            className="review-action"
            onClick={() => {
              open(libraryRoadmap(topic, startAt));
            }}
          >
            Open built-in roadmap
          </button>
          <button
            className="review-action"
            disabled={isSaved}
            onClick={() => {
              save(roadmap);
            }}
          >
            {isSaved
              ? "Saved for offline study"
              : saved.some((item) => item.topic === topic)
                ? "Update saved roadmap"
                : "Save for offline study"}
          </button>
          <button
            className="review-action"
            onClick={() => {
              open(roadmap);
              setExploring(true);
              setLesson(roadmap.startAt);
            }}
          >
            Explore position
          </button>
          {online && (
            <button
              className="review-action"
              onClick={() => {
                setExampleOpen(false);
                setState({ status: "idle" });
              }}
            >
              Find a historical game online
            </button>
          )}
          {initialTopic === undefined && games.length > 0 && (
            <button
              className="review-action"
              onClick={() => {
                controller.current?.abort();
                setLibrary(false);
              }}
            >
              Back to your games
            </button>
          )}
        </div>
        {savedForTopic.map((item) => (
          <button
            key={item.topic}
            className="review-action"
            onClick={() => {
              open(item);
            }}
          >
            Open saved {courses[item.topic].title}
          </button>
        ))}
        {history.status === "failed" && (
          <p role="status">
            Your saved games could not be loaded. The game library is available.
          </p>
        )}
        {state.status === "error" && <p role="alert">{state.message}</p>}
      </details>
    </section>
  );
}
