// The rendered result controls availability for all Chess.com games.
let enabledGame: { page: string; game: string; player: string } | null = null;

const computerPath = /^\/game\/computer\/\d{1,18}\/?$/;
const analysisPath = /^\/analysis(\/game\/(?:live|daily)\/\d{1,18})(?:\/|$)/;
const usernameSelector = '[data-test-element="user-tagline-username"]';
const reviewLinkSelector =
  'a[href^="/analysis/game/"], a[href^="https://www.chess.com/analysis/game/"]';

function refreshChessComButton() {
  const page = location.pathname;
  const result = document.querySelector<HTMLElement>(
    ".game-over-modal-title-component",
  );
  const modalFinished =
    result !== null &&
    result.getClientRects().length > 0 &&
    (result.closest(
      ".game-over-modal-header-blackWon, .game-over-modal-header-whiteWon, .game-over-modal-header-draw",
    ) !== null ||
      /^(white won|black won|you won|you lost|draw|game drawn|1-0|0-1|½-½|1\/2-1\/2)$/i.test(
        result.textContent.trim(),
      ));
  const sidebar = document.querySelector<HTMLElement>(".board-layout-sidebar");
  const score = document.querySelector<HTMLElement>(".result-row .game-result");
  const scoreFinished =
    !!score?.getClientRects().length &&
    /^(1-0|0-1|½-½|1\/2-1\/2)$/.test(
      score.textContent.trim().replace(/[–−]/g, "-"),
    );
  const finished = modalFinished || scoreFinished;
  const actions = document.querySelector<HTMLElement>(
    ".game-over-modal-shell-buttons",
  );
  const directGame = /^\/game\/(live|daily)\/\d{1,18}\/?$/.test(page)
    ? page
    : null;
  const computerGame = computerPath.test(page) ? page.replace(/\/$/, "") : null;
  const modalLink = modalFinished
    ? actions?.querySelector<HTMLAnchorElement>(reviewLinkSelector)
    : null;
  const sidebarLink =
    scoreFinished && sidebar?.contains(score)
      ? sidebar
          .querySelector(".game-review-buttons-component")
          ?.querySelector<HTMLAnchorElement>(reviewLinkSelector)
      : null;
  const analysisGame = analysisPath.exec(page)?.[1];
  const modalGame = modalLink
    ? analysisPath.exec(modalLink.pathname)?.[1]
    : undefined;
  const sidebarGame = sidebarLink?.getClientRects().length
    ? analysisPath.exec(sidebarLink.pathname)?.[1]
    : undefined;
  const shortGameId = /^\/game\/(\d{1,18})\/?$/.exec(page)?.[1];
  const onlinePlay = /^\/play\/online\/?$/.test(page);
  const linkedGame = [modalGame, sidebarGame].find(
    (candidate) =>
      candidate &&
      (onlinePlay || (shortGameId && candidate.endsWith(`/${shortGameId}`))),
  );
  const game = directGame ?? computerGame ?? analysisGame ?? linkedGame;
  if (
    enabledGame?.page !== page ||
    enabledGame.game !== game ||
    (!directGame && !finished)
  ) {
    enabledGame = null;
  }
  if (finished && game && !enabledGame) {
    const facing = computerGame
      ? document
          .querySelector("#board-layout-player-bottom, #player-bottom")
          ?.querySelector(usernameSelector)
          ?.textContent.trim()
      : undefined;
    const player = [
      facing,
      ...Array.from(document.querySelectorAll(usernameSelector), (element) =>
        element.textContent.trim(),
      ),
    ].find((name) => name && /^[a-z0-9_-]{2,30}$/i.test(name));
    if (player) enabledGame = { page, game, player };
  }

  const existing = document.getElementById("chesscue-chesscom-explore");
  const target =
    modalFinished && actions?.getClientRects().length ? actions : sidebar;
  if (!enabledGame || !target) {
    existing?.remove();
    return;
  }
  if (existing?.parentElement === target) return;
  existing?.remove();
  const button = document.createElement("button");
  button.id = "chesscue-chesscom-explore";
  button.type = "button";
  button.textContent = "Explore with Rook";
  Object.assign(button.style, {
    display: "block",
    minHeight: "44px",
    padding: "8px 16px",
    margin: "8px auto",
    background: "#182f26",
    color: "#f9efda",
    border: "1px solid #8cc6aa",
    borderRadius: "6px",
    font: "600 15px system-ui, sans-serif",
    cursor: "pointer",
  });
  button.addEventListener("click", (event) => {
    if (!event.isTrusted || enabledGame?.page !== location.pathname) return;
    void chrome.runtime
      .sendMessage({
        type: "chesscue:chesscom-practise",
        game: enabledGame.game,
        player: enabledGame.player,
      })
      .catch(() => undefined);
  });
  target.append(button);
}

refreshChessComButton();
new MutationObserver(refreshChessComButton).observe(document.body, {
  attributeFilter: ["href", "hidden"],
  characterData: true,
  childList: true,
  subtree: true,
});

function visiblePgnTab() {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "dialog[open] button.cc-tab-item-component",
    ),
  ).find((button) => button.textContent.trim() === "PGN");
}

async function readComputerGamePgn(game: string) {
  const existingDialog = visiblePgnTab()?.closest("dialog");
  const share = document.querySelector<HTMLButtonElement>(
    '.game-icons-container-component button[aria-label="Share"]',
  );
  if (!existingDialog && !share) return null;
  if (!existingDialog) share?.click();

  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (enabledGame?.page !== location.pathname || enabledGame.game !== game)
        return null;
      const tab = visiblePgnTab();
      const input = tab
        ?.closest("dialog")
        ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="PGN"]');
      if (input?.value.trim()) return input.value;
      if (tab && !tab.classList.contains("cc-tab-item-active")) tab.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    return null;
  } finally {
    if (!existingDialog) {
      visiblePgnTab()
        ?.closest("dialog")
        ?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
        ?.click();
    }
  }
}

if (computerPath.test(location.pathname)) {
  let pending: Promise<string | null> | undefined;
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== "chesscue:computer-game-pgn" ||
      !("id" in message) ||
      typeof message.id !== "string"
    )
      return;
    const game = `/game/computer/${message.id}`;
    if (enabledGame?.page !== location.pathname || enabledGame.game !== game)
      return;
    pending ??= readComputerGamePgn(game).finally(() => {
      pending = undefined;
    });
    void pending.then(respond, () => {
      respond(null);
    });
    return true;
  });
}
