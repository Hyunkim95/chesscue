export { reflectionSchema } from "./reflection-schema";
import type { LearningTheme } from "../analysis/types";
import { starterPack } from "./pack";

export function cachedReflection(theme: LearningTheme) {
  const item = starterPack.positions.find(
    (item) => item.theme === theme && item.difficulty === "unlabeled",
  );
  return item?.question ?? starterPack.skills.vision.question;
}
