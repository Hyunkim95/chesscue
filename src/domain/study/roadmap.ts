import { starterPack } from "../material/pack";
import { Chess } from "chess.js";
import { z } from "zod";
import type { PlayerProfile } from "../curriculum/types";

export const topicSchema = z.enum(["rook", "attack"]);
export type StudyTopic = z.infer<typeof topicSchema>;
export interface StudyLesson {
  title: string;
  insight: string;
  question: string;
  fen: string;
  continuation: readonly string[];
}
interface StudyCourse {
  title: string;
  source: string;
  url: string;
  lessons: readonly [StudyLesson, StudyLesson, StudyLesson];
}
function fromPack(topic: StudyTopic): StudyCourse {
  const [a, b, c] = starterPack.historical[topic];
  function lesson(item: typeof a): StudyLesson {
    return {
      title: item.title,
      insight: item.insight,
      question: item.question,
      fen: item.fen,
      continuation: item.continuation,
    };
  }
  return {
    title: topic === "rook" ? "Rook endings" : "Attacking the king",
    source: a.source.game,
    url: a.source.url,
    lessons: [lesson(a), lesson(b), lesson(c)],
  };
}
export const courses: Record<StudyTopic, StudyCourse> = {
  rook: fromPack("rook"),
  attack: fromPack("attack"),
};
export function recommendedTopic(profile: PlayerProfile): StudyTopic {
  return profile.nextGame.focus === "endgame-technique" ? "rook" : "attack";
}
export const studyQuestion = z
  .string()
  .trim()
  .min(8)
  .max(210)
  .regex(
    /^[^.!?\d<>\n]+\?$/u,
    "Expected one reflection question without notation",
  );
export const questionsSchema = z.tuple([
  studyQuestion,
  studyQuestion,
  studyQuestion,
]);
export const strategyNote = z
  .string()
  .trim()
  .min(12)
  .max(240)
  .regex(/^[^<>]+$/u)
  .refine(
    (text) =>
      !/(?:https?:|checkmate in|forced mate|always wins|guaranteed)/i.test(
        text,
      ),
  );
export const notesSchema = z.tuple([strategyNote, strategyNote, strategyNote]);
export const roadmapSchema = z
  .object({
    version: z.literal(2),
    runId: z.literal(starterPack.runId),
    startAt: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
    topic: topicSchema,
    source: z.literal("generated"),
    questions: questionsSchema,
    notes: notesSchema,
  })
  .strict()
  .refine((record) => {
    const lessons = courses[record.topic].lessons;
    return (
      record.questions.every((q, i) => q === lessons[i]?.question) &&
      record.notes.every((n, i) => n === lessons[i]?.insight)
    );
  }, "Unknown generated roadmap");
export type Roadmap = z.infer<typeof roadmapSchema>;
export function suggestedStart(
  profile: PlayerProfile,
  topic: StudyTopic,
): 0 | 1 | 2 {
  const mastery =
    profile.mastery[topic === "rook" ? "endgame-technique" : "one-move-threat"];
  return mastery.status === "established"
    ? 2
    : mastery.status === "emerging"
      ? 1
      : 0;
}
export function libraryRoadmap(
  topic: StudyTopic,
  startAt: 0 | 1 | 2 = 0,
): Roadmap {
  const [a, b, c] = courses[topic].lessons;
  return {
    version: 2,
    runId: starterPack.runId,
    startAt,
    topic,
    source: "generated",
    questions: [a.question, b.question, c.question],
    notes: [a.insight, b.insight, c.insight],
  };
}

// A remote chapter can be edited. Only use its game score when all of the
// versioned teaching positions and their recorded continuations still match.
export function verifyGameScore(
  topic: StudyTopic,
  pgn: string,
): string[] | null {
  if (!pgn || pgn.length > 65536) return null;
  try {
    const board = new Chess();
    board.loadPgn(pgn);
    const history = board.history({ verbose: true });
    const extracts: string[] = [];
    for (const lesson of courses[topic].lessons) {
      const index = history.findIndex((move) => move.before === lesson.fen);
      if (
        index < 0 ||
        !lesson.continuation.every(
          (san, offset) => history[index + offset]?.san === san,
        )
      )
        return null;
      extracts.push(
        history
          .slice(index, index + 6)
          .map((move) => move.san)
          .join(" "),
      );
    }
    return extracts;
  } catch {
    return null;
  }
}
