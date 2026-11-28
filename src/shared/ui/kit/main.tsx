import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-sans/latin-800.css";
import "@fontsource/newsreader/latin-600.css";

import "../../../app/styles.css";
import { applyTokens } from "../apply-tokens";
import { UiKit } from "./UiKit";

applyTokens(document.documentElement.style);
document.body.style.margin = "0";
const root = document.getElementById("root");
if (root) createRoot(root).render(<UiKit />);
