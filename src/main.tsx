import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-sans/latin-800.css";
import "@fontsource/newsreader/latin-500.css";
import "@fontsource/newsreader/latin-600.css";
import "@fontsource/newsreader/latin-700.css";

import { SharedGameReplay } from "./features/import-games/SharedGameReplay";
import { App } from "./app/App";
import { MicrophoneSetup } from "./extension/MicrophoneSetup";
import "./app/styles.css";
import { applyTokens } from "./shared/ui/apply-tokens";

applyTokens(document.documentElement.style);

if (
  location.protocol === "chrome-extension:" &&
  new URLSearchParams(location.search).get("panel") === "1"
) {
  document.body.classList.add("chesscue-sidebar");
}

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Application root was not found");
}

const query = new URLSearchParams(location.search);
const sharedId = query.get("sharedGame");
const microphoneSetup =
  location.protocol === "chrome-extension:" && query.get("microphone") === "1";
createRoot(root).render(
  <StrictMode>
    {microphoneSetup ? (
      <MicrophoneSetup />
    ) : sharedId !== null ? (
      <SharedGameReplay id={sharedId} initialPly={Number(query.get("ply"))} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
