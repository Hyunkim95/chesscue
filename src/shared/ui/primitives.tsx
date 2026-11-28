import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { Chip as SuggestionChip } from "../../domain/session/types";
import { useCountUp } from "./motion";
import { useMediaQuery } from "./use-media-query";
import { createPortal } from "react-dom";
import "./ui.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "primary" | "ghost";
  readonly wide?: boolean;
  // While the action it started runs: a spinner over the label at the same
  // size, aria-busy, and taps ignored.
  readonly busy?: boolean;
};

// For a feature's own button: its label while idle; while busy, the label
// kept for its width but hidden, with a spinner over it. The button adds
// the ui-busy class and aria-busy, and ignores taps.
export function BusyLabel({
  busy,
  children,
}: {
  readonly busy: boolean;
  readonly children: ReactNode;
}) {
  return busyContent(busy, children);
}

function busyContent(busy: boolean, children: ReactNode): ReactNode {
  if (!busy) return children;
  return (
    <>
      <span className="ui-busy__label">{children}</span>
      <span className="ui-busy__spinner" aria-hidden="true" />
    </>
  );
}

// Busy and disabled controls keep focus but ignore taps.
function guarded(
  inert: boolean,
  onClick: ButtonHTMLAttributes<HTMLButtonElement>["onClick"],
): ButtonHTMLAttributes<HTMLButtonElement>["onClick"] {
  return inert
    ? (event) => {
        event.preventDefault();
      }
    : onClick;
}

// The chunky, pressable action. One primary per view (§17.3 rule 5).
export function Button({
  variant = "primary",
  wide = false,
  busy = false,
  className,
  type = "button",
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant}${wide ? " ui-button--wide" : ""}${busy ? " ui-busy" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
      {...(busy ? { "aria-busy": true, "aria-disabled": true } : {})}
      onClick={guarded(busy, onClick)}
    >
      {busyContent(busy, children)}
    </button>
  );
}

// A feature's own styled button that may start slow work. While its work
// runs it shows the spinner at the same size; pass `disabled` only for
// other work that would clash.
export function BusyButton({
  busy = false,
  className,
  type = "button",
  children,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly busy?: boolean }) {
  const classes = [className, busy ? "ui-busy" : undefined]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type}
      {...(classes ? { className: classes } : {})}
      {...rest}
      {...(busy ? { "aria-busy": true, "aria-disabled": true } : {})}
      onClick={guarded(busy, onClick)}
    >
      {busyContent(busy, children)}
    </button>
  );
}

// A secondary action, such as Hint or Show me.
export function Pill({
  busy = false,
  className,
  type = "button",
  children,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly busy?: boolean }) {
  return (
    <button
      type={type}
      className={`ui-pill${busy ? " ui-busy" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
      {...(busy ? { "aria-busy": true, "aria-disabled": true } : {})}
      onClick={guarded(busy, onClick)}
    >
      {busyContent(busy, children)}
    </button>
  );
}

export function Chip({
  chip,
  onSelect,
  primary = false,
  index = 0,
  disabled = false,
  busy = false,
}: {
  readonly chip: SuggestionChip;
  readonly onSelect: (chip: SuggestionChip) => void;
  readonly primary?: boolean;
  // Its place in the row, which staggers the pop-in.
  readonly index?: number;
  // Dimmed while other work runs; busy while its own action runs.
  readonly disabled?: boolean;
  readonly busy?: boolean;
}) {
  const inert = disabled || busy;
  return (
    <button
      type="button"
      className={`ui-chip${primary ? " ui-chip--primary" : ""}${busy ? " ui-busy" : ""}`}
      style={{ "--ui-chip-index": String(index) } as CSSProperties}
      {...(inert ? { "aria-disabled": true } : {})}
      {...(busy ? { "aria-busy": true } : {})}
      onClick={() => {
        if (!inert) onSelect(chip);
      }}
    >
      {busyContent(busy, chip.label)}
    </button>
  );
}

// Suggestion chips chosen by code. A "done" chip is drawn as the primary one.
export function ChipRow({
  chips,
  onSelect,
  label = "Ask Rook",
  disabled = false,
  busyId,
}: {
  readonly chips: readonly SuggestionChip[];
  readonly onSelect: (chip: SuggestionChip) => void;
  readonly label?: string;
  // While Rook works: every chip is dimmed, and the one that started the
  // work, if any, shows the spinner.
  readonly disabled?: boolean;
  readonly busyId?: string | undefined;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="ui-chip-row" role="group" aria-label={label}>
      {chips.map((chip, index) => (
        <Chip
          key={chip.id}
          chip={chip}
          onSelect={onSelect}
          primary={chip.action.kind === "done"}
          index={index}
          disabled={disabled}
          busy={busyId === chip.id}
        />
      ))}
    </div>
  );
}

// Phones get a bottom sheet over the screen. From 720 px the same sheet is a
// centred modal over a dimmed backdrop, so it never sits in a corner.
const WIDE_SHEET = "(min-width: 720px)";

export function Sheet({
  open,
  title,
  tone = "celebrate",
  children,
  onClose,
  className,
}: {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly tone?: "celebrate" | "calm";
  readonly children: ReactNode;
  readonly onClose?: () => void;
  // A screen's own class for the sheet, since it renders outside the screen.
  readonly className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const wide = useMediaQuery(WIDE_SHEET);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("button, [href]")?.focus();
  }, [open]);
  // Rendered at the top of the page, so no screen's stacking order (an
  // isolated sky, a sticky column) can put the tab bar over it.
  return createPortal(
    <>
      <div
        className={`ui-sheet__backdrop${open ? " ui-sheet__backdrop--open" : ""}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <section
        ref={ref}
        role="dialog"
        aria-modal={wide}
        aria-hidden={!open}
        aria-labelledby={titleId}
        inert={!open}
        className={`ui-sheet ui-sheet--${tone}${open ? " ui-sheet--open" : ""}${className ? ` ${className}` : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && onClose) onClose();
        }}
      >
        <h2 id={titleId} className="ui-sheet__title">
          {title}
        </h2>
        {children}
      </section>
    </>,
    document.body,
  );
}

// A centred celebration over the dimmed screen. The board stays visible
// behind it. Focus moves into the modal; Continue is the way out.
export function Modal({
  open,
  title,
  children,
  celebrate = false,
}: {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly celebrate?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open)
      ref.current?.querySelector<HTMLElement>("button, [href]")?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="ui-modal">
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`ui-modal__card${celebrate ? " ui-modal__card--celebrate" : ""}`}
      >
        {celebrate && (
          <span className="ui-modal__sparks" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <i
                key={index}
                style={{ "--ui-spark": String(index) } as CSSProperties}
              />
            ))}
          </span>
        )}
        <h2 id={titleId} className="ui-modal__title">
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}

// Shows the counting number and gives screen readers the final text.
export function CountUp({
  value,
  format,
}: {
  readonly value: number;
  readonly format: (value: number) => string;
}) {
  const shown = useCountUp(value);
  return (
    <>
      <span aria-hidden="true">{format(Math.round(shown))}</span>
      <span className="ui-visually-hidden">{format(value)}</span>
    </>
  );
}

// Daily goal ring: done out of target, with the count in the middle. With
// countUp the ring fills from empty as it appears, as on the celebration.
export function Ring({
  done,
  target,
  size = "md",
  label,
  countUp = false,
}: {
  readonly done: number;
  readonly target: number;
  readonly size?: "sm" | "md" | "lg";
  readonly label: string;
  readonly countUp?: boolean;
}) {
  const reached = Math.min(done, target);
  const counted = useCountUp(reached);
  const shown = countUp ? counted : reached;
  const share = target > 0 ? shown / target : 0;
  return (
    <div
      className={`ui-ring ui-ring--${size}`}
      role="img"
      aria-label={label}
      style={{ "--ui-ring-share": `${String(share * 100)}%` } as CSSProperties}
    >
      <b aria-hidden="true">
        {String(Math.round(shown))}/{String(target)}
      </b>
    </div>
  );
}

export function StatTile({
  value,
  label,
}: {
  readonly value: ReactNode;
  readonly label: string;
}) {
  return (
    <div className="ui-stat-tile">
      <b>{value}</b>
      <small>{label}</small>
    </div>
  );
}

export function StatRow({ children }: { readonly children: ReactNode }) {
  return <div className="ui-stat-row">{children}</div>;
}

export function StreakChip({ days }: { readonly days: number }) {
  return (
    <span
      className={`ui-stat-chip ui-stat-chip--flame${days === 0 ? " ui-stat-chip--dim" : ""}`}
      aria-label={`${String(days)} day streak`}
    >
      <span aria-hidden="true">🔥</span>
      {days}
    </span>
  );
}

// Pops when the value grows, so a gain is visible.
export function XpChip({ xp }: { readonly xp: number }) {
  const [previous, setPrevious] = useState(xp);
  const [pop, setPop] = useState(false);
  if (xp !== previous) {
    setPrevious(xp);
    setPop(xp > previous);
  }
  return (
    <span
      className={`ui-stat-chip ui-stat-chip--xp${pop ? " ui-stat-chip--pop" : ""}`}
      aria-label={`${String(xp)} XP`}
      onAnimationEnd={() => {
        setPop(false);
      }}
    >
      <span aria-hidden="true">✦</span>
      {xp}
    </span>
  );
}

// Positions in this sitting: done ones filled, the current one outlined.
export function ProgressDots({
  total,
  done,
}: {
  readonly total: number;
  readonly done: number;
}) {
  return (
    <div
      className="ui-progress-dots"
      role="progressbar"
      aria-label="Positions"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      {Array.from({ length: total }, (_, index) => (
        <i
          key={index}
          className={
            index < done
              ? "ui-progress-dots__dot ui-progress-dots__dot--done"
              : index === done
                ? "ui-progress-dots__dot ui-progress-dots__dot--current"
                : "ui-progress-dots__dot"
          }
        />
      ))}
    </div>
  );
}

export function Avatar({
  name,
  imageUrl,
  badgeUrl,
  size = "sm",
  onClick,
}: {
  readonly name: string;
  readonly imageUrl?: string | undefined;
  readonly badgeUrl?: string | undefined;
  readonly size?: "sm" | "lg";
  readonly onClick?: () => void;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const face = (
    <>
      {imageUrl ? (
        <img className="ui-avatar__image" src={imageUrl} alt="" />
      ) : (
        <span className="ui-avatar__initial" aria-hidden="true">
          {initial}
        </span>
      )}
      {badgeUrl && <img className="ui-avatar__badge" src={badgeUrl} alt="" />}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`ui-avatar ui-avatar--${size}`}
      aria-label="Profile"
      onClick={onClick}
    >
      {face}
    </button>
  ) : (
    <span
      className={`ui-avatar ui-avatar--${size}`}
      role="img"
      aria-label={name}
    >
      {face}
    </span>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="ui-toggle"
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className="ui-toggle__label">{label}</span>
      <span className="ui-toggle__track" aria-hidden="true">
        <span className="ui-toggle__thumb" />
      </span>
    </button>
  );
}
