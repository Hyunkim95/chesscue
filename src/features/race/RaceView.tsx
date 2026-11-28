import { LoadingState, LoadingText } from "../../shared/loading/LoadingState";
import { BusyButton } from "../../shared/ui/primitives";
import { EmptyState } from "../../shared/empty-state/EmptyState";
import { ScreenHeader } from "../../shared/navigation/ScreenHeader";
import { useEffect, useState } from "react";
import bronzeRook from "../../assets/brand/rating-rook.webp";
import jadeRook from "../../assets/brand/rook.webp";

import {
  firstCrossing,
  goalLabel,
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
  panel,
  id,
  user,
  session,
  ratings,
  onPlay,
  accountError,
  conflict,
  uploadsPending,
}: {
  panel: boolean;
  id: string | null;
  user: AccountIdentity | null;
  session: AccountSession | null;
  ratings: readonly RatingEntry[];
  onPlay: () => void;
  accountError: string | null;
  conflict: boolean;
  uploadsPending: boolean;
}) {
  const {
    links,
    error: linksError,
    loaded: linksLoaded,
  } = useRaceLinks(session, user?.uid ?? null);
  const own = links.find((r) => r.id === id);
  const key = "chesscue-race/" + (user?.uid ?? "") + "/" + (id ?? "");
  const [members, setMembers] = useState<Standing[]>(() =>
    cached(key, standingSchema.array(), []),
  );
  const [goal, setGoal] = useState<RaceGoal | null>(null);
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
  const highest = activeGoal?.kind === "highest";
  const underReview = members.some((m) => m.disputed) || conflict;
  const earliest = highest || conflict ? null : firstCrossing(members);
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
          (highest
            ? local.peak !== m.peak
            : local.current !== m.current || local.crossedAt !== m.crossedAt),
      };
    })
    .sort(
      (a, b) =>
        Number(a.disputed) - Number(b.disputed) ||
        (highest
          ? (b.peak ?? -1) - (a.peak ?? -1)
          : (a.crossedAt ?? "z").localeCompare(b.crossedAt ?? "z") ||
            (a.target === null || a.current === null
              ? Infinity
              : a.target - a.current) -
              (b.target === null || b.current === null
                ? Infinity
                : b.target - b.current)) ||
        a.uid.localeCompare(b.uid),
    );
  const leadPeak = highest && !underReview ? (rows[0]?.peak ?? null) : null;
  const tied = highest
    ? leadPeak !== null && rows.filter((m) => m.peak === leadPeak).length > 1
    : earliest !== null &&
      members.filter((m) => m.crossedAt === earliest).length > 1;
  return (
    <main
      className={
        user
          ? "content-shell race-view"
          : "content-shell race-view race-view--sign-in"
      }
    >
      {(!panel || id) && (
        <a
          href={panel ? "#races" : "#play-mode"}
          className="lesson-back"
          aria-label={panel ? "Back to Elo races" : "Back to Play"}
        >
          {panel ? "Back to Elo races" : "Back to Play"}
        </a>
      )}
      <ScreenHeader title={activeGoal ? goalLabel(activeGoal) : "Elo races"} />
      {error || accountError || linksError ? (
        <p role="alert">
          {error || (accountError ?? "Your races could not be loaded.")}
        </p>
      ) : null}
      {!online && <p>Offline. Showing the last synced standings.</p>}
      {!user ? (
        <EmptyState
          art="race"
          title={id ? "Join your friend’s race" : "Race your friends"}
          description={
            id
              ? "Sign in to join the race and track your Elo progress."
              : "Invite friends and see who reaches the highest Elo in rated CPU games."
          }
        >
          <BusyButton
            className="primary-link"
            busy={busy}
            disabled={!session || !online}
            onClick={() => {
              if (session) void act(() => session.signIn());
            }}
          >
            Continue with Google
          </BusyButton>
        </EmptyState>
      ) : !id ? (
        <>
          {session &&
            online &&
            !linksLoaded &&
            !linksError &&
            links.length === 0 && <LoadingState>Loading races…</LoadingState>}
          {linksLoaded && links.length === 0 && (
            <EmptyState
              art="race"
              title="Start your first race"
              description="Share an invite and see who reaches the highest Elo."
            />
          )}
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
                const newId = await session.races.create();
                location.hash = "race/" + newId;
              });
            }}
          >
            <BusyButton
              type="submit"
              className="primary-link"
              busy={busy}
              disabled={!online}
            >
              Create race
            </BusyButton>
          </form>
        </>
      ) : !own ? (
        <>
          {activeGoal && (
            <p>
              {highest
                ? "Play rated CPU games. Your highest Elo in this race stays on the leaderboard."
                : "Play rated CPU games to reach the goal. Your first published Elo sets your starting point."}
            </p>
          )}
          {session && !goal && !error && !accountError && online && (
            <p role="status">
              <LoadingText>Loading invitation…</LoadingText>
            </p>
          )}
          <BusyButton
            className="primary-link"
            busy={busy}
            disabled={!goal || !online}
            onClick={() => {
              if (session)
                void act(async () => {
                  await session.races.join(id);
                });
            }}
          >
            Join race
          </BusyButton>
        </>
      ) : (
        <>
          {highest ? (
            <div className="race-leaderboard-banner">
              <h2>Leaderboard</h2>
              <div className="race-leaderboard-banner__art" aria-hidden="true">
                <img src={jadeRook} alt="" />
                <img src={bronzeRook} alt="" />
              </div>
            </div>
          ) : (
            <h2>Standings</h2>
          )}
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
                  ) : highest ? (
                    <>
                      <span>
                        {m.peak == null
                          ? "In placement"
                          : `${m.peak.toString()} Elo`}
                      </span>
                      {leadPeak !== null && m.peak === leadPeak && (
                        <small>{tied ? "Tied for first" : "Leading"}</small>
                      )}
                      {m.pending && m.local?.peak != null && (
                        <small>
                          {m.local.peak.toString()} Elo · Pending sync
                        </small>
                      )}
                    </>
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
