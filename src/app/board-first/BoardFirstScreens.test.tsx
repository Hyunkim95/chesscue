import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { buildPlayingSnapshot } from "../../domain/curriculum/playing-snapshot";
import {
  forkObservation,
  mateDefenceObservation,
} from "../../domain/progress/test-fixtures";
import { guestHistory } from "../../infrastructure/persistence/player-history";
import { ok } from "../../shared/result/result";
import { BoardFirstScreens } from "./BoardFirstScreens";
import type { BoardFirstView } from "./flag";

afterEach(cleanup);

const pendingScreens: readonly (readonly [BoardFirstView, string])[] = [
  ["today", "Finding a moment from your games…"],
  ["moment", "Opening your position…"],
  ["sky", "Opening your sky…"],
  ["profile", "Opening your profile…"],
  ["recap", "Preparing your recap…"],
];

it.each(pendingScreens)(
  "names the pending destination on %s",
  (view, label) => {
    const html = renderToStaticMarkup(
      <BoardFirstScreens
        view={view}
        navigate={vi.fn()}
        history={guestHistory}
        snapshot={{ status: "checking" }}
        ratings={[]}
        playerName="You"
        signedIn={false}
        onOpenAccount={vi.fn()}
        onPlay={vi.fn()}
        onGames={vi.fn()}
        onImport={vi.fn()}
        onImportFrom={vi.fn()}
      />,
    );
    expect(html).toContain(label);
  },
);

it("renders a linked installed puzzle without waiting for game history or a search", () => {
  const originalUrl = window.location.href;
  window.history.replaceState(null, "", "#moment/puzzle%3A0HfcA");
  try {
    render(
      <BoardFirstScreens
        view="moment"
        navigate={vi.fn()}
        history={guestHistory}
        snapshot={{ status: "checking" }}
        ratings={[]}
        playerName="You"
        signedIn={false}
        onOpenAccount={vi.fn()}
        onPlay={vi.fn()}
        onGames={vi.fn()}
        onImport={vi.fn()}
        onImportFrom={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /White to move/ }),
    ).toBeVisible();
    expect(screen.getByRole("grid")).toBeVisible();
    expect(screen.queryByText("Opening your position…")).toBeNull();
  } finally {
    window.history.replaceState(null, "", originalUrl);
  }
});

it("shows checked games in Sky and launches a saved miss as a moment", async () => {
  const moves = [forkObservation("retry"), mateDefenceObservation()];
  const navigate = vi.fn();
  const listAttempts = vi
    .spyOn(guestHistory.moments, "listAll")
    .mockResolvedValue(ok([]));
  try {
    render(
      <BoardFirstScreens
        view="sky"
        navigate={navigate}
        history={guestHistory}
        snapshot={{
          status: "ready",
          games: moves.map(({ game }) => game),
          moves,
          checked: 2,
          failed: 0,
          total: 2,
          plan: buildPlayingSnapshot(moves),
        }}
        ratings={[]}
        playerName="You"
        signedIn={false}
        onOpenAccount={vi.fn()}
        onPlay={vi.fn()}
        onGames={vi.fn()}
        onImport={vi.fn()}
        onImportFrom={vi.fn()}
      />,
    );
    const review = within(
      await screen.findByRole("region", { name: "From your games" }),
    );
    expect(
      review.getByRole("button", { name: /What went well.*Played in 1 game/ }),
    ).toBeVisible();
    fireEvent.click(
      review.getByRole("button", {
        name: /Next to practise.*Missed in 1 game/,
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Try a missed position",
      }),
    );
    expect(navigate).toHaveBeenCalledWith("moment", "#moment/fork-game%3A1");
  } finally {
    listAttempts.mockRestore();
  }
});
