import { expect, test, vi } from "vitest";

test("adds the launcher when the Chess.com Analysis page renders a completed score", async () => {
  history.replaceState(null, "", "/analysis/game/live/171700487346/analysis");
  document.body.innerHTML = `<div class="board-layout-sidebar">
    <div data-test-element="user-tagline-username">Mira</div>
    <div class="main-line-row move-list-row result-row"><span class="game-result">*</span></div>
  </div>`;
  const result = document.querySelector<HTMLElement>(".game-result");
  if (!result) throw new Error("Missing Chess.com result fixture.");
  const bounds = new DOMRect(0, 0, 28, 20);
  vi.spyOn(result, "getClientRects").mockReturnValue(
    Object.assign([bounds], {
      item: (index: number) => (index === 0 ? bounds : null),
    }),
  );

  try {
    await import("./chess-com-page");
    const launcher = () => document.querySelector("#chesscue-chesscom-explore");
    expect(launcher()).toBeNull();
    result.textContent = "0-1";
    await vi.waitFor(() => {
      expect(launcher()?.textContent).toBe("Explore with Rook");
    });
    result.textContent = "*";
    await vi.waitFor(() => {
      expect(launcher()).toBeNull();
    });
  } finally {
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
  }
});

test.each([
  "/play/online",
  "/game/171700487346",
  "/game/computer/171700487346",
])(
  "restores the launcher on a refreshed %s page with a final score and sidebar review link",
  async (pagePath) => {
    vi.resetModules();
    document.body.replaceWith(document.createElement("body"));
    history.replaceState(null, "", pagePath);
    document.body.innerHTML = `<div class="board-layout-sidebar">
    <div data-test-element="user-tagline-username">Mira</div>
    <div class="result-row"><span class="game-result">0-1</span></div>
    <div class="game-review-buttons-component">
      <a href="/analysis${pagePath.includes("/computer/") ? pagePath : "/game/live/171700487346"}?tab=review">Game Review</a>
    </div>
  </div>`;
    const bounds = new DOMRect(0, 0, 28, 20);
    const visible = vi
      .spyOn(HTMLElement.prototype, "getClientRects")
      .mockReturnValue(
        Object.assign([bounds], {
          item: (index: number) => (index === 0 ? bounds : null),
        }),
      );

    vi.stubGlobal("chrome", {
      runtime: { onMessage: { addListener: vi.fn() } },
    });
    try {
      await import("./chess-com-page");
      const launcher = () =>
        document.querySelector("#chesscue-chesscom-explore");
      expect(launcher()?.textContent).toBe("Explore with Rook");
      const reviewLink = document.querySelector(
        ".game-review-buttons-component a",
      );
      const href = reviewLink?.getAttribute("href");
      if (!reviewLink || !href)
        throw new Error("Missing Chess.com review link fixture.");
      if (pagePath === "/play/online") {
        reviewLink.removeAttribute("href");
      } else if (!pagePath.includes("/computer/")) {
        reviewLink.setAttribute("href", "/analysis/game/live/123?tab=review");
      }
      if (!pagePath.includes("/computer/")) {
        await vi.waitFor(() => {
          expect(launcher()).toBeNull();
        });
      }
      reviewLink.setAttribute("href", href);
      await vi.waitFor(() => {
        expect(launcher()?.textContent).toBe("Explore with Rook");
      });
      const result = document.querySelector(".game-result");
      if (!result) throw new Error("Missing Chess.com result fixture.");
      result.textContent = "*";
      await vi.waitFor(() => {
        expect(launcher()).toBeNull();
      });
    } finally {
      visible.mockRestore();
      vi.unstubAllGlobals();
      document.body.replaceChildren();
      history.replaceState(null, "", "/");
    }
  },
);

test.each([
  "/analysis/game/live/171700487346/review",
  "/game/171700487346",
  "/game/computer/171700487346",
])("opens the matching game from %s in the side panel", async (pagePath) => {
  vi.resetModules();
  const addMessageListener =
    vi.fn<
      (
        listener: (
          message: object,
          sender: { tab: { id: number }; frameId: number; url: string },
        ) => void,
      ) => void
    >();
  const setOptions = vi.fn().mockResolvedValue(undefined);
  const open = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: addMessageListener },
    },
    sidePanel: { setOptions, open },
  });

  try {
    await import("./action");
    const listener = addMessageListener.mock.calls[0]?.[0];
    if (!listener) throw new Error("Missing side panel message handler.");
    const kind = pagePath.includes("/computer/") ? "computer" : "live";
    const message = {
      type: "chesscue:chesscom-practise",
      game: `/game/${kind}/171700487346`,
      player: "Mira",
    };
    const sender = {
      tab: { id: 42 },
      frameId: 0,
      url: "https://www.chess.com" + pagePath,
    };

    listener({ ...message, game: "/game/live/123" }, sender);
    expect(open).not.toHaveBeenCalled();

    listener(message, sender);
    expect(setOptions).toHaveBeenCalledExactlyOnceWith({
      tabId: 42,
      path: `index.html?panel=1#chesscom/${kind}/171700487346/mira${kind === "computer" ? "/42" : ""}`,
    });
    expect(open).toHaveBeenCalledExactlyOnceWith({ tabId: 42 });
  } finally {
    vi.unstubAllGlobals();
  }
});
