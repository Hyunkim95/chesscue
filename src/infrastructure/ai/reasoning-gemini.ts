import { z } from "zod";

import type { OpenContext } from "../../domain/analysis/reasoning-context";
import type { ReasoningWriter } from "../../application/explain-why/explain-reasoning";
import { playerGemini } from "./player-gemini";

// Rook's reasoning answers on the player's own key (owner decision,
// 28 November 2026: Flash for every reasoning question). The writer phrases
// a packet of checked facts; the validator decides whether it may be shown.
export const REASONING_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 10_000;

const RULES = `Rules:
- Use only the input's facts. Mention only moves, squares and pieces that appear in the input, and name a piece only as the input names it.
- Material: never compute a count yourself. The only counts are the input's balances for the player ("3 points ahead", "1 point behind", "level"). Use one exactly, and only as the input labels it.
- Do not call anything unstoppable, forced or free unless the input shows it.
- Do not just list the moves.`;

export const OPEN_PROMPT = `You are Rook, a friendly chess coach who is also the player's opponent in this position. The player asks an open question about the position. Answer in at most two short sentences.
- If whyItWorks is given, the position is solved: explain the tactical point of facts.bestMove using whyItWorks (what it attacks, pins, lines up, uncovers or threatens, and why the defences fail) and what theBoardShows. Do not just give the final count.
- If whyItWorks is null, the player is still solving: never name or hint at a move or square for them. Say what you threaten (facts.myThreats) if anything, connect it to facts.goal, and suggest facts.approach.
Speak as Rook: "I" for your pieces and "you" for the player. The input was computed by chess software and is accurate.
${RULES}`;

const answer = z.object({ answer: z.string().min(1).max(600) }).strict();
const schema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
} as const;

function parse(text: string): string | undefined {
  try {
    const checked = answer.safeParse(JSON.parse(text));
    return checked.success ? checked.data.answer : undefined;
  } catch {
    return undefined;
  }
}

function writer<Context>(system: string): ReasoningWriter<Context> | undefined {
  const model = playerGemini({
    model: REASONING_MODEL,
    system,
    schema,
    maxOutputTokens: 2048,
    thinkingLevel: "LOW",
    timeoutMs: TIMEOUT_MS,
  });
  if (!model) return undefined;
  return {
    model: "Gemini Flash",
    async write(context, signal) {
      const text = await model.generate(JSON.stringify(context), signal);
      return text === undefined ? undefined : parse(text);
    },
  };
}

// Each is undefined without the player's key.
export const createOpenQuestionWriter = () => writer<OpenContext>(OPEN_PROMPT);
