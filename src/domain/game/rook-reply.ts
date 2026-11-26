import { cachedReflection } from "../material/reflection";
import type { CoachMoment } from "./coach-moments";

export const rookIntents = [
  "explain",
  "reflect",
  "replay",
  "clarify",
  "live-move",
] as const;
export type RookIntent = (typeof rookIntents)[number];

export interface RookReplyChoice {
  readonly intent: RookIntent;
  readonly ply?: number;
  readonly question?: string;
}

export interface RookReply {
  readonly text: string;
  readonly momentPly?: number;
}

export function rookReply(
  message: string,
  moments: readonly CoachMoment[],
  choice?: RookReplyChoice,
): RookReply {
  if (
    /what (?:should|can) (?:i|we) (?:play|move|do) (?:now|next)|what should i play\s*\??$|give me a hint|best move (?:now|here|next)/i.test(
      message,
    ) ||
    choice?.intent === "live-move"
  ) {
    return {
      text: "I can talk through a move you’ve already played. Ask me about one of those positions.",
    };
  }

  const mentioned = /\b(?:move|turn)\s+(\d+)\b/i.exec(message);
  const subject = /castl|open(?:ing)? (?:the )?cent(?:er|re)/i.test(message)
    ? /center|castl/i
    : /fork|knight check/i.test(message)
      ? /fork/i
      : /\bmate\b|checkmate/i.test(message)
        ? /mate/i
        : null;
  const matching = mentioned
    ? moments.filter(({ ply }) => Math.ceil(ply / 2) === Number(mentioned[1]))
    : subject
      ? moments.filter(({ title, detail }) =>
          subject.test(title + " " + detail),
        )
      : moments;
  const moment =
    matching.find(({ ply }) => ply === choice?.ply) ?? matching.at(-1);
  if (moment === undefined) {
    return {
      text: moments.length
        ? "Which move did you mean? Pick a moment I flagged and we can rewind to it together."
        : "I haven’t flagged a move yet. Keep playing, and we can talk through a moment once there’s a checked position to revisit.",
    };
  }
  const intent =
    choice?.intent ??
    (/\b(?:show|rewind|replay)\b/i.test(message)
      ? "replay"
      : /\b(?:i thought|i wanted|my plan|i was thinking)\b/i.test(message)
        ? "reflect"
        : "explain");
  switch (intent) {
    case "replay":
      return {
        text: `Let’s rewind that one. ${moment.detail}`,
        momentPly: moment.ply,
      };
    case "reflect":
      return {
        text: `${moment.detail} ${choice?.question ?? cachedReflection("calculation")}`,
        momentPly: moment.ply,
      };
    case "clarify":
      return {
        text: "Do you want to talk through the move you made or rewind and compare it on the board?",
        momentPly: moment.ply,
      };
    default:
      return {
        text: [moment.detail, choice?.question].filter(Boolean).join(" "),
        momentPly: moment.ply,
      };
  }
}
