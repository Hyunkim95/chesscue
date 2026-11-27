// The rendered result controls availability. Game moves are loaded only from PubAPI.
let enabledGame: { page: string; game: string; player: string } | null = null;

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
  const score = document.querySelector<HTMLElement>(".result-row .game-result");
  const finished =
    modalFinished ||
    (score !== null &&
      score.getClientRects().length > 0 &&
      /^(1-0|0-1|½-½|1\/2-1\/2)$/.test(
        score.textContent.trim().replace(/[–−]/g, "-"),
      ));
  const actions = document.querySelector<HTMLElement>(
    ".game-over-modal-shell-buttons",
  );
  const sidebar = document.querySelector<HTMLElement>(".board-layout-sidebar");
  const directGame = /^\/game\/(live|daily)\/\d{1,18}\/?$/.test(page)
    ? page
    : null;
  const resultLink = actions?.querySelector<HTMLAnchorElement>(
    'a[href^="/analysis/game/"], a[href^="https://www.chess.com/analysis/game/"]',
  );
  const linkedGame = resultLink?.pathname.match(
    /^\/analysis(\/game\/(?:live|daily)\/\d{1,18})(?:\/|$)/,
  )?.[1];
  const game = directGame ?? linkedGame;
  if (
    enabledGame?.page !== page ||
    (game && enabledGame.game !== game) ||
    (!directGame && !finished)
  ) {
    enabledGame = null;
  }
  if (finished && game && !enabledGame) {
    const player = Array.from(
      document.querySelectorAll('[data-test-element="user-tagline-username"]'),
      (element) => element.textContent.trim(),
    ).find((name) => /^[a-z0-9_-]{2,30}$/i.test(name));
    if (player) enabledGame = { page, game, player };
  }

  const existing = document.getElementById("chesscue-chesscom-explore");
  const target = actions?.getClientRects().length ? actions : sidebar;
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
  characterData: true,
  childList: true,
  subtree: true,
});
