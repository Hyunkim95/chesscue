import type { LessonPlaybook, LessonSelectionEvidence } from "./types";

export interface SelectedLesson {
  readonly playbook: LessonPlaybook;
  readonly factPacket: NonNullable<LessonSelectionEvidence["factPacket"]>;
}

export const selectLessonPlaybook = (
  registry: readonly LessonPlaybook[],
  evidence: readonly LessonSelectionEvidence[],
): SelectedLesson | null => {
  const candidates = evidence
    .flatMap((item) =>
      registry
        .filter(
          (playbook) =>
            playbook.theme === item.theme &&
            item.factPacket !== null &&
            item.evidenceCount >= playbook.trigger.minimumEvidenceCount &&
            item.confidence >= playbook.trigger.minimumConfidence,
        )
        .map((playbook) => ({ playbook, evidence: item })),
    )
    .toSorted((left, right) => {
      const priorityDifference =
        right.evidence.priority - left.evidence.priority;
      if (priorityDifference !== 0) return priorityDifference;
      const idDifference = left.playbook.id.localeCompare(right.playbook.id);
      return idDifference === 0
        ? left.playbook.version.localeCompare(right.playbook.version)
        : idDifference;
    });

  const selected = candidates[0];
  if (selected === undefined || selected.evidence.factPacket === null)
    return null;
  return {
    playbook: selected.playbook,
    factPacket: selected.evidence.factPacket,
  };
};
