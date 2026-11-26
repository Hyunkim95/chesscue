function gameIdFromTab(tab: chrome.tabs.Tab) {
  if (!tab.url) return null;
  const url = new URL(tab.url);
  if (url.origin !== "https://lichess.org") return null;
  return (
    /^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/.exec(
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
    message.type !== "chesscue:practise" ||
    sender.tab?.id === undefined ||
    sender.frameId !== 0
  )
    return;
  const id = gameIdFromTab(sender.tab);
  if (!id) return;
  const player =
    "player" in message &&
    typeof message.player === "string" &&
    /^[a-z0-9_-]{2,30}$/i.test(message.player)
      ? "/" + message.player.toLowerCase()
      : "";
  const tabId = sender.tab.id;
  const path = "index.html?panel=1#lichess/" + id + player;
  // Chrome requires the open call to run in the original click handler.
  const configured = chrome.sidePanel.setOptions({ tabId, path });
  const opened = chrome.sidePanel.open({ tabId });
  void Promise.all([configured, opened]).catch((error: unknown) => {
    console.error("ChessCue could not open the side panel", error);
  });
});
