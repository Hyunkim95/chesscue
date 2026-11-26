import payload from "./starter.generated.json" with { type: "json" };
import { parseStarterPack } from "./validate-pack";
export const starterPack = parseStarterPack(payload);
