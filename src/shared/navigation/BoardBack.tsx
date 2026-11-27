import { useContext } from "react";
import { createPortal } from "react-dom";

import { BoardBackSlot } from "./board-back-slot";

interface BackAction {
  readonly label: string;
  readonly onBack: () => void;
}

export function BoardBackControl({ label, onBack }: BackAction) {
  return (
    <button
      className="board-back"
      type="button"
      aria-label={label}
      title={label}
      onClick={onBack}
    >
      <span aria-hidden="true">←</span>
    </button>
  );
}

export function BoardBack(action: BackAction) {
  const slot = useContext(BoardBackSlot);
  return slot ? (
    createPortal(<BoardBackControl {...action} />, slot)
  ) : (
    <button className="study-back" type="button" onClick={action.onBack}>
      {action.label}
    </button>
  );
}
