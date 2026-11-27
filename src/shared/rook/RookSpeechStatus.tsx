import { LoadingText } from "../loading/LoadingState";
import type { useRookSpeech } from "./use-rook-speech";

export function RookSpeechStatus({
  voice,
  onOnline,
  downloadLabel = "Download speech",
}: {
  voice: ReturnType<typeof useRookSpeech>;
  onOnline?: () => void;
  downloadLabel?: string;
}) {
  const state = voice.state;
  if (state.status === "idle") return null;

  return (
    <div className="rook-speech-status">
      <span role="status">
        {state.status === "permission" ? (
          "Allow microphone access in Chrome to talk to Rook."
        ) : state.status === "ready" ? (
          "Offline speech is ready. Tap the mic to talk."
        ) : state.status === "setup" ? (
          state.download && navigator.onLine ? (
            "Download the speech pack to use the mic offline."
          ) : (
            "Offline speech is unavailable."
          )
        ) : state.status === "error" ? (
          state.message
        ) : state.status === "listening" ? (
          state.text || "Listening…"
        ) : (
          <LoadingText>
            {state.status === "installing"
              ? "Downloading offline speech…"
              : state.status === "starting"
                ? "Opening microphone…"
                : "Finishing speech…"}
          </LoadingText>
        )}
      </span>
      {state.status === "permission" && (
        <a href="?microphone=1" target="_blank" rel="noopener noreferrer">
          Allow microphone
        </a>
      )}
      {state.status === "setup" && navigator.onLine && (
        <>
          {state.download && (
            <button
              type="button"
              onClick={() => {
                void voice.start("install");
              }}
            >
              {downloadLabel}
            </button>
          )}
        </>
      )}
      {navigator.onLine &&
        (state.status === "setup" ||
          (state.status === "error" && state.onlineRetry)) && (
          <>
            <button
              type="button"
              onClick={() => {
                onOnline?.();
                void voice.start("online");
              }}
            >
              Use online speech
            </button>
            <small>Online speech uses your browser’s speech service.</small>
          </>
        )}
      {["starting", "installing", "finishing", "listening"].includes(
        state.status,
      ) && (
        <button type="button" onClick={voice.cancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
