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
  onHandsFree,
  handsFree = false,
  disabled = false,
}: {
  readonly mode: AskMode;
  // Replaces the mode's prompt where the screen asks for something specific.
  readonly placeholder?: string | undefined;
  readonly onAsk: (text: string) => void;
  readonly onMic?: (() => void) | undefined;
  readonly listening?: boolean;
  // Hands-free: Rook reads aloud and listens after each line.
  readonly onHandsFree?: (() => void) | undefined;
  readonly handsFree?: boolean;
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
      {onHandsFree && (
        <button
          type="button"
          className={`ask-bar__mic ask-bar__hands-free${handsFree ? " ask-bar__mic--listening" : ""}`}
          aria-label="Hands-free voice"
          title="Hands-free: Rook reads aloud and listens after each line"
          aria-pressed={handsFree}
          onClick={onHandsFree}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
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
