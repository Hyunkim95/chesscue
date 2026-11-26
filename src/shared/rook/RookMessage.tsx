import type { ReactNode } from "react";
import portrait from "../../assets/brand/rook.webp";
import "./rook.css";

const messageTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function RookMessage({
  children,
  context,
  sentAt,
  player = false,
}: {
  children: ReactNode;
  context?: string;
  sentAt?: number;
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
      <div className="rook-chat__message-heading">
        <span className="rook-chat__byline">
          {player ? "You" : "Rook"}
          {context && (
            <>
              {" "}
              · <span>{context}</span>
            </>
          )}
        </span>
        {sentAt !== undefined && (
          <time
            className="rook-chat__timestamp"
            dateTime={new Date(sentAt).toISOString()}
          >
            {messageTime.format(sentAt)}
          </time>
        )}
      </div>
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

export function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m3 3 18 9-18 9 3-9-3-9ZM6 12h15" />
    </svg>
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
        className="rook-chat__send rook-send-icon"
        aria-label="Send"
        title="Send message"
        type="submit"
        disabled={disabled || !value.trim()}
      >
        <SendIcon />
      </button>
    </form>
  );
}
