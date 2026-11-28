import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-sans/latin-800.css";
import "@fontsource/newsreader/latin-600.css";

import "../../../app/styles.css";
import { applyTokens } from "../../../shared/ui/apply-tokens";
import { SkyDemo } from "./SkyDemo";

applyTokens(document.documentElement.style);
const root = document.getElementById("root");
if (root) createRoot(root).render(<SkyDemo />);
