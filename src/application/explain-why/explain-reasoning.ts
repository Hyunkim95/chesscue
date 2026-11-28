import {
  positionPacket,
  type PositionInput,
} from "../../domain/analysis/position-packet";
import {
  boardShows,
  type OpenContext,
} from "../../domain/analysis/reasoning-context";
import type { StoryFrame } from "../../domain/analysis/line-storyboard";
import { positionProblems } from "../../domain/analysis/validate-why";
import {
  whyPacket,
  whySearches,
  type WhyLines,
  type WhySearch,
} from "../../domain/analysis/why-packet";
import type {
  AnalysisEngineFailure,
  PositionAnalysis,
} from "../analyze-game/analysis-engine";
import type { Result } from "../../shared/result/result";
import type { WhyExplanation } from "./explain-why";

export interface ReasoningWriter<Context> {
  readonly model: string;
  write(context: Context, signal: AbortSignal): Promise<string | undefined>;
}

type Analyze = (
  fen: string,
  multiPv: number,
  signal: AbortSignal,
) => Promise<Result<PositionAnalysis, AnalysisEngineFailure>>;

// One engine, so one search at a time.
async function search(
  searches: readonly WhySearch[],
  analyze: Analyze,
  signal: AbortSignal,
): Promise<WhyLines> {
  const lines = new Map<string, readonly (readonly string[])[]>();
  for (const { key, fen, multiPv } of searches) {
    if (signal.aborted) break;
    const analysis = await analyze(fen, multiPv, signal);
    if (!analysis.ok) continue;
    lines.set(
      key,
      analysis.value.candidates.map(
        ({ principalVariation }) => principalVariation,
      ),
    );
  }
  return lines;
}

async function checked<Context>(
  context: Context,
  writer: ReasoningWriter<Context>,
  problems: (text: string) => string[],
  signal: AbortSignal,
): Promise<WhyExplanation> {
  const text = await writer.write(context, signal);
  if (signal.aborted) return { kind: "not-written", reason: "cancelled" };
  if (text === undefined) return { kind: "not-written", reason: "no-text" };
  const found = problems(text);
  return found.length > 0
    ? { kind: "not-written", reason: "rejected", problems: found }
    : { kind: "written", text: text.trim(), model: writer.model };
}

// An open question. Once solved, the best move's own Why searches are run
// so the writer can give its tactical point.
export async function answerOpenQuestion({
  input,
  question,
  frames,
  analyze,
  writer,
  signal,
}: {
  readonly input: PositionInput;
  readonly question: string;
  readonly frames: readonly StoryFrame[];
  readonly analyze: Analyze;
  readonly writer: ReasoningWriter<OpenContext>;
  readonly signal: AbortSignal;
}): Promise<WhyExplanation> {
  const facts = positionPacket(input);
  if (!facts) return { kind: "not-written", reason: "no-packet" };
  const answer = input.answerLine ?? [];
  let whyItWorks: OpenContext["whyItWorks"] = null;
  if (answer.length > 0) {
    const why = { fen: input.fen, bestLine: answer };
    const lines = await search(whySearches(why), analyze, signal);
    if (signal.aborted) return { kind: "not-written", reason: "cancelled" };
    whyItWorks = whyPacket(why, lines) ?? null;
  }
  const context: OpenContext = {
    question,
    facts,
    whyItWorks,
    theBoardShows: boardShows(input.fen, frames),
  };
  return checked(
    context,
    writer,
    (text) => positionProblems(text, facts, context),
    signal,
  );
}
