import material from "../../../scripts/material/unit-classifier.generated.json" with { type: "json" };
import { unitClassifierSchema } from "./unit-classifier";

export const installedUnitClassifier = unitClassifierSchema.parse(material);
