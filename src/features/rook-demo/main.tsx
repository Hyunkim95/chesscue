import { createRoot } from "react-dom/client";
import { RookDemo } from "./RookDemo";

const root = document.getElementById("root");
if (root) createRoot(root).render(<RookDemo />);
