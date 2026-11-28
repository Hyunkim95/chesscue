import { useState } from "react";
import { LoadingText } from "../shared/loading/LoadingState";

export function MicrophoneSetup() {
  const [state, setState] = useState<
    "idle" | "requesting" | "allowed" | "blocked"
  >("idle");

  async function request() {
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      setState("allowed");
    } catch {
      setState("blocked");
    }
  }

  return (
    <main className="content-shell content-shell--narrow">
      <section
        className="import-panel"
        aria-labelledby="microphone-setup-title"
      >
        <h1 id="microphone-setup-title">Talk to Rook</h1>
        {state === "allowed" ? (
          <p role="status">
            Microphone allowed. Return to the side panel and tap the mic.
          </p>
        ) : (
          <>
            <p>Allow Chrome to use your microphone for Rook’s voice input.</p>
            {state === "blocked" && (
              <p role="status">
                Chrome couldn’t access your microphone. Check this tab’s
                microphone permission and your device settings, then try again.
              </p>
            )}
            <button
              className="primary-link"
              type="button"
              disabled={state === "requesting"}
              onClick={() => {
                void request();
              }}
            >
              {state === "requesting" ? (
                <LoadingText>Opening microphone…</LoadingText>
              ) : (
                "Allow microphone"
              )}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
