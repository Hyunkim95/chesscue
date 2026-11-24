import { hangingPiecePlaybook } from "./hanging-piece";
import { lessonPlaybookSchema } from "./schema";
import type { LessonPlaybook } from "./types";

const playbooks = [hangingPiecePlaybook] as const;

for (const playbook of playbooks) lessonPlaybookSchema.parse(playbook);

export const lessonPlaybookRegistry: readonly LessonPlaybook[] = playbooks;

export const getLessonPlaybook = (
  id: string,
  version: string,
): LessonPlaybook | null =>
  lessonPlaybookRegistry.find(
    (playbook) => playbook.id === id && playbook.version === version,
  ) ?? null;
