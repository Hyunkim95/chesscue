import material from "../../../scripts/material/curriculum.generated.json" with { type: "json" };
import { installedCurriculumSchema } from "./curriculum";

export const curriculum = installedCurriculumSchema.parse(material);

export function skillLocation(unitId: string) {
  for (const stage of curriculum.stages) {
    const unit = stage.units.find((unit) => unit.id === unitId);
    if (unit) return stage.title + " › " + unit.title;
  }
  return "";
}
