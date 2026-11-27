import { useState } from "react";

import "./rook-character.css";

export type AskMode = "online" | "offline";

const placeholder: Record<AskMode, string> = {
  online: "Ask Rook anything…",
  offline: "Tap a chip, or type and I'll check",
};

// Typed questions for Rook. The caller routes the text; voice is the
// caller's speech hook, shown here only as the mic button and its state.
export function AskBar({
  mode,
  placeholder: hint,
  onAsk,
  onMic,
  listening = false,
  disabled = false,
}: {
  readonly mode: AskMode;
  // Replaces the mode's prompt where the screen asks for something specific.
  readonly placeholder?: string | undefined;
  readonly onAsk: (text: string) => void;
  readonly onMic?: (() => void) | undefined;
  readonly listening?: boolean;
  readonly disabled?: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="ask-bar"
      onSubmit={(event) => {
        event.preventDefault();
        const question = text.trim();
        if (question === "") return;
        onAsk(question);
        setText("");
      }}
    >
      <input
        className="ask-bar__input"
        aria-label="Ask Rook"
        placeholder={hint ?? placeholder[mode]}
        value={text}
        disabled={disabled}
        enterKeyHint="send"
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      {onMic && (
        <button
          type="button"
          className={`ask-bar__mic${listening ? " ask-bar__mic--listening" : ""}`}
          aria-label={listening ? "Stop listening" : "Speak to Rook"}
          aria-pressed={listening}
          disabled={disabled}
          onClick={onMic}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </form>
  );
}
