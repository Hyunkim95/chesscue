import type { ReactNode } from "react";
import portrait from "../../assets/brand/rook.webp";
import "./rook.css";

export function RookMessage({
  children,
  context,
  player = false,
}: {
  children: ReactNode;
  context?: string;
  player?: boolean;
}) {
  const message = (
    <div
      className={
        player
          ? "rook-chat__message rook-chat__message--player"
          : "rook-chat__message"
      }
    >
      <span className="rook-chat__byline">
        {player ? "You" : "Rook"}
        {context && (
          <>
            {" "}
            · <span>{context}</span>
          </>
        )}
      </span>
      {children}
    </div>
  );
  return player ? (
    message
  ) : (
    <div className="rook-chat__turn">
      <img
        className="rook-chat__avatar"
        src={portrait}
        alt=""
        width="28"
        height="36"
      />
      {message}
    </div>
  );
}

export function RookChatHeader({
  context,
  children,
}: {
  context: string;
  children?: ReactNode;
}) {
  return (
    <header className="rook-chat__header">
      <div>
        <h2>Rook</h2>
        <p>{context}</p>
      </div>
      {children}
    </header>
  );
}

export function RookComposer({
  value,
  onChange,
  onSend,
  disabled,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  children?: ReactNode;
}) {
  return (
    <form
      className="rook-chat__composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && value.trim()) onSend();
      }}
    >
      <input
        aria-label="Message Rook"
        placeholder="Ask Rook…"
        maxLength={500}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
      {children}
      <button
        className="rook-chat__send"
        type="submit"
        disabled={disabled || !value.trim()}
      >
        Send
      </button>
    </form>
  );
}
