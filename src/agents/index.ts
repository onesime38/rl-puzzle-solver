export { QAgent, type QAlgorithm } from "./qlearning";
export { MDPAgent, type MDPOptions } from "./mdp";
export { QStore } from "./qstore";
export { train, type TrainOptions, type TrainSummary } from "./train";
export { runBenchmark, type BenchmarkOptions } from "./benchmark";
export { SolverClient } from "./client";
export type {
  Algorithm,
  PuzzleId,
  AgentParams,
  BenchmarkCell,
  BenchmarkConfig,
  BenchmarkResult,
  EvaluationStats,
  LearningPoint,
  PuzzleProfile,
  RobustnessCell,
  SolveResult,
} from "./types";
export { DEFAULT_PARAMS, PUZZLE_PROFILES, agentParamsFor } from "./types";
export type { WorkerRequest, WorkerResponse } from "./protocol";