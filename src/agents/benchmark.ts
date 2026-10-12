import { buildCube, buildMegaminx, type Puzzle } from "../engine";
import { MDPAgent } from "./mdp";
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
  /** Scramble depths probed for the robustness study (default 1..8). */
  robustnessDepths?: number[];
  /** Called with a short French-free status label between the workload steps. */
  onProgress?: (label: string) => void;
}

const PUZZLE_MAP: Record<PuzzleId, () => Puzzle> = {
  cube: buildCube,
  megaminx: buildMegaminx,
};

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
 * solution length and solving time at each requested depth. This is the single
 * source of the numbers shown on the home page and the results page.
 */
export function runBenchmark(options: BenchmarkOptions = {}): Promise<BenchmarkResult> {
  return Promise.resolve().then(() => runBenchmarkSync(options));
}

function runBenchmarkSync(options: BenchmarkOptions = {}): BenchmarkResult {
  const puzzles = options.puzzles ?? ["cube", "megaminx"];
  const algorithms = options.algorithms ?? ["q", "dq", "mdp"];
  const depths = options.depths ?? [1, 2, 3, 4, 5];
  const maxDepth = options.maxDepth ?? Math.max(...depths);
  const trials = options.trials ?? 80;
  const epochSize = options.epochSize ?? 400;
  const testTrials = options.testTrials ?? 100;
  const maxStates = options.maxStates ?? DEFAULT_PARAMS.maxStates;
  const seed = options.seed ?? 12345;
  const robustnessDepths = options.robustnessDepths ?? [1, 2, 3, 4, 5, 6, 7, 8];

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
        const agent = new MDPAgent(puzzle, {
          gamma: DEFAULT_PARAMS.gamma,
          slip: DEFAULT_PARAMS.slip,
          maxDepth: profile.mdpMaxDepth,
          seed,
        });
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
        onProgress(label(pid, algo, "robustesse (profondeurs 1..8)"));
        for (const depth of robustnessDepths) {
          const stats = agent.evaluateStats(depth, trials);
          robustness.push({
            puzzle: pid,
            algorithm: algo,
            depth,
            trials,
            successRate: stats.rate,
            trainedDepth: profile.mdpMaxDepth,
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
        onProgress: () => onProgress(label(pid, algo, `épisode ${agent.episodes.toLocaleString("en-US")}`)),
      });
      const trainTimeMs = now() - t0;

      for (const depth of evaluatedDepths) {
        const stats = agent.evaluateStats(depth, trials);
        cells.push({
          ...base,
          depth,
          states: agent.nStates,
          episodes: summary.episodes,
          trainTimeMs,
          successRate: stats.rate,
          meanMoves: stats.meanMoves,
          meanTimeMs: stats.meanTimeMs,
        });
      }
      onProgress(label(pid, algo, "robustesse (profondeurs 1..8)"));
      for (const depth of robustnessDepths) {
        const stats = agent.evaluateStats(depth, trials);
        robustness.push({
          puzzle: pid,
          algorithm: algo,
          depth,
          trials,
          successRate: stats.rate,
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