import type {
  NextGamePrescription,
  ThemeMastery,
} from "../../domain/curriculum/types";

export interface CurriculumCardProps {
  readonly prescription: NextGamePrescription;
  readonly mastery: ThemeMastery;
}

const themeLabel = (theme: string): string => theme.replaceAll("-", " ");

export function CurriculumCard({ prescription, mastery }: CurriculumCardProps) {
  return (
    <section aria-labelledby="next-focus-title">
      <p>
        {prescription.mode === "focus" ? "Focus game" : "Consolidation game"}
      </p>
      <h2 id="next-focus-title">{themeLabel(prescription.focus)}</h2>
      <p>{prescription.reason}</p>
      <dl>
        <div>
          <dt>Opponent target</dt>
          <dd>{prescription.targetElo} Elo</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            {mastery.evidenceCount} observations, {mastery.status}
          </dd>
        </div>
      </dl>
    </section>
  );
}
