import { useEffect, useRef, useState } from "react";

import { tokens } from "./tokens";

// Whether the player asked for less motion. Shared animations that run in
// script check this before they move anything; CSS uses the media query.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const COUNT_MS = Number.parseFloat(tokens.motion.count);

// A number that counts up from zero when it first shows, and from its shown
// value whenever it changes. Reduced motion shows the value at once.
export function useCountUp(value: number): number {
  const [shown, setShown] = useState(() =>
    prefersReducedMotion() ? value : 0,
  );
  const current = useRef(shown);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const duration = prefersReducedMotion() ? 0 : COUNT_MS;
    let started: number | undefined;
    let frame = 0;
    const step = (now: number) => {
      started ??= now;
      const progress =
        duration > 0 ? Math.min(1, (now - started) / duration) : 1;
      const eased = 1 - (1 - progress) ** 3;
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return shown;
}
