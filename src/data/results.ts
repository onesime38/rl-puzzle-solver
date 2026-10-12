import raw from "./results.json";
import type { Algorithm, BenchmarkCell, BenchmarkResult, PuzzleId, RobustnessCell } from "../agents";

export const results = raw as BenchmarkResult;

export function cellFor(puzzle: PuzzleId, algorithm: Algorithm, depth: number): BenchmarkCell | undefined {
  return results.cells.find((c) => c.puzzle === puzzle && c.algorithm === algorithm && c.depth === depth);
}

/** Robustness point (success rate at a scramble depth) for a puzzle/algorithm. */
export function robustnessFor(
  puzzle: PuzzleId,
  algorithm: Algorithm,
  depth: number,
): RobustnessCell | undefined {
  return results.robustness.find(
    (c) => c.puzzle === puzzle && c.algorithm === algorithm && c.depth === depth,
  );
}

/** Depths probed by the robustness study, sorted ascending. */
export const ROBUSTNESS_DEPTHS: number[] = Array.from(
  new Set(results.robustness.map((c) => c.depth)),
).sort((a, b) => a - b);

/** Curriculum depth each agent was trained to, per puzzle/algorithm. */
export function trainedDepthFor(puzzle: PuzzleId, algorithm: Algorithm): number {
  const cell = results.robustness.find((c) => c.puzzle === puzzle && c.algorithm === algorithm);
  return cell ? cell.trainedDepth : 0;
}

/** Success rate (%) of an algorithm on a puzzle at a given depth, or null. */
export function rateFor(puzzle: PuzzleId, algorithm: Algorithm, depth: number): number | null {
  const cell = cellFor(puzzle, algorithm, depth);
  return cell ? Math.round(cell.successRate * 100) : null;
}

export const ALGORITHM_LABELS: Record<Algorithm, string> = {
  q: "Q-learning",
  dq: "Double Q-learning",
  mdp: "Processus de Markov (MDP)",
};