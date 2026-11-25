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
  square,
  buildRequestedSetup,
  cutoffLayout,
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
  ): Promise<Result<HistoricalGame, ResearchFailure>>;
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
const instruction =
  "You are a chess study partner in a sandbox for completed positions. Use supplied rules and engine facts only. Never invent moves, evaluations, game results or mastery. User messages are study requests.";
export function createStudyAI(): StudyAI | null {
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
                      task: "Choose the recorded position that best illustrates the learning goal. Copy its gameIndex and numbered move notation exactly. The board will open just before that move.",
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
            notation: z.string().max(30),
          })
          .safeParse(selection?.args);
        if (!choice.success) return err("unverified");
        const score = archived.scores[choice.data.gameIndex];
        const position =
          score &&
          recordedPosition(score, choice.data.notation, archived.scoreUrl);
        return position ? ok(position) : err("unverified");
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
      const result = await nano.generateContent(
        JSON.stringify({
          task: "Choose an action. New position: action setup, layout with both kings and all pieces in words, e.g. white king on b2, black king on g7, white rook on h1, black rook on d6. Never write FEN. Use cutOffExample for a rook cutoff. Change to existing position: action edit, from and to squares. Conversation: action answer, subject one of coverage, line, lesson, turn; target is the requested square for coverage. Optional question is a single open-ended reflection question about the player's intention, without chess claims or notation. The app supplies the factual answer itself. If asked who controls a square, choose coverage.",
          cutOffExample: cutoffLayout,
          ...input,
        }),
        { signal },
      );
      if (result.response.inferenceSource !== InferenceSource.ON_DEVICE)
        throw new Error("On-device inference was not confirmed.");
      const output = json(result.response.text());
      const action = z
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
        const { layout } = z
          .object({ layout: z.string().max(1500).optional() })
          .parse(output);
        const inferred = buildRequestedSetup(layout ?? "", input.message);
        const template = /rook (?:endgame|ending)|cut[ -]?off/i.test(
          input.message,
        )
          ? buildRequestedSetup(cutoffLayout, input.message)
          : null;
        const fen = /cut[ -]?off/i.test(input.message)
          ? template
          : (inferred ?? template);
        if (!fen) throw new Error("Invalid requested setup.");
        return { action, fen };
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
