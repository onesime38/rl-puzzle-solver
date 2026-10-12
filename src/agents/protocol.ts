import type {
  Algorithm,
  AgentParams,
  BenchmarkConfig,
  BenchmarkResult,
  EvaluationStats,
  PuzzleId,
  SolveResult,
} from "./types";

/** Requests sent from the main thread to the training worker. */
export type WorkerRequest =
  | { type: "config"; id?: number; puzzle: PuzzleId; algo: Algorithm; params: Partial<AgentParams> }
  | { type: "start"; id?: number; maxEpisodes?: number }
  | { type: "pause"; id?: number }
  | { type: "reset"; id?: number }
  | { type: "solve"; id: number; state: number[]; maxSteps?: number; horizon?: number }
  | { type: "evaluate"; id: number; depth: number; trials?: number; horizon?: number }
  | { type: "benchmark"; id: number; config: BenchmarkConfig; planningHorizon?: number };

/** Responses sent from the training worker to the main thread. */
export type WorkerResponse =
  | { type: "configured"; id?: number }
  | { type: "status"; message: string }
  | { type: "training-started"; id?: number }
  | { type: "progress"; algo: Algorithm; level: number; episode: number; states: number; rate: number; full: boolean }
  | { type: "training-complete"; reason: "converged" | "budget" | "memory" | "paused"; episode: number; states: number; maxRate: number }
  | { type: "training-paused"; id?: number }
  | { type: "reset-done"; id?: number }
  | { type: "mdp-built"; id?: number; states: number; iterations: number; deltas: number[]; cancelled?: boolean }
  | { type: "mdp-progress"; phase: "graph" | "iteration"; states: number; iterations: number }
  | { type: "solve-result"; id: number; result: SolveResult }
  | { type: "eval-result"; id: number; depth: number; stats: EvaluationStats }
  | { type: "benchmark-result"; id: number; result: BenchmarkResult }
  | { type: "error"; id?: number; message: string };