import { whyProblems } from "../../domain/analysis/validate-why";
import {
  whyPacket,
  whySearches,
  type WhyInput,
  type WhyPacket,
} from "../../domain/analysis/why-packet";
import type {
  AnalysisEngineFailure,
  PositionAnalysis,
} from "../analyze-game/analysis-engine";
import type { Result } from "../../shared/result/result";

// Writes the checked reasons as at most two sentences. undefined when the
// model is unavailable, fails or returns no text.
export interface WhyWriter {
  readonly model: string;
  write(packet: WhyPacket, signal: AbortSignal): Promise<string | undefined>;
}

export type WhyExplanation =
  | { readonly kind: "written"; readonly text: string; readonly model: string }
  | {
      readonly kind: "not-written";
      readonly reason: "no-packet" | "no-text" | "rejected" | "cancelled";
      readonly problems?: readonly string[];
    };

// "Why is the best move good?", online: Stockfish answers the packet's
// searches, the writer phrases the packet and the checker decides whether
// the text may be shown. Anything else keeps the code-written caption.
// SLO-013: a complete verified explanation within 20 seconds.
export async function explainWhy({
  input,
  analyze,
  writer,
  signal,
}: {
  readonly input: WhyInput;
  readonly analyze: (
    fen: string,
    multiPv: number,
    signal: AbortSignal,
  ) => Promise<Result<PositionAnalysis, AnalysisEngineFailure>>;
  readonly writer: WhyWriter;
  readonly signal: AbortSignal;
}): Promise<WhyExplanation> {
  // A function, so each check reads the signal after the await before it.
  const cancelled = () => signal.aborted;
  const lines = new Map<string, readonly (readonly string[])[]>();
  // One engine, so one search at a time.
  for (const search of whySearches(input)) {
    if (cancelled()) return { kind: "not-written", reason: "cancelled" };
    const analysis = await analyze(search.fen, search.multiPv, signal);
    if (!analysis.ok) continue;
    // Each principal variation starts with its candidate move.
    lines.set(
      search.key,
      analysis.value.candidates.map(
        ({ principalVariation }) => principalVariation,
      ),
    );
  }
  if (cancelled()) return { kind: "not-written", reason: "cancelled" };
  const packet = whyPacket(input, lines);
  if (!packet) return { kind: "not-written", reason: "no-packet" };
  const text = await writer.write(packet, signal);
  if (cancelled()) return { kind: "not-written", reason: "cancelled" };
  if (text === undefined) return { kind: "not-written", reason: "no-text" };
  const problems = whyProblems(text, packet);
  return problems.length > 0
    ? { kind: "not-written", reason: "rejected", problems }
    : { kind: "written", text: text.trim(), model: writer.model };
}
