import { useState } from "react";
import type { AccountSession } from "../../infrastructure/firebase/account-session";
import { EmptyState } from "../../shared/empty-state/EmptyState";
import { ScreenHeader } from "../../shared/navigation/ScreenHeader";
import "./race.css";

export function HostedRaces({
  id,
  nativeGoogle,
  session,
  error,
}: {
  readonly id: string | null;
  readonly nativeGoogle: boolean;
  readonly session: AccountSession | null;
  readonly error: string | null;
}) {
  const [signIn, setSignIn] = useState<
    { status: "idle" | "signing-in" } | { status: "failed"; message: string }
  >({ status: "idle" });
  const message = signIn.status === "failed" ? signIn.message : error;
  const route = id ? "#race/" + encodeURIComponent(id) : "#races";

  return (
    <main className="content-shell race-view race-view--sign-in">
      {id && (
        <a href="#races" className="lesson-back">
          Back to Elo races
        </a>
      )}
      <ScreenHeader title="Elo races" />
      <EmptyState
        art="race"
        title={id ? "Join your friend’s race" : "Race your friends"}
        description={
          id
            ? "Sign in to join the race and track your Elo progress."
            : "Invite friends and see who reaches the highest Elo in rated CPU games."
        }
      >
        {nativeGoogle ? (
          <>
            <button
              className="primary-link"
              type="button"
              disabled={!session || signIn.status === "signing-in"}
              onClick={() => {
                if (!session) return;
                setSignIn({ status: "signing-in" });
                void session.signIn().catch((cause: unknown) => {
                  setSignIn({
                    status: "failed",
                    message:
                      cause instanceof Error
                        ? cause.message
                        : "Google sign-in failed. Try again.",
                  });
                });
              }}
            >
              {signIn.status === "signing-in"
                ? "Signing in…"
                : "Continue with Google"}
            </button>
            {message && <p role="status">{message}</p>}
          </>
        ) : (
          <a
            className="primary-link"
            href={"https://chesscue-hybrid-ai-2026.web.app/" + route}
            target="_blank"
            rel="noreferrer"
          >
            Open Elo races on the web
          </a>
        )}
      </EmptyState>
    </main>
  );
}
