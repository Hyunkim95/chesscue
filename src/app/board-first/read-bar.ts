import {
  assessPosition,
  type AssessPosition,
} from "../../application/analyze-game/assess-position";
import { StockfishAnalysisEngine } from "../../infrastructure/engine/stockfish-analysis-engine";
import { serialEngine } from "./serial-engine";

// The Stockfish bar's own engine, shared by the moment and result screens, so
// reading a frame never waits behind a check or a search.
const barEngine = serialEngine(new StockfishAnalysisEngine());

export const readBar: AssessPosition = (fen, signal) =>
  assessPosition(barEngine, fen, signal);
