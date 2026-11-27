import "./board-hint-controls.css";

export type HintLevel = 0 | 1 | 2 | 3;

export function HintButton({
  level,
  levels = 2,
  disabled,
  onClick,
}: {
  readonly level: HintLevel;
  // How many hints there are before the button reports that hints are on.
  readonly levels?: 2 | 3;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      className="board-hint-button board-action--quiet"
      type="button"
      disabled={disabled === true || level === levels}
      onClick={onClick}
    >
      {level === 0 ? "Hint" : level < levels ? "More hint" : "Hints on"}
    </button>
  );
}

export function NextMovePill({
  onClick,
  disabled,
  label = "Next move",
}: {
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly label?: string;
}) {
  return (
    <button
      className="board-next-move"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="board-next-move__icon" aria-hidden="true" />
      {label}
    </button>
  );
}
