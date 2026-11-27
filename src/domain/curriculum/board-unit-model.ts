import { Chess } from "chess.js";
import { z } from "zod";

// A small convolutional network that reads the position before the learner's
// move plus the next three half-moves and predicts the curriculum unit. It is
// trained offline from Lichess puzzle themes (research_notes/drill-matching-
// benchmark) and shipped as int8 weights with one scale per output row.

const BOARDS = 4;
const PLANES = 14;
const SQUARES = 64;
const PADDED = 13;
const PIECES = "PNBRQK";

const layerSchema = z
  .object({
    kind: z.enum(["conv", "dense"]),
    outputs: z.number().int().positive(),
    inputs: z.number().int().positive(),
    scales: z.array(z.number().positive()),
    biases: z.array(z.number()),
  })
  .strict()
  .refine(
    (layer) =>
      layer.scales.length === layer.outputs &&
      layer.biases.length === layer.outputs,
  );

export const boardUnitModelSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1),
    boards: z.literal(BOARDS),
    planes: z.literal(PLANES),
    units: z.array(z.string().min(1)).min(2),
    layers: z.array(layerSchema).min(2),
  })
  .strict()
  .refine(({ layers, units }) => {
    let channels = BOARDS * PLANES;
    let flat = false;
    for (const layer of layers) {
      if (layer.kind === "conv") {
        if (flat || layer.inputs !== channels) return false;
        channels = layer.outputs;
      } else {
        if (layer.inputs !== (flat ? channels : channels * SQUARES))
          return false;
        flat = true;
        channels = layer.outputs;
      }
    }
    return flat && channels === units.length;
  });

type Layer = z.infer<typeof layerSchema>;

export interface BoardUnitModel {
  readonly name: string;
  readonly units: readonly string[];
  readonly layers: readonly (Layer & { readonly weights: Int8Array })[];
}

export interface BoardUnitPrediction {
  readonly unitId: string;
  readonly probability: number;
}

export function boardUnitModel(
  metadata: unknown,
  weights: Int8Array,
): BoardUnitModel | undefined {
  const parsed = boardUnitModelSchema.safeParse(metadata);
  if (!parsed.success) return undefined;
  let offset = 0;
  const layers = parsed.data.layers.map((layer) => {
    const size = layer.outputs * layer.inputs * (layer.kind === "conv" ? 9 : 1);
    const slice = weights.subarray(offset, offset + size);
    offset += size;
    return { ...layer, weights: slice };
  });
  if (offset !== weights.length) return undefined;
  return { name: parsed.data.name, units: parsed.data.units, layers };
}

export const MINIMUM_BOARD_UNIT_PROBABILITY = 0.6;

// The boards the model reads: the position before the learner's move and after
// each of the first three half-moves of the checked line.
export function boardSequence(
  fen: string,
  line: readonly string[],
): string[] | undefined {
  try {
    const board = new Chess(fen);
    const fens = [board.fen()];
    for (const uci of line.slice(0, BOARDS - 1)) {
      if (board.isGameOver()) break;
      board.move(uci);
      fens.push(board.fen());
    }
    return fens;
  } catch {
    return undefined;
  }
}

// One code per square for each board, from the first mover's side: 0 empty,
// 1-6 the mover's pieces, 7-12 the opponent's, 13 for a missing board.
export function encodeBoards(fens: readonly string[]): Uint8Array {
  const codes = new Uint8Array(BOARDS * SQUARES).fill(PADDED);
  const mover = fens[0]?.split(" ")[1];
  fens.slice(0, BOARDS).forEach((fen, board) => {
    codes.fill(0, board * SQUARES, (board + 1) * SQUARES);
    (fen.split(" ")[0] ?? "").split("/").forEach((row, rankIndex) => {
      let file = 0;
      for (const ch of row) {
        const empty = Number(ch);
        if (empty) {
          file += empty;
          continue;
        }
        const ours = (ch === ch.toUpperCase()) === (mover === "w");
        const rank = mover === "w" ? 7 - rankIndex : rankIndex;
        codes[board * SQUARES + rank * 8 + file] =
          PIECES.indexOf(ch.toUpperCase()) + (ours ? 1 : 7);
        file++;
      }
    });
  });
  return codes;
}

// For each kernel tap, the source square for every output square, or -1
// where the tap falls off the board.
const TAP_SOURCES = Array.from({ length: 9 }, (_, tap) =>
  Int8Array.from({ length: SQUARES }, (_, square) => {
    const y = Math.floor(square / 8) + Math.floor(tap / 3) - 1;
    const x = (square % 8) + (tap % 3) - 1;
    return y < 0 || y > 7 || x < 0 || x > 7 ? -1 : y * 8 + x;
  }),
);

function convolve(
  input: Float32Array,
  layer: BoardUnitModel["layers"][number],
) {
  const { inputs, outputs, weights, scales, biases } = layer;
  // Shift every input plane once per tap so the inner loop is contiguous.
  const shifted = new Float32Array(inputs * 9 * SQUARES);
  for (let i = 0; i < inputs; i++)
    TAP_SOURCES.forEach((sources, tap) => {
      const base = (i * 9 + tap) * SQUARES;
      sources.forEach((source, square) => {
        if (source >= 0)
          shifted[base + square] = input[i * SQUARES + source] ?? 0;
      });
    });
  const output = new Float32Array(outputs * SQUARES);
  const sums = new Float32Array(SQUARES);
  for (let o = 0; o < outputs; o++) {
    sums.fill(0);
    const row = o * inputs * 9;
    for (let k = 0; k < inputs * 9; k++) {
      const weight = weights[row + k] ?? 0;
      if (weight === 0) continue;
      const base = k * SQUARES;
      for (let square = 0; square < SQUARES; square++)
        sums[square] =
          (sums[square] ?? 0) + weight * (shifted[base + square] ?? 0);
    }
    const scale = scales[o] ?? 0,
      bias = biases[o] ?? 0;
    for (let square = 0; square < SQUARES; square++)
      output[o * SQUARES + square] = Math.max(
        0,
        (sums[square] ?? 0) * scale + bias,
      );
  }
  return output;
}

function dense(
  input: Float32Array,
  layer: BoardUnitModel["layers"][number],
  activate: boolean,
) {
  const { inputs, outputs, weights, scales, biases } = layer;
  const output = new Float32Array(outputs);
  for (let o = 0; o < outputs; o++) {
    let sum = 0;
    const row = o * inputs;
    for (let i = 0; i < inputs; i++)
      sum += (weights[row + i] ?? 0) * (input[i] ?? 0);
    const value = sum * (scales[o] ?? 0) + (biases[o] ?? 0);
    output[o] = activate ? Math.max(0, value) : value;
  }
  return output;
}

export function predictBoardUnits(
  model: BoardUnitModel,
  fens: readonly string[],
): BoardUnitPrediction[] {
  const codes = encodeBoards(fens);
  let activations = new Float32Array(BOARDS * PLANES * SQUARES);
  codes.forEach((code, index) => {
    const board = Math.floor(index / SQUARES);
    activations[(board * PLANES + code) * SQUARES + (index % SQUARES)] = 1;
  });
  model.layers.forEach((layer, index) => {
    activations =
      layer.kind === "conv"
        ? convolve(activations, layer)
        : dense(activations, layer, index < model.layers.length - 1);
  });
  const top = Math.max(...activations);
  const exp = Array.from(activations, (value) => Math.exp(value - top));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return model.units
    .map((unitId, index) => ({
      unitId,
      probability: (exp[index] ?? 0) / total,
    }))
    .sort((a, b) => b.probability - a.probability);
}
