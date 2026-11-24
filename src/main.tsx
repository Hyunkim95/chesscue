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

import { App } from "./app/App";
import "./app/styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Application root was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
