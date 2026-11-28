import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { Chip as SuggestionChip } from "../../domain/session/types";
import { Button, ChipRow, Pill } from "./primitives";

afterEach(cleanup);

it("keeps a busy button's label for its size, shows a spinner and ignores taps", () => {
  const onClick = vi.fn();
  render(
    <Button busy onClick={onClick}>
      Show me
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Show me" });
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button.querySelector(".ui-busy__spinner")).not.toBeNull();
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});

it("leaves an idle pill alone", () => {
  const onClick = vi.fn();
  render(<Pill onClick={onClick}>Hint</Pill>);
  const pill = screen.getByRole("button", { name: "Hint" });
  expect(pill).not.toHaveAttribute("aria-busy");
  fireEvent.click(pill);
  expect(onClick).toHaveBeenCalledTimes(1);
});

const chips: SuggestionChip[] = [
  { id: "why", label: "Why does it work?", action: { kind: "show-line" } },
  { id: "done", label: "Done", action: { kind: "done" } },
];

it("dims every chip while Rook works and spins the one that started it", () => {
  const onSelect = vi.fn();
  render(<ChipRow chips={chips} onSelect={onSelect} disabled busyId="why" />);
  const why = screen.getByRole("button", { name: "Why does it work?" });
  const done = screen.getByRole("button", { name: "Done" });
  expect(why).toHaveAttribute("aria-busy", "true");
  expect(done).toHaveAttribute("aria-disabled", "true");
  expect(done).not.toHaveAttribute("aria-busy");
  fireEvent.click(why);
  fireEvent.click(done);
  expect(onSelect).not.toHaveBeenCalled();
});
