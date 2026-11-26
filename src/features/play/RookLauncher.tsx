import {
  useId,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";

interface Position {
  readonly x: number;
  readonly y: number;
}

const INSET = 12;
const WIDTH = 108;
const HEIGHT = 56;
const home: Position = { x: 1, y: 1 };
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const directions: Partial<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-16, 0],
  ArrowRight: [16, 0],
  ArrowUp: [0, -16],
  ArrowDown: [0, 16],
};

function readPosition(key: string): Position {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      typeof value === "object" &&
      value !== null &&
      "x" in value &&
      "y" in value &&
      typeof value.x === "number" &&
      Number.isFinite(value.x) &&
      typeof value.y === "number" &&
      Number.isFinite(value.y)
    )
      return { x: clamp(value.x), y: clamp(value.y) };
  } catch {
    /* Rook still appears in the default corner. */
  }
  return home;
}

export function RookLauncher({
  buttonRef,
  open,
  unread,
  speech,
  storageKey,
  onToggle,
}: {
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly open: boolean;
  readonly unread: boolean;
  readonly speech: string;
  readonly storageKey: string;
  readonly onToggle: () => void;
}) {
  const [position, setPosition] = useState(() => readPosition(storageKey));
  const current = useRef(position);
  const hint = useId();
  const drag = useRef<{
    pointer: number;
    startX: number;
    startY: number;
    from: Position;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  function move(from: Position, x: number, y: number) {
    const next = {
      x: clamp(from.x + x / Math.max(1, window.innerWidth - WIDTH - 2 * INSET)),
      y: clamp(
        from.y + y / Math.max(1, window.innerHeight - HEIGHT - 2 * INSET),
      ),
    };
    current.current = next;
    setPosition(next);
  }

  function remember() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(current.current));
    } catch {
      /* The launcher still moves for this session. */
    }
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    if (suppressClick.current) remember();
  }

  return (
    <>
      <span className="rook-launcher-hint" id={hint}>
        Drag or use the arrow keys to move Rook. Press Enter to open chat.
      </span>
      <div
        className="rook-float"
        data-open={open}
        data-speech-x={position.x >= 0.5 ? "right" : "left"}
        data-speech-y={position.y >= 0.35 ? "above" : "below"}
        style={{
          width: WIDTH,
          height: HEIGHT,
          left: `calc(${String(INSET)}px + ${String(position.x)} * (100% - ${String(WIDTH + 2 * INSET)}px))`,
          top: `calc(${String(INSET)}px + ${String(position.y)} * (100% - ${String(HEIGHT + 2 * INSET)}px))`,
        }}
      >
        {open && (
          <span className="rook-float__speech" aria-hidden="true">
            {speech}
          </span>
        )}
        <button
          ref={buttonRef}
          className="rook-toggle"
          type="button"
          aria-label={unread ? "Rook, new learning moment" : "Rook"}
          aria-expanded={open}
          aria-controls="active-rook-chat"
          aria-describedby={hint}
          title="Drag Rook to move"
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            suppressClick.current = false;
            drag.current = {
              pointer: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              from: current.current,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (active?.pointer !== event.pointerId) return;
            const x = event.clientX - active.startX;
            const y = event.clientY - active.startY;
            if (!active.moved && Math.hypot(x, y) < 5) return;
            active.moved = true;
            move(active.from, x, y);
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={(event) => {
            const direction = directions[event.key];
            if (direction === undefined) return;
            event.preventDefault();
            const [x, y] = direction;
            move(current.current, x, y);
            remember();
          }}
          onClick={(event) => {
            if (event.detail === 0 || !suppressClick.current) onToggle();
            suppressClick.current = false;
          }}
        >
          Rook
          {unread && <span className="rook-toggle__dot" aria-hidden="true" />}
        </button>
      </div>
    </>
  );
}
