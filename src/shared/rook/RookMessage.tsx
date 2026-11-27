import type { ReactNode, Ref } from "react";
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

export function RookChatHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="rook-chat__header">
      <h2 className="rook-chat__title">Rook</h2>
      {children}
    </header>
  );
}

export function RookConversationButton({
  expanded,
  onClick,
  buttonRef,
  unread = false,
  label = expanded ? "Hide conversation" : "Discuss position",
}: {
  expanded: boolean;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  unread?: boolean;
  label?: string;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="rook-conversation-button board-action--quiet"
      aria-label={unread ? label + ", new learning moment" : label}
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span className="rook-conversation-icon" aria-hidden="true" />
      {unread && <span className="rook-toggle__dot" aria-hidden="true" />}
    </button>
  );
}

export function RookBoardShelf({
  open,
  guidance,
  conversation,
  composer,
  actions,
  inputStatus,
  notes,
}: {
  open: boolean;
  guidance?: ReactNode;
  conversation: ReactNode;
  composer: ReactNode;
  actions?: ReactNode;
  inputStatus?: ReactNode;
  notes?: ReactNode;
}) {
  return (
    <div className="rook-board-shelf">
      <div className="rook-board-shelf__context">
        <div className="rook-board-shelf__guidance">{guidance}</div>
        <div className="rook-board-shelf__transcript" hidden={!open}>
          {conversation}
        </div>
      </div>
      <div className="rook-board-shelf__composer">
        {actions}
        <div className="rook-board-shelf__dock">
          {inputStatus}
          {composer}
        </div>
      </div>
      <div className="rook-board-shelf__notes">{notes}</div>
    </div>
  );
}

export function HandsFreeIcon() {
  return (
    <svg
      className="rook-hands-free-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </svg>
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
  inputRef,
  onFocus,
  onChange,
  onSend,
  disabled,
  children,
}: {
  value: string;
  inputRef?: Ref<HTMLInputElement>;
  onFocus?: (() => void) | undefined;
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
        ref={inputRef}
        onFocus={onFocus}
        aria-label="Message Rook"
        placeholder="Ask Rook"
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
