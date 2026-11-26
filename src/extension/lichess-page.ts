const playerName = () => {
  const player =
    document.body.dataset.user ??
    document.querySelector("#user_tag")?.textContent.trim();
  return player && /^[a-z0-9_-]{2,30}$/i.test(player) ? player : undefined;
};

if (
  /^\/[a-zA-Z0-9]{8}(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/.test(
    location.pathname,
  )
) {
  let finished = false;
  // The export endpoint independently verifies completion before analysis.
  function updateGameContext() {
    const result = document.querySelector(
      ".result-wrap .result, .analyse__tools .result, .round__app .result",
    );
    const complete =
      result !== null &&
      /^(1-0|0-1|½-½|1\/2-1\/2)$/.test(
        result.textContent.trim().replace(/[–−]/g, "-"),
      );
    if (complete !== finished) {
      finished = complete;
      void chrome.runtime
        .sendMessage({ type: "chesscue:lichess-context-changed" })
        .catch(() => undefined);
    }
    const existing = document.getElementById("chesscue-practise");
    if (!complete) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const button = document.createElement("button");
    button.id = "chesscue-practise";
    button.type = "button";
    button.className = "button";
    button.textContent = "Explore with Rook";
    button.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      void chrome.runtime.sendMessage({
        type: "chesscue:practise",
        player: playerName(),
      });
    });
    result.parentElement?.after(button);
  }

  chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "chesscue:lichess-context"
    )
      respond({ finished, player: playerName() });
  });
  updateGameContext();
  new MutationObserver(updateGameContext).observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });
}
