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
  studyChapter: string;
  researchUrls: readonly string[];
  lessons: readonly [StudyLesson, StudyLesson, StudyLesson];
}
export const courses: Record<StudyTopic, StudyCourse> = {
  rook: {
    title: "Rook endings",
    studyChapter: "M3mZMe8l/MshiKf1G",
    source: "Capablanca vs. Tartakower · New York, 1924",
    researchUrls: [
      "https://www.lifemasteraj.com/old_af-dl/gcg_sh_capa-tart.html",
      "https://en.wikipedia.org/wiki/Chess_endgame",
    ],
    url: "https://lichess.org/study/embed/M3mZMe8l/MshiKf1G",
    lessons: [
      {
        title: "Activate the rook",
        insight: "Capablanca used the open h-file to reach the seventh rank.",
        question: "Where can your rook enter Black’s position?",
        fen: "5k2/p1p5/1p3rp1/n2p4/P2P1P2/2PB2P1/6K1/7R w - - 2 30",
        continuation: ["Rh7", "Rc6"],
      },
      {
        title: "Bring your king forward",
        insight:
          "White let the queenside pawn go and brought the king toward the g-pawn.",
        question: "Which pawn could your king help advance?",
        fen: "5k2/p1p4R/1pr5/3p1pP1/P2P1P2/2P2K2/8/8 w - - 0 35",
        continuation: ["Kg3", "Rxc3+", "Kh4"],
      },
      {
        title: "Support a passed pawn",
        insight:
          "The g-pawn advanced while White’s rook stayed on the seventh rank.",
        question: "Which piece can support the pawn on its next step?",
        fen: "5k2/p1p4R/1p6/3p1pP1/P2P1P1K/5r2/8/8 w - - 2 37",
        continuation: ["g6", "Rxf4+", "Kg5"],
      },
    ],
  },
  attack: {
    title: "Attacking the king",
    studyChapter: "bix862Qr/UaofLHKy",
    source: "Morphy’s Opera Game · Paris, 1858",
    researchUrls: [
      "https://chessmotion.com/explore/famous-chess-games/opera-game-1858",
      "https://en.wikipedia.org/wiki/Opera_Game",
    ],
    url: "https://chessmotion.com/explore/famous-chess-games/opera-game-1858",
    lessons: [
      {
        title: "Develop with a purpose",
        insight:
          "Morphy brought his queenside knight into play before opening the position.",
        question: "Which of your pieces still needs to join the attack?",
        fen: "rn2kb1r/ppp1qppp/5n2/4p3/2B1P3/1Q6/PPP2PPP/RNB1K2R w KQkq - 4 8",
        continuation: ["Nc3", "c6", "Bg5"],
      },
      {
        title: "Open a line",
        insight:
          "White gave up one rook on the d-file and brought the other rook onto the same file.",
        question: "What could your second rook do if the file opened?",
        fen: "3rkb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R w k - 3 13",
        continuation: ["Rxd7", "Rxd7", "Rd1"],
      },
      {
        title: "Find the forcing finish",
        insight:
          "The queen sacrifice drew the knight away from the square where White’s rook delivered mate.",
        question: "Which defender is keeping your rook out?",
        fen: "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16",
        continuation: ["Qb8+", "Nxb8", "Rd8#"],
      },
    ],
  },
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
  .regex(/^[^<>\d]+$/u)
  .refine(
    (text) =>
      !/(?:https?:|checkmate in|forced mate|always wins|guaranteed)/i.test(
        text,
      ),
  );
export const notesSchema = z.tuple([strategyNote, strategyNote, strategyNote]);
export const roadmapSchema = z
  .object({
    version: z.literal(1),
    startAt: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
    topic: topicSchema,
    source: z.enum(["library", "cloud"]),
    reference: z
      .union([z.literal("score"), z.literal(0), z.literal(1)])
      .nullable()
      .default(null),
    questions: questionsSchema,
    notes: notesSchema,
  })
  .strict();
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
    version: 1,
    startAt,
    topic,
    source: "library",
    reference: null,
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
