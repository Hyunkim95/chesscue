// The version of the stored game analysis. Bump it when the analysis or the
// theme classifier changes, so stored records are recomputed. E2E fixtures
// that seed analyses import it, so a bump cannot leave them stale.
export const ANALYSIS_VERSION = "stockfish-19-lite@4";

// Each position is searched to a fixed depth from a cleared hash, so the same
// game always gives the same best moves, moments and goals. A time budget
// alone did not: two runs disagreed on about a quarter of best moves. The time
// limit only caps a slow device; on the reference machine depth 12 is no
// slower than the old 120 ms budget (SLO-003).
export const GAME_ANALYSIS_SEARCH = {
  depth: 12,
  timeBudgetPerPositionMs: 1_500,
  multiPv: 3,
} as const;
