import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SkyScreen, type SkyScreenProps } from "./SkyScreen";

afterEach(cleanup);

const played = { kind: "game", gameId: "match", ply: 9 } as const;
const spotted = { kind: "puzzle", puzzleId: "practice" } as const;

const props: SkyScreenProps = {
  stages: [
    {
      stageId: "play-safely",
      title: "Play safely",
      units: [
        { unitId: "fork", title: "Fork" },
        { unitId: "mate", title: "Back-rank mate" },
        { unitId: "pin", title: "Pin" },
        { unitId: "race", title: "Pawn race" },
      ],
    },
  ],
  stars: new Map([
    ["fork", "spotted"],
    ["mate", "shining"],
    ["pin", "missed"],
  ]),
  newestStar: "fork",
  history: () => [],
  onLook: () => undefined,
};

test("names all four states, counts lit stars, and highlights the newest star", () => {
  const { container } = render(<SkyScreen {...props} />);

  expect(screen.getByRole("heading", { name: "Your sky" })).toBeInTheDocument();
  expect(screen.getByText("Play safely · 2/4")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Fork, spotted" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Back-rank mate, shining" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Pin, missed" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Pawn race, not seen" }),
  ).toBeInTheDocument();
  expect(container.querySelectorAll(".sky-edge--lit")).toHaveLength(1);
  expect(container.querySelector(".sky-star--newest")).toContainElement(
    screen.getByRole("button", { name: "Fork, spotted" }),
  );
});

test("opens the sheet with ordered moments and passes the selected source to Look", () => {
  const history = vi.fn<SkyScreenProps["history"]>(() => {
    expect(
      screen.queryByRole("dialog", { name: "Back-rank mate" }),
    ).toBeInTheDocument();
    return [
      { kind: "played", at: "2026-11-27T12:00:00Z", source: played },
      { kind: "spotted", at: "2026-11-26T12:00:00Z", source: spotted },
      { kind: "missed", at: "2026-11-25T12:00:00Z", source: played },
    ];
  });
  const onLook = vi.fn();
  render(<SkyScreen {...props} history={history} onLook={onLook} />);

  fireEvent.click(
    screen.getByRole("button", { name: "Back-rank mate, shining" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Back-rank mate" });
  expect(within(dialog).getByText("Shining")).toBeInTheDocument();
  expect(history).toHaveBeenCalledWith("mate");
  const rows = within(dialog).getAllByRole("listitem");
  expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual([
    "Played it",
    "Spotted",
    "Missed",
  ]);
  fireEvent.click(
    within(dialog).getByRole("button", { name: /look at moment 2, spotted/i }),
  );
  expect(onLook).toHaveBeenCalledOnce();
  expect(onLook).toHaveBeenCalledWith(spotted);
  expect(dialog).not.toBeInTheDocument();
});

test("shows the unlit sky and restores keyboard focus after Escape", () => {
  render(
    <SkyScreen
      {...props}
      stars={new Map([["race", "not-seen"]])}
      newestStar={undefined}
    />,
  );

  expect(
    screen.getByText("Spot your first idea and the first star appears here."),
  ).toBeInTheDocument();
  expect(screen.getByText("Play safely · 0/4")).toBeInTheDocument();
  const star = screen.getByRole("button", { name: "Pawn race, not seen" });
  fireEvent.click(star);
  const dialog = screen.getByRole("dialog", { name: "Pawn race" });
  const close = within(dialog).getByRole("button", { name: "Close" });
  expect(close).toHaveFocus();
  expect(
    within(dialog).getByText("No moments for this idea yet."),
  ).toBeInTheDocument();
  fireEvent.keyDown(close, { key: "Escape" });
  expect(dialog).not.toBeInTheDocument();
  expect(star).toHaveFocus();
});

test("links the game summary to the stars and opens a recommended practice position", () => {
  const retry = { kind: "game", gameId: "earlier-game", ply: 7 } as const;
  const onLook = vi.fn();
  render(
    <SkyScreen
      {...props}
      gameReview={{
        strength: { unitId: "mate", games: 1 },
        focus: { unitId: "pin", games: 3, retry },
      }}
      followUp={spotted}
      onLook={onLook}
    />,
  );

  const review = within(
    screen.getByRole("region", { name: "From your games" }),
  );
  const strength = review.getByRole("button", {
    name: /What went well.*Back-rank mate.*Played in 1 game/,
  });
  fireEvent.click(strength);
  const strengthSheet = within(
    screen.getByRole("dialog", { name: "Back-rank mate" }),
  );
  expect(
    strengthSheet.queryByRole("button", { name: "Try a missed position" }),
  ).not.toBeInTheDocument();
  fireEvent.click(strengthSheet.getByRole("button", { name: "Close" }));
  expect(strength).toHaveFocus();

  const focus = review.getByRole("button", {
    name: /Next to practise.*Pin.*Missed in 3 games/,
  });
  fireEvent.click(focus);
  const practice = within(screen.getByRole("dialog", { name: "Pin" }));
  fireEvent.click(
    practice.getByRole("button", { name: "Try a missed position" }),
  );
  expect(onLook).toHaveBeenLastCalledWith(retry);
  fireEvent.click(focus);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Pin" })).getByRole("button", {
      name: "Try a similar puzzle",
    }),
  );
  expect(onLook).toHaveBeenLastCalledWith(spotted);
});

test("keeps the remaining moments available without rendering all rows at once", () => {
  const source = played;
  render(
    <SkyScreen
      {...props}
      history={() =>
        Array.from({ length: 21 }, () => ({
          kind: "played",
          at: "2026-11-27T12:00:00Z",
          source,
        }))
      }
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Back-rank mate, shining" }),
  );
  const dialog = within(screen.getByRole("dialog", { name: "Back-rank mate" }));
  expect(
    dialog.getAllByRole("button", { name: /look at moment/i }),
  ).toHaveLength(20);
  fireEvent.click(dialog.getByRole("button", { name: "Show more moments" }));
  expect(
    dialog.getAllByRole("button", { name: /look at moment/i }),
  ).toHaveLength(21);
  expect(dialog.getByRole("button", { name: "Close" })).toHaveFocus();
});

test.each([
  ["Fork, spotted", /real game to make this star shine/i],
  ["Pin, missed", /try this idea again in a moment/i],
])("gives the next step for %s", (name, next) => {
  render(<SkyScreen {...props} />);
  fireEvent.click(screen.getByRole("button", { name }));
  expect(
    within(screen.getByRole("dialog")).getByText(next),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
