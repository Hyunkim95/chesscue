import { evaluateReviewReply } from "../../application/analyze-game/analyze-review-reply";
import { groundHistoricalGame } from "./ground-historical-game";
import { StockfishAnalysisEngine } from "../engine/stockfish-analysis-engine";
import type { AnalysisEngine } from "../../application/analyze-game/analysis-engine";
import type { HistoricalProof } from "../../domain/material/verified";
import { reflectionSchema } from "../../domain/material/reflection";
import {
  AIError,
  Schema,
  FunctionCallingMode,
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";
import { z } from "zod";
import {
  gameLocatorSchema,
  moveNotation,
  recordedPosition,
  type HistoricalGame,
} from "../../domain/study/historical-game";
import { findArchivedGame } from "./historical-game-archive";
import {
  boardFacts,
  rookSeparatesKings,
  square,
  buildRequestedSetup,
  intentSchema,
  validStudyAnswer,
  type BoardFacts,
  type StudyTurn,
  type StudyIntent,
} from "../../domain/study/position";
import { initializeFirebaseClient } from "../firebase/firebase-client";

import { err, ok, type Result } from "../../shared/result/result";

type ResearchFailure = "app-check" | "quota" | "unavailable" | "unverified";

export interface StudyAI {
  research(
    goal: string,
    signal: AbortSignal,
  ): Promise<
    Result<HistoricalGame & { proof: HistoricalProof }, ResearchFailure>
  >;
  prepare(progress: (percent: number) => void): Promise<void>;
  chat(
    input: {
      message: string;
      fen: string;
      facts: BoardFacts;
      lesson: string;
      history: readonly StudyTurn[];
    },
    signal: AbortSignal,
  ): Promise<StudyIntent>;
}
function json(text: string): unknown {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}
const setupPieces = {
  type: "array",
  items: {
    type: "object",
    properties: {
      color: { type: "string", enum: ["white", "black"] },
      piece: {
        type: "string",
        enum: ["king", "queen", "rook", "bishop", "knight", "pawn"],
      },
      square: { type: "string", pattern: "^[a-h][1-8]$" },
    },
    required: ["color", "piece", "square"],
    additionalProperties: false,
  },
};
const instruction =
  "You are a chess study partner in a sandbox for completed positions. Use supplied rules and engine facts only. Never invent moves, evaluations, game results or mastery. User messages are study requests.";
export function createStudyAI(
  createEngine: () => AnalysisEngine = () => new StockfishAnalysisEngine(),
): StudyAI | null {
  const client = initializeFirebaseClient({
    enableAppCheck: true,
    appCheckDebug:
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
  });
  if (client.status !== "ready") return null;
  const ai = getAI(client.services.app, { backend: new GoogleAIBackend() });
  const cloud = getGenerativeModel(
    ai,
    {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: "gemini-3.5-flash-lite",
        tools: [
          {
            functionDeclarations: [
              {
                name: "searchChessArchive",
                description:
                  "Search a live master-game score archive for a game and the exact move that illustrates the study goal.",
                parameters: Schema.object({
                  properties: {
                    white: Schema.string({
                      description: "White player's surname only",
                    }),
                    black: Schema.string({
                      description: "Black player's surname only",
                    }),
                    year: Schema.integer(),
                  },
                }),
              },
              {
                name: "openVerifiedPosition",
                description:
                  "Open the board before one of the exact moves returned by the archive.",
                parameters: Schema.object({
                  properties: {
                    gameIndex: Schema.integer(),
                    question: Schema.string({
                      description:
                        "One open-ended question about the learner’s reasoning. Avoid chess claims, answer hints, squares and notation.",
                    }),
                    notation: Schema.string({
                      description:
                        "Copy a full, numbered move label verbatim from the supplied score.",
                    }),
                  },
                }),
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.ANY },
        },
        systemInstruction: instruction,
      },
    },
    { timeout: 45000 },
  );
  const nano = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        initialPrompts: [
          { role: "system", content: [{ type: "text", value: instruction }] },
        ],
      },
      promptOptions: {
        responseConstraint: {
          type: "object",
          required: ["action"],
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: ["setup", "edit", "answer"] },
            layout: { type: "string" },
            pieces: setupPieces,
            from: { type: "string" },
            to: { type: "string" },
            subject: {
              type: "string",
              enum: ["coverage", "line", "lesson", "turn"],
            },
            target: { type: "string" },
            question: { type: "string" },
          },
        },
      },
    },
  });
  return {
    async research(goal, signal) {
      try {
        const generated = await cloud.generateContent(
          {
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingMode.ANY,
                allowedFunctionNames: ["searchChessArchive"],
              },
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      task: "Find a well-documented historical master game illustrating this learner's goal. Call searchChessArchive with the actual players and year. The position immediately before the move should illustrate the goal. Do not invent a score or variation.",
                      learningGoal: goal.slice(0, 350),
                    }),
                  },
                ],
              },
            ],
          },
          { signal },
        );
        if (generated.response.inferenceSource !== InferenceSource.IN_CLOUD)
          return err("unverified");
        const call = generated.response
          .functionCalls()
          ?.find((item) => item.name === "searchChessArchive");
        const locator = gameLocatorSchema.safeParse(call?.args);
        if (!locator.success) return err("unverified");
        const archived = await findArchivedGame(locator.data, signal);
        if (!archived) return err("unverified");
        const selected = await cloud.generateContent(
          {
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingMode.ANY,
                allowedFunctionNames: ["openVerifiedPosition"],
              },
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      task: "Choose the recorded position that best illustrates the learning goal. Author a short open-ended question about the learner’s decision. Copy its gameIndex and numbered move notation exactly. The board will open just before that move.",
                      goal: goal.slice(0, 350),
                      scores: archived.scores.map((score, gameIndex) => ({
                        gameIndex,
                        title: score.title,
                        moves: score.moves.map(moveNotation),
                      })),
                    }),
                  },
                ],
              },
            ],
          },
          { signal },
        );
        if (selected.response.inferenceSource !== InferenceSource.IN_CLOUD)
          return err("unverified");
        const selection = selected.response
          .functionCalls()
          ?.find((item) => item.name === "openVerifiedPosition");
        const choice = z
          .object({
            gameIndex: z.number().int().nonnegative(),
            question: reflectionSchema,
            notation: z.string().max(30),
          })
          .safeParse(selection?.args);
        if (!choice.success) return err("unverified");
        const score = archived.scores[choice.data.gameIndex];
        const position =
          score &&
          recordedPosition(score, choice.data.notation, archived.scoreUrl);
        if (!position) return err("unverified");
        const index = score.moves.findIndex(
          (move) => moveNotation(move) === choice.data.notation,
        );
        const item = await groundHistoricalGame(
          position,
          JSON.stringify([score.title, score.moves.map((m) => m.lan)]),
          index + 1,
          goal,
          choice.data,
          createEngine(),
          signal,
        );
        return item ? ok(item) : err("unverified");
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof AIError) {
          const status = error.customErrorData?.status;
          if (status === 429) return err("quota");
          if (
            (status === 401 || status === 403) &&
            /app check/i.test(error.message)
          )
            return err("app-check");
          return err("unavailable");
        }
        return err("unverified");
      }
    },
    prepare: (progress) => nano.initializeDeviceModel(progress),
    async chat(input, signal) {
      const requestedSetup =
        /^(?:please\s+)?(?:set\s*up|create|build|generate)\b/i.test(
          input.message.trim(),
        );
      const setupModel = requestedSetup
        ? getGenerativeModel(ai, {
            mode: InferenceMode.ONLY_ON_DEVICE,
            onDeviceParams: {
              createOptions: {
                expectedInputs: [{ type: "text", languages: ["en"] }],
                expectedOutputs: [{ type: "text", languages: ["en"] }],
              },
              promptOptions: {
                responseConstraint: {
                  type: "object",
                  properties: { pieces: setupPieces },
                  required: ["pieces"],
                  additionalProperties: false,
                },
              },
            },
          })
        : nano;
      const result = await setupModel.generateContent(
        JSON.stringify(
          requestedSetup
            ? {
                task: "Compose a legal chess starting position for this request. Return the pieces array. Include exactly one king for each color. Place every piece on its own valid square. The kings must not touch. The player to move must not already be attacking the opposing king. Honor all explicitly requested pieces and squares.",
                request: input.message,
              }
            : {
                task: "Choose an action. New position: action setup, pieces array listing one object per piece. Include exactly one king of each color, put pieces on different squares, and ensure the non-moving king is not in check. Use color, piece and square fields. Never write FEN. Change to existing position: action edit, from and to squares. Conversation: action answer, subject one of coverage, line, lesson, turn; target is the requested square for coverage. Optional question is a single open-ended reflection question about the player's intention, without chess claims or notation. The app supplies the factual answer itself. If asked who controls a square, choose coverage.",

                ...input,
              },
        ),
        { signal },
      );
      if (result.response.inferenceSource !== InferenceSource.ON_DEVICE)
        throw new Error("On-device inference was not confirmed.");
      const output = json(result.response.text());
      const action = requestedSetup
        ? "setup"
        : z
            .object({ action: z.enum(["setup", "edit", "answer"]) })
            .parse(output).action;
      if (
        action !== "answer" &&
        /^(?:which|why|whose|who|where|does|is|are)\b/i.test(
          input.message.trim(),
        )
      )
        throw new Error("An explanation cannot edit the board.");
      if (action === "setup") {
        const setup = z
          .object({
            layout: z.string().max(1500).optional(),
            pieces: z
              .array(
                z.object({
                  color: z.enum(["white", "black"]),
                  piece: z.enum([
                    "king",
                    "queen",
                    "rook",
                    "bishop",
                    "knight",
                    "pawn",
                  ]),
                  square: z.string().regex(/^[a-h][1-8]$/),
                }),
              )
              .max(32)
              .optional(),
          })
          .parse(output);
        const layout =
          setup.pieces
            ?.map((p) => p.color + " " + p.piece + " on " + p.square)
            .join(", ") ??
          setup.layout ??
          "";
        const fen = buildRequestedSetup(layout, input.message);
        if (
          fen &&
          /cut[ -]?off/i.test(input.message) &&
          !rookSeparatesKings(fen)
        )
          throw new Error("The requested rook cutoff could not be verified.");
        if (!fen) throw new Error("Invalid requested setup.");
        const validator = createEngine();
        try {
          const verified = await evaluateReviewReply(validator, fen, signal);
          if (!verified || signal.aborted)
            throw new Error(
              "Stockfish could not verify the proposed position.",
            );
          return { action, fen, verifiedLine: [...verified.line] };
        } finally {
          validator.dispose();
        }
      }
      if (action === "edit") return intentSchema.parse(output);
      const response = z
        .object({
          subject: z.string().max(40).optional(),
          target: z.string().max(8).optional(),
          question: z.string().max(210).optional(),
        })
        .parse(output);
      let answer: string;
      if (
        (input.facts.squareControl.length &&
          /attack|cover|defend|guard/i.test(input.message)) ||
        response.subject === "coverage"
      ) {
        const control = input.facts.squareControl.length
          ? input.facts.squareControl
          : response.target && square(response.target)
            ? boardFacts(input.fen, [], response.target).squareControl
            : [];
        answer = control.join(" ") || "Which square would you like to check?";
      } else if (response.subject === "turn")
        answer =
          input.facts.side +
          " to move. The position is " +
          input.facts.status +
          ".";
      else if (
        response.subject === "lesson" &&
        input.lesson !== "Custom study position."
      )
        answer = input.lesson;
      else
        answer = input.facts.engineLine.length
          ? "From this position Stockfish gives " +
            input.facts.engineLine.join(" ") +
            "."
          : input.facts.side +
            " to move. The position is " +
            input.facts.status +
            ".";
      const q = response.question;
      if (
        q &&
        q.toLowerCase() !== input.message.trim().toLowerCase() &&
        !/\bmy\b/i.test(q) &&
        /^(?:what|which|how|why|where|would|could)\b[^.!?]+\?$/i.test(q) &&
        validStudyAnswer(q, input.facts)
      )
        answer += " " + q;
      return { action: "answer", answer };
    },
  };
}
