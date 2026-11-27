import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RecapScreen, type RecapScreenProps } from "./RecapScreen";

afterEach(cleanup);

const props: RecapScreenProps = {
  recap: { ideasSpotted: 1, streak: 4, xpToday: 35, newIdeas: ["fork"] },
  ideas: [
    { unitId: "mate", level: 2 },
    { unitId: "fork", level: 1 },
  ],
  unitTitles: new Map([
    ["fork", "Fork"],
    ["mate", "Back-rank mate"],
  ]),
  totalUnits: 21,
  rookLine: "You found a fork in your own game.",
  onPlayGame: () => undefined,
  onNextMoment: () => undefined,
  onSeeSky: () => undefined,
};

test("shows today's progress and puts newly collected cards before existing and locked cards", () => {
  const { container } = render(<RecapScreen {...props} />);

  expect(
    screen.getByRole("heading", { name: "From your games today" }),
  ).toBeInTheDocument();
  expect(screen.getByText(props.rookLine)).toBeInTheDocument();
  expect(container.querySelector('[data-mood="happy"]')).toBeInTheDocument();
  expect(screen.getByText("idea spotted").parentElement).toHaveTextContent(
    "1idea spotted",
  );
  expect(screen.getByText("day streak").parentElement).toHaveTextContent(
    "4day streak",
  );
  expect(screen.getByText("XP").parentElement).toHaveTextContent("+35XP");
  expect(container.querySelector(".ui-button--primary")).toBe(
    screen.getByRole("button", { name: "Play a game" }),
  );

  const cards = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(cards).toHaveLength(4);
  expect(cards[0]).toHaveTextContent("ForkLv 1 · New");
  expect(cards[1]).toHaveTextContent("Back-rank mateLv 2");
  expect(screen.getAllByText("Locked")).toHaveLength(2);
});

test("shows zero progress and only as many locked placeholders as there are ideas", () => {
  render(
    <RecapScreen
      {...props}
      totalUnits={2}
      ideas={[]}
      recap={{ ideasSpotted: 0, streak: 0, xpToday: 0, newIdeas: [] }}
    />,
  );
  expect(screen.getByText("ideas spotted").parentElement).toHaveTextContent(
    "0ideas spotted",
  );
  expect(screen.getByText("XP").parentElement).toHaveTextContent("0XP");
  expect(screen.getAllByText("Locked")).toHaveLength(2);
  expect(screen.queryByText("Fork")).not.toBeInTheDocument();
});

test("keeps the strip within four cards and omits New for a returning collection", () => {
  render(
    <RecapScreen
      {...props}
      recap={{ ...props.recap, newIdeas: [] }}
      ideas={[
        ...props.ideas,
        { unitId: "pin", level: 1 },
        { unitId: "trade", level: 1 },
        { unitId: "race", level: 1 },
      ]}
    />,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.queryByText(/new/i)).not.toBeInTheDocument();
  expect(screen.queryByText("Locked")).not.toBeInTheDocument();
});

test("dispatches all three actions and leaves navigation to the caller", () => {
  const onPlayGame = vi.fn();
  const onNextMoment = vi.fn();
  const onSeeSky = vi.fn();
  render(
    <RecapScreen
      {...props}
      onPlayGame={onPlayGame}
      onNextMoment={onNextMoment}
      onSeeSky={onSeeSky}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Play a game" }));
  fireEvent.click(screen.getByRole("button", { name: "Next moment" }));
  fireEvent.click(screen.getByRole("button", { name: "See your sky" }));
  expect(onPlayGame).toHaveBeenCalledOnce();
  expect(onNextMoment).toHaveBeenCalledOnce();
  expect(onSeeSky).toHaveBeenCalledOnce();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
