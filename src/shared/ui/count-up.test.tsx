import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { CountUp, Ring } from "./primitives";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

it("counts XP up from zero and gives screen readers the final value", async () => {
  preferReducedMotion(false);
  render(<CountUp value={25} format={(n) => `+${String(n)} XP`} />);
  expect(screen.getByText("+0 XP")).toHaveAttribute("aria-hidden", "true");
  expect(
    screen.getByText("+25 XP", { selector: ".ui-visually-hidden" }),
  ).toBeInTheDocument();
  await waitFor(() => {
    expect(
      screen.getByText("+25 XP", { selector: "[aria-hidden]" }),
    ).toBeInTheDocument();
  });
});

it("shows the final value at once when the player asked for less motion", () => {
  preferReducedMotion(true);
  render(<Ring countUp done={2} target={3} label="Today: 2 of 3 positions" />);
  expect(
    screen.getByRole("img", { name: "Today: 2 of 3 positions" }),
  ).toHaveTextContent("2/3");
});
