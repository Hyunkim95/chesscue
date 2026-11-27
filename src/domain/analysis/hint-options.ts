import { Chess, type Square } from "chess.js";

import { PIECE_NAME, opponent } from "./board-relations";
import { dangerFacts, type DangerFact } from "./danger-facts";

// The closed list of hints an on-device model may choose from after reading
// the player's answer. Code writes every word and board mark; the model only
// picks an id, and anything else falls back to "scan". Pure: chess.js only.

export const HINT_OPTIONS_VERSION = "hint-options/1";

export type HintId = "check-their-threats" | "bigger-target" | "scan";

export interface HintOption {
  readonly id: HintId;
  // What the model reads to decide whether this hint fits the answer.
  readonly whenToChoose: string;
  readonly text: string;
  readonly arrows: readonly (readonly [Square, Square])[];
  readonly outlined: readonly Square[];
}

const SIDE = { w: "White", b: "Black" } as const;
const serious = (fact: DangerFact) => fact.kind !== "attacked-but-safe";
const arrowsTo = (facts: readonly DangerFact[]) =>
  facts.flatMap((fact) =>
    fact.attackers.map((from) => [from, fact.target] as const),
  );

// Hint options for the side to move in `fen`. Returns undefined for an invalid
// position. "scan" is always present and is the fallback.
export function hintOptions(fen: string): readonly HintOption[] | undefined {
  const facts = dangerFacts(fen);
  if (!facts) return undefined;
  const board = new Chess(fen);
  const them = SIDE[opponent(board.turn())];
  const options: HintOption[] = [];

  if (facts.some(serious))
    options.push({
      id: "check-their-threats",
      whenToChoose:
        "The player talks about their own plan or attack and does not mention any danger to their own pieces or king.",
      text: `Before you attack, check what ${them} threatens.`,
      arrows: arrowsTo(facts),
      outlined: [],
    });

  const safe = facts.find((fact) => fact.kind === "attacked-but-safe");
  const bigger = facts.find(serious);
  const [attacker] = safe?.attackers ?? [];
  const attackerType = attacker ? board.get(attacker)?.type : undefined;
  if (safe && bigger && attacker && attackerType)
    options.push({
      id: "bigger-target",
      whenToChoose: `The player names the attack on their ${PIECE_NAME[safe.piece]} on ${safe.target}, which is real but safe.`,
      text: `True: ${safe.text.charAt(0).toLowerCase()}${safe.text.slice(1, -1)}. Something bigger is attacked too. Follow the ${PIECE_NAME[attackerType]}'s other ${attackerType === "n" ? "jumps" : "lines"}.`,
      arrows: [],
      outlined: [attacker],
    });

  options.push({
    id: "scan",
    whenToChoose:
      "The player is unsure, asks for help, or says something that fits no other hint.",
    text: "Let's scan: what can each of your opponent's pieces take or check?",
    arrows: arrowsTo(facts),
    outlined: [],
  });
  return options;
}
