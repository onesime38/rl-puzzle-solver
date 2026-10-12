export type Algorithm = "q" | "dq" | "mdp";
export type PuzzleId = "cube" | "megaminx";

/** Hyper-parameters shared by the tabular agents. */
export interface AgentParams {
  /** Learning rate α. */
  alpha: number;
  /** Discount factor γ. */
  gamma: number;
  /** Exploration rate ε of the ε-greedy policy. */
  eps: number;
  /** Exploration rate reached at `maxDepth` (linear decay over the curriculum). */
  epsFinal?: number;
  /** Slip probability p: with probability p a uniformly random action is executed. */
  slip: number;
  /** Maximum curriculum depth (scramble length). */
  maxDepth: number;
  /** Pessimistic initial Q-value. */
  init: number;
  /** Hard cap on the number of stored states (Q rows). */
  maxStates: number;
  /** Train each curriculum level on scrambles of exactly that depth. */
  exactLevelEpisodes?: boolean;
  /** Episode length = `stepMul · d + stepAdd` for a scramble of depth `d`. */
  stepMul?: number;
  /** Episode length = `stepMul · d + stepAdd` for a scramble of depth `d`. */
  stepAdd?: number;
  /** Optional seed for reproducible runs. */
  seed?: number;
}

export const DEFAULT_PARAMS: AgentParams = {
  alpha: 0.5,
  gamma: 0.95,
  eps: 0.3,
  epsFinal: 0.15,
  slip: 0.05,
  maxDepth: 5,
  init: -15,
  maxStates: 1_000_000,
  exactLevelEpisodes: true,
  stepMul: 3,
  stepAdd: 6,
};

/**
 * Per-puzzle learning profile. The Megaminx has about 10⁶⁸ states, so tabular
 * learning only works on a bounded curriculum: Q-learning / Double Q-learning
 * converge at depth 3 (ε = 0.2, short episodes), while the MDP — which
 * enumerates the explicit graph — is run up to depth 4.
 */
export interface PuzzleProfile {
  /** Default `maxDepth` for Q-learning and Double Q-learning. */
  maxDepth: number;
  /** Maximum depth for the explicit MDP graph. */
  mdpMaxDepth: number;
  stepMul: number;
  stepAdd: number;
  eps: number;
  epsFinal?: number;
  targetRate?: number;
  stopRate?: number;
  maxEpisodes?: number;
}

export const PUZZLE_PROFILES: Record<PuzzleId, PuzzleProfile> = {
  cube: {
    maxDepth: 5,
    mdpMaxDepth: 5,
    stepMul: 3,
    stepAdd: 6,
    eps: 0.3,
    epsFinal: 0.15,
  },
  megaminx: {
    maxDepth: 3,
    mdpMaxDepth: 4,
    stepMul: 1,
    stepAdd: 3,
    eps: 0.2,
    epsFinal: 0.2,
    targetRate: 0.95,
    stopRate: 0.95,
    maxEpisodes: 120_000,
  },
};

/** Default hyper-parameters for a puzzle, overlaid with `overrides`. */
export function agentParamsFor(puzzle: PuzzleId, overrides: Partial<AgentParams> = {}): AgentParams {
  const profile = PUZZLE_PROFILES[puzzle];
  return {
    ...DEFAULT_PARAMS,
    maxDepth: profile.maxDepth,
    stepMul: profile.stepMul,
    stepAdd: profile.stepAdd,
    eps: profile.eps,
    epsFinal: profile.epsFinal ?? profile.eps,
    ...overrides,
  };
}

/** One point of the learning curve. */
export interface LearningPoint {
  episode: number;
  level: number;
  rate: number;
  states: number;
}

export interface SolveResult {
  solved: boolean;
  path: number[];
  /** True when the MDP graph does not contain the state (scramble too deep). */
  outside?: boolean;
}

export interface EvaluationStats {
  trials: number;
  rate: number;
  meanMoves: number;
  meanTimeMs: number;
}

export interface BenchmarkCell {
  puzzle: PuzzleId;
  algorithm: Algorithm;
  depth: number;
  trials: number;
  successRate: number;
  meanMoves: number;
  meanTimeMs: number;
  /** Number of states stored by the Q-table or built in the MDP graph. */
  states: number;
  /** Number of training episodes (Q-learning variants). */
  episodes: number;
  /** Number of value-iteration rounds (MDP). */
  iters: number;
  /** Total training time in milliseconds. */
  trainTimeMs: number;
}

export interface BenchmarkConfig {
  puzzles: PuzzleId[];
  algorithms: Algorithm[];
  depths: number[];
  maxDepth: number;
  trials: number;
  maxEpisodes: number;
  epochSize: number;
  testTrials: number;
  maxStates: number;
  seed?: number;
  /** Scramble depths probed for the robustness study (may exceed the trained depth). */
  robustnessDepths: number[];
}

/** One point of the robustness study: success rate at a scramble depth. */
export interface RobustnessCell {
  puzzle: PuzzleId;
  algorithm: Algorithm;
  depth: number;
  trials: number;
  successRate: number;
  /** Depth the agent was actually trained to (for the same puzzle/algorithm). */
  trainedDepth: number;
}

export interface BenchmarkResult {
  generatedAt: string;
  config: BenchmarkConfig;
  cells: BenchmarkCell[];
  /**
   * Success rate versus scramble depth (1..8 by default), measured on the
   * agent trained at its curriculum depth. Shows the expected drop once the
   * scramble is deeper than what the agent learned.
   */
  robustness: RobustnessCell[];
}
