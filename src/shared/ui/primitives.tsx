import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { Chip as SuggestionChip } from "../../domain/session/types";
import "./ui.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "primary" | "ghost";
  readonly wide?: boolean;
};

// The chunky, pressable action. One primary per view (§17.3 rule 5).
export function Button({
  variant = "primary",
  wide = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant}${wide ? " ui-button--wide" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

// A secondary action, such as Hint or Show me.
export function Pill({
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`ui-pill${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

export function Chip({
  chip,
  onSelect,
  primary = false,
}: {
  readonly chip: SuggestionChip;
  readonly onSelect: (chip: SuggestionChip) => void;
  readonly primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ui-chip${primary ? " ui-chip--primary" : ""}`}
      onClick={() => {
        onSelect(chip);
      }}
    >
      {chip.label}
    </button>
  );
}

// Suggestion chips chosen by code. A "done" chip is drawn as the primary one.
export function ChipRow({
  chips,
  onSelect,
  label = "Ask Rook",
}: {
  readonly chips: readonly SuggestionChip[];
  readonly onSelect: (chip: SuggestionChip) => void;
  readonly label?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="ui-chip-row" role="group" aria-label={label}>
      {chips.map((chip) => (
        <Chip
          key={chip.id}
          chip={chip}
          onSelect={onSelect}
          primary={chip.action.kind === "done"}
        />
      ))}
    </div>
  );
}

// A bottom sheet inside the current screen, such as the celebration.
export function Sheet({
  open,
  title,
  tone = "celebrate",
  children,
  onClose,
}: {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly tone?: "celebrate" | "calm";
  readonly children: ReactNode;
  readonly onClose?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("button, [href]")?.focus();
  }, [open]);
  return (
    <section
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-hidden={!open}
      aria-labelledby="ui-sheet-title"
      inert={!open}
      className={`ui-sheet ui-sheet--${tone}${open ? " ui-sheet--open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) onClose();
      }}
    >
      <h2 id="ui-sheet-title" className="ui-sheet__title">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Daily goal ring: done out of target, with the count in the middle.
export function Ring({
  done,
  target,
  size = "md",
  label,
}: {
  readonly done: number;
  readonly target: number;
  readonly size?: "sm" | "md" | "lg";
  readonly label: string;
}) {
  const share = target > 0 ? Math.min(done, target) / target : 0;
  return (
    <div
      className={`ui-ring ui-ring--${size}`}
      role="img"
      aria-label={label}
      style={{ "--ui-ring-share": `${String(share * 100)}%` } as CSSProperties}
    >
      <b aria-hidden="true">
        {String(Math.min(done, target))}/{String(target)}
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
