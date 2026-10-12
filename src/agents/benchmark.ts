import { buildCube, buildPyraminx, type Puzzle } from "../engine";
import { MDPAgent } from "./mdp";
import { PyraminxMDPAgent } from "./mdpPyraminx";
import { QAgent } from "./qlearning";
import { train } from "./train";
import type {
  Algorithm,
  AgentParams,
  BenchmarkCell,
  BenchmarkConfig,
  BenchmarkResult,
  EvaluationStats,
  PuzzleId,
  RobustnessCell,
} from "./types";
import { DEFAULT_PARAMS, PUZZLE_PROFILES } from "./types";

export interface BenchmarkOptions {
  puzzles?: PuzzleId[];
  algorithms?: Algorithm[];
  depths?: number[];
  maxDepth?: number;
  trials?: number;
  maxEpisodes?: number;
  epochSize?: number;
  testTrials?: number;
  maxStates?: number;
  seed?: number;
  /** Scramble depths probed for the robustness study (default 1..11). */
  robustnessDepths?: number[];
  /** Look-ahead horizon used for the planning evaluation of Q/DQ. */
  planningHorizon?: number;
  /** Called with a short status label between the workload steps. */
  onProgress?: (label: string) => void;
}

const PUZZLE_MAP: Record<PuzzleId, () => Puzzle> = {
  cube: buildCube,
  pyraminx: buildPyraminx,
};

/** Minimal common surface shared by the two MDP implementations. */
interface MDPLike {
  build(): { states: number; iterations: number };
  solve(state: Uint8Array, maxSteps?: number): { solved: boolean; path: number[]; outside?: boolean };
  evaluateStats(depth: number, trials?: number): EvaluationStats;
  indexOf(state: Uint8Array): number;
}

/** Depth-limited graph for the cube, complete graph for the Pyraminx. */
function makeMDP(pid: PuzzleId, puzzle: Puzzle, seed: number, maxStates: number): MDPLike {
  const profile = PUZZLE_PROFILES[pid];
  if (pid === "pyraminx") {
    return new PyraminxMDPAgent(puzzle as ReturnType<typeof buildPyraminx>, {
      gamma: DEFAULT_PARAMS.gamma,
      slip: DEFAULT_PARAMS.slip,
      maxStates,
      seed,
    });
  }
  return new MDPAgent(puzzle, {
    gamma: DEFAULT_PARAMS.gamma,
    slip: DEFAULT_PARAMS.slip,
    maxDepth: profile.mdpMaxDepth,
    seed,
  });
}

/** Graph actually built by the MDP for a puzzle (complete for the Pyraminx). */
function mdpBuildDepth(pid: PuzzleId): number {
  return pid === "pyraminx" ? PUZZLE_PROFILES.pyraminx.mdpMaxDepth : PUZZLE_PROFILES[pid].mdpMaxDepth;
}

/** Depths actually evaluated for a puzzle/algorithm pair (per-puzzle caps). */
function depthsFor(pid: PuzzleId, algo: Algorithm, depths: number[]): number[] {
  const profile = PUZZLE_PROFILES[pid];
  const cap = algo === "mdp" ? profile.mdpMaxDepth : profile.maxDepth;
  return depths.filter((d) => d <= cap);
}

function label(pid: PuzzleId, algo: Algorithm, step: string): string {
  return `${pid}/${algo}: ${step}`;
}

/**
 * Runs the full benchmark: trains (or builds) every algorithm on every puzzle
 * up to its per-puzzle depth cap, then measures the success rate, mean
 * solution length and solving time at each requested depth — once with the
 * pure greedy policy and once with the bounded look-ahead planner. This is the
 * single source of the numbers shown on the home page and the results page.
 */
export function runBenchmark(options: BenchmarkOptions = {}): Promise<BenchmarkResult> {
  return Promise.resolve().then(() => runBenchmarkSync(options));
}

function runBenchmarkSync(options: BenchmarkOptions = {}): BenchmarkResult {
  const puzzles = options.puzzles ?? ["cube", "pyraminx"];
  const algorithms = options.algorithms ?? ["q", "dq", "mdp"];
  const depths = options.depths ?? [1, 2, 3, 4, 5, 6, 7, 8];
  const maxDepth = options.maxDepth ?? Math.max(...depths);
  const trials = options.trials ?? 80;
  const epochSize = options.epochSize ?? 600;
  const testTrials = options.testTrials ?? 100;
  const maxStates = options.maxStates ?? DEFAULT_PARAMS.maxStates;
  const seed = options.seed ?? 12345;
  const robustnessDepths = options.robustnessDepths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const planningHorizon = options.planningHorizon ?? PUZZLE_PROFILES.pyraminx.planningHorizon ?? 4;

  const config: BenchmarkConfig = {
    puzzles,
    algorithms,
    depths,
    maxDepth,
    trials,
    maxEpisodes: options.maxEpisodes ?? 400_000,
    epochSize,
    testTrials,
    maxStates,
    seed,
    robustnessDepths,
  };

  const cells: BenchmarkCell[] = [];
  const robustness: RobustnessCell[] = [];
  const onProgress = options.onProgress ?? (() => {});

  for (const pid of puzzles) {
    const puzzle = PUZZLE_MAP[pid]();
    const profile = PUZZLE_PROFILES[pid];
    const maxEpisodes = options.maxEpisodes ?? profile.maxEpisodes ?? 400_000;
    const horizon = pid === "pyraminx" ? planningHorizon : 0;

    for (const algo of algorithms) {
      const evaluatedDepths = depthsFor(pid, algo, depths);
      const base: Omit<BenchmarkCell, "depth" | "successRate" | "meanMoves" | "meanTimeMs"> = {
        puzzle: pid,
        algorithm: algo,
        trials,
        states: 0,
        episodes: 0,
        iters: 0,
        trainTimeMs: 0,
      };

      if (algo === "mdp") {
        onProgress(label(pid, algo, "construction du graphe et itération de valeur"));
        const agent = makeMDP(pid, puzzle, seed, maxStates);
        const t0 = now();
        const { states, iterations } = agent.build();
        const trainTimeMs = now() - t0;
        for (const depth of evaluatedDepths) {
          const stats = agent.evaluateStats(depth, trials);
          cells.push({
            ...base,
            depth,
            states,
            iters: iterations,
            trainTimeMs,
            successRate: stats.rate,
            meanMoves: stats.meanMoves,
            meanTimeMs: stats.meanTimeMs,
          });
        }
        onProgress(label(pid, algo, "robustesse (profondeurs 1..11)"));
        const trainedDepth = mdpBuildDepth(pid);
        for (const depth of robustnessDepths) {
          const stats = agent.evaluateStats(depth, trials);
          robustness.push({
            puzzle: pid,
            algorithm: algo,
            depth,
            trials,
            successRate: stats.rate,
            trainedDepth,
          });
        }
        continue;
      }

      onProgress(label(pid, algo, "entraînement par curriculum"));
      const baseParams: AgentParams = {
        ...DEFAULT_PARAMS,
        maxDepth: profile.maxDepth,
        maxStates,
        seed,
        stepMul: profile.stepMul,
        stepAdd: profile.stepAdd,
        eps: profile.eps,
        epsFinal: profile.epsFinal ?? profile.eps,
      };
      const agent = new QAgent(puzzle, algo, baseParams);
      const t0 = now();
      const summary = train(agent, {
        maxEpisodes,
        epochSize,
        testTrials,
        targetRate: profile.targetRate ?? 0.95,
        stopRate: profile.stopRate ?? 0.97,
        stopEpochs: Math.max(1, Math.min(3, profile.maxDepth)),
        onProgress: () => {
          if (agent.episodes % (epochSize * 10) < epochSize) {
            onProgress(label(pid, algo, `épisode ${agent.episodes.toLocaleString("en-US")}`));
          }
        },
      });
      const trainTimeMs = now() - t0;

      for (const depth of evaluatedDepths) {
        const stats = agent.evaluateStats(depth, trials);
        const planned = horizon > 0 ? agent.evaluateStats(depth, trials, horizon) : undefined;
        cells.push({
          ...base,
          depth,
          states: agent.nStates,
          episodes: summary.episodes,
          trainTimeMs,
          successRate: stats.rate,
          meanMoves: stats.meanMoves,
          meanTimeMs: stats.meanTimeMs,
          planningHorizon: planned ? horizon : undefined,
          planningSuccessRate: planned?.rate,
          planningMeanMoves: planned?.meanMoves,
          planningMeanTimeMs: planned?.meanTimeMs,
        });
      }
      onProgress(label(pid, algo, "robustesse (profondeurs 1..11)"));
      for (const depth of robustnessDepths) {
        const stats = agent.evaluateStats(depth, trials);
        const planned = horizon > 0 ? agent.evaluateStats(depth, trials, horizon) : undefined;
        robustness.push({
          puzzle: pid,
          algorithm: algo,
          depth,
          trials,
          successRate: stats.rate,
          planningSuccessRate: planned?.rate,
          trainedDepth: agent.level,
        });
      }
    }
  }

  return { generatedAt: new Date().toISOString(), config, cells, robustness };
}

/** Re-exported so callers can reuse the same stats type for single evaluations. */
export type { EvaluationStats };

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
