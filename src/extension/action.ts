import { chessComGamePath, isChessComUsername } from "./external-game";

function gameIdFromTab(tab: chrome.tabs.Tab) {
  if (!tab.url) return null;
  const url = new URL(tab.url);
  if (url.origin !== "https://lichess.org") return null;
  return (
    /^\/(?:game\/)?([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/.exec(
      url.pathname,
    )?.[1] ?? null
  );
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    (message.type !== "chesscue:practise" &&
      message.type !== "chesscue:chesscom-practise") ||
    sender.tab?.id === undefined ||
    sender.frameId !== 0
  )
    return;
  const player =
    "player" in message && isChessComUsername(message.player)
      ? "/" + message.player.toLowerCase()
      : "";
  let route: string;
  if (message.type === "chesscue:chesscom-practise") {
    if (
      !sender.url ||
      !player ||
      !("game" in message) ||
      typeof message.game !== "string"
    )
      return;
    const page = new URL(sender.url);
    if (page.origin !== "https://www.chess.com") return;
    const game = chessComGamePath(message.game);
    if (
      !game ||
      (chessComGamePath(page.pathname) !== game &&
        !/^\/play\/online\/?$/.test(page.pathname))
    )
      return;
    route = "chesscom" + game + player;
  } else {
    const id = gameIdFromTab(sender.tab);
    if (!id) return;
    route = "lichess/" + id + player;
  }
  const tabId = sender.tab.id;
  const path = "index.html?panel=1#" + route;
  // Chrome requires the open call to run in the original click handler.
  const configured = chrome.sidePanel.setOptions({ tabId, path });
  const opened = chrome.sidePanel.open({ tabId });
  void Promise.all([configured, opened]).catch((error: unknown) => {
    console.error("ChessCue could not open the side panel", error);
  });
});
