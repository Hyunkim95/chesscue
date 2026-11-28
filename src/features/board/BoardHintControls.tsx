import { BusyButton } from "../../shared/ui/primitives";
import "./board-hint-controls.css";

export type HintLevel = 0 | 1 | 2 | 3;

export function HintButton({
  level,
  levels = 2,
  disabled,
  busy = false,
  onClick,
}: {
  readonly level: HintLevel;
  // How many hints there are before the button reports that hints are on.
  readonly levels?: 2 | 3;
  readonly disabled?: boolean;
  // While the hint it asked for is checked: the spinner.
  readonly busy?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <BusyButton
      className="board-hint-button board-action--quiet"
      busy={busy}
      disabled={!busy && (disabled === true || level === levels)}
      onClick={onClick}
    >
      {level === 0 ? "Hint" : level < levels ? "More hint" : "Hints on"}
    </BusyButton>
  );
}

export function NextMovePill({
  onClick,
  disabled,
  busy = false,
  label = "Next move",
}: {
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly label?: string;
}) {
  return (
    <BusyButton
      className="board-next-move"
      busy={busy}
      disabled={!busy && disabled}
      onClick={onClick}
    >
      <span className="board-next-move__icon" aria-hidden="true" />
      {label}
    </BusyButton>
  );
}
