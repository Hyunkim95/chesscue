import { useEffect, useState } from "react";

import {
  firstCrossing,
  goalLabel,
  goalSchema,
  raceProgress,
  type RaceGoal,
} from "../../domain/race/elo-race";
import type { RatingEntry } from "../../domain/game/rating";
import type {
  AccountSession,
  AccountIdentity,
} from "../../infrastructure/firebase/account-session";
import {
  standingSchema,
  type Standing,
} from "../../infrastructure/firebase/race-store";
import "./race.css";

import { cache, cached, useRaceLinks } from "./use-race-links";
export function CopyLink({ url, label }: { url: string; label: string }) {
  const [status, setStatus] = useState("");
  return (
    <div className="race-copy">
      <label>
        {label}
        <input
          readOnly
          value={url}
          onFocus={(e) => {
            e.target.select();
          }}
        />
      </label>
      <button
        className="review-action"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(
            () => {
              setStatus("Copied");
            },
            () => {
              setStatus("Select and copy the link.");
            },
          );
        }}
      >
        Copy link
      </button>
      <span aria-live="polite">{status}</span>
    </div>
  );
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Could not update the race. Try again.";
export function RaceView({
  id,
  user,
  session,
  ratings,
  onPlay,
  accountError,
  conflict,
  uploadsPending,
}: {
  id: string | null;
  user: AccountIdentity | null;
  session: AccountSession | null;
  ratings: readonly RatingEntry[];
  onPlay: () => void;
  accountError: string | null;
  conflict: boolean;
  uploadsPending: boolean;
}) {
  const { links, error: linksError } = useRaceLinks(session, user?.uid ?? null);
  const own = links.find((r) => r.id === id);
  const key = "chesscue-race/" + (user?.uid ?? "") + "/" + (id ?? "");
  const [members, setMembers] = useState<Standing[]>(() =>
    cached(key, standingSchema.array(), []),
  );
  const [goal, setGoal] = useState<RaceGoal | null>(null);
  const [kind, setKind] = useState<RaceGoal["kind"]>("gain");
  const [value, setValue] = useState("50");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!id || !session || own || !online) return;
    let live = true;
    void session.races.goal(id).then(
      (g) => {
        if (live) setGoal(g);
      },
      () => {
        if (live) setError("The invitation could not be loaded.");
      },
    );
    return () => {
      live = false;
    };
  }, [id, session, own, online]);
  useEffect(
    () =>
      id && own && session
        ? session.races.members(
            id,
            (rows) => {
              setMembers(rows);
              cache(key, rows);
            },
            () => {
              setError("Standings could not be loaded.");
            },
          )
        : undefined,
    [id, own, session, key],
  );
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const activeGoal = own?.goal ?? goal;
  const underReview = members.some((m) => m.disputed) || conflict;
  const earliest = conflict ? null : firstCrossing(members);
  const tied =
    earliest !== null &&
    members.filter((m) => m.crossedAt === earliest).length > 1;
  const rows = members
    .map((m) => {
      const local =
        user?.uid === m.uid &&
        (!online || uploadsPending) &&
        own &&
        ratings.length
          ? raceProgress(ratings, m, own.goal)
          : null;
      return {
        ...m,
        local,
        pending:
          local &&
          (local.current !== m.current || local.crossedAt !== m.crossedAt),
      };
    })
    .sort(
      (a, b) =>
        Number(a.disputed) - Number(b.disputed) ||
        (a.crossedAt ?? "z").localeCompare(b.crossedAt ?? "z") ||
        (a.target === null || a.current === null
          ? Infinity
          : a.target - a.current) -
          (b.target === null || b.current === null
            ? Infinity
            : b.target - b.current) ||
        a.uid.localeCompare(b.uid),
    );
  return (
    <main className="content-shell race-view">
      <a href="#play-mode" className="lesson-back" aria-label="Back to Play">
        Back to Play
      </a>
      <h1>{activeGoal ? goalLabel(activeGoal) : "Elo races"}</h1>
      {error || accountError || linksError ? (
        <p role="alert">
          {error || (accountError ?? "Your races could not be loaded.")}
        </p>
      ) : null}
      {!online && <p>Offline. Showing the last synced standings.</p>}
      {!user ? (
        <>
          <p>Sign in to race friends to an Elo milestone.</p>
          <button
            className="primary-link"
            disabled={!session || busy || !online}
            onClick={() => {
              if (session) void act(() => session.signIn());
            }}
          >
            Continue with Google
          </button>
        </>
      ) : !id ? (
        <>
          {links.length > 0 && (
            <section>
              <h2>Your races</h2>
              <ul>
                {links.map((l) => (
                  <li key={l.id}>
                    <a href={"#race/" + l.id}>{goalLabel(l.goal)}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!session) return;
              void act(async () => {
                const newId = await session.races.create(
                  goalSchema.parse({ kind, value: Number(value) }),
                );
                location.hash = "race/" + newId;
              });
            }}
          >
            <h2>Start a race</h2>
            <label>
              Goal
              <select
                value={kind}
                onChange={(e) => {
                  const k = e.target.value === "gain" ? "gain" : "milestone";
                  setKind(k);
                  setValue(k === "gain" ? "50" : "1200");
                }}
              >
                <option value="gain">Gain the same number of points</option>
                <option value="milestone">Reach the same rating</option>
              </select>
            </label>
            <label>
              {kind === "gain" ? "Elo to gain" : "Target Elo"}
              <input
                type="number"
                min="1"
                max="10000"
                required
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                }}
              />
            </label>
            <button className="primary-link" disabled={busy || !online}>
              Create race
            </button>
          </form>
        </>
      ) : !own ? (
        <>
          <p>
            Play rated CPU games to reach the goal. Your first published Elo
            sets your starting point.
          </p>
          <button
            className="primary-link"
            disabled={!goal || busy || !online}
            onClick={() => {
              if (session)
                void act(async () => {
                  await session.races.join(id);
                });
            }}
          >
            Join race
          </button>
        </>
      ) : (
        <>
          <h2>Standings</h2>
          {underReview && (
            <p>Placings are on hold while game records are under review.</p>
          )}
          <ol aria-label="Race standings">
            {rows.map((m) => {
              const p = m.pending && m.local ? m.local : m;
              const disputed = m.disputed || (m.uid === user.uid && conflict);
              return (
                <li key={m.uid}>
                  <strong>
                    {m.name}
                    {m.uid === user.uid ? " (you)" : ""}
                  </strong>
                  {disputed ? (
                    <span>Under review</span>
                  ) : (
                    <>
                      <span>
                        {p.current === null
                          ? "In placement"
                          : p.current.toString() + " Elo"}
                      </span>
                      <small>
                        {p.baseline !== null
                          ? `Started at ${p.baseline.toString()} · Target ${p.target?.toString() ?? ""}`
                          : "Waiting for first published Elo"}
                      </small>
                      {p.baseline !== null &&
                        p.target !== null &&
                        p.target <= p.baseline && (
                          <small>Milestone already reached before entry</small>
                        )}
                      {m.pending ? (
                        <small>Pending sync</small>
                      ) : earliest && m.crossedAt === earliest ? (
                        <small>
                          {tied
                            ? "Tied for first · Provisional"
                            : "Provisional winner"}
                        </small>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <button className="primary-link" onClick={onPlay}>
            Play a rated game
          </button>
          <CopyLink
            label="Invite friends"
            url={location.origin + location.pathname + "#race/" + id}
          />
        </>
      )}
    </main>
  );
}
