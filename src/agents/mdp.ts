import type { Puzzle } from "../engine";
import { resolveRng, type Rng } from "../engine/rng";
import type { EvaluationStats, SolveResult } from "./types";

export interface MDPOptions {
  gamma?: number;
  slip?: number;
  maxDepth?: number;
  seed?: number;
  /** Value assigned to transitions leaving the explicit graph. */
  outsideValue?: number;
  /** Convergence tolerance on the maximum value change. */
  tol?: number;
  /** Safety cap on value-iteration rounds. */
  maxIterations?: number;
}

/**
 * Explicit Markov decision process built by breadth-first search from the solved
 * state up to depth `D`, then solved by value iteration.
 *
 * With probability `p` (slip) the executed action is replaced by a uniformly
 * random action, so the Bellman update averages over the stochastic outcome:
 *
 *   V(s) = max_a [ R + γ ( (1-p) V(s') + p · mean_{a'} V(s'') ) ]
 */
export class MDPAgent {
  readonly puzzle: Puzzle;
  readonly gamma: number;
  readonly slip: number;
  readonly maxDepth: number;
  readonly outsideValue: number;
  readonly tol: number;
  readonly maxIterations: number;

  private readonly rng: Rng;

  built = false;
  /** Value function, index 0 being the (absorbing) solved state. */
  V?: Float64Array;
  /** `next[s * nA + a]` is the successor index, or `-1` when outside the graph. */
  next?: Int32Array;
  /** State list, index 0 being the solved state. */
  states: Uint8Array[] = [];
  distance: number[] = [];
  /** Number of states in the graph. */
  N = 0;
  /** Number of value-iteration rounds performed. */
  iterations = 0;
  /** Maximum change per value-iteration round (convergence curve). */
  deltas: number[] = [];

  private index = new Map<string, number>();

  constructor(puzzle: Puzzle, options: MDPOptions = {}) {
    this.puzzle = puzzle;
    this.gamma = options.gamma ?? 0.95;
    this.slip = options.slip ?? 0.05;
    this.maxDepth = options.maxDepth ?? 5;
    this.outsideValue = options.outsideValue ?? -30;
    this.tol = options.tol ?? 1e-6;
    this.maxIterations = options.maxIterations ?? 2000;
    this.rng = resolveRng(options.seed);
  }

  /** Index of a state in the explicit graph, or `-1` when unknown. */
  indexOf(state: Uint8Array): number {
    const i = this.index.get(this.puzzle.key(state));
    return i === undefined ? -1 : i;
  }

  /** Builds the state graph by BFS up to `maxDepth`, then runs value iteration. */
  build(): { states: number; iterations: number } {
    const P = this.puzzle;
    const states: Uint8Array[] = [P.solved];
    const index = new Map<string, number>([[P.solvedKey, 0]]);
    const distance: number[] = [0];
    this.deltas = [];

    let frontier: number[] = [0];
    for (let d = 1; d <= this.maxDepth; d++) {
      const nextFrontier: number[] = [];
      for (const i of frontier) {
        for (let a = 0; a < P.nA; a++) {
          const child = P.apply(states[i], a);
          const key = P.key(child);
          if (!index.has(key)) {
            index.set(key, states.length);
            states.push(child);
            distance.push(d);
            nextFrontier.push(states.length - 1);
          }
        }
      }
      frontier = nextFrontier;
    }

    const N = states.length;
    const nA = P.nA;
    const next = new Int32Array(N * nA);
    for (let i = 0; i < N; i++) {
      for (let a = 0; a < nA; a++) {
        const j = index.get(P.key(P.apply(states[i], a)));
        next[i * nA + a] = j === undefined ? -1 : j;
      }
    }

    const V = new Float64Array(N);
    const g = this.gamma;
    const p = this.slip;
    let iterations = 0;
    let delta = Infinity;
    while (iterations < this.maxIterations && delta > this.tol) {
      delta = 0;
      iterations++;
      const updated = new Float64Array(N);
      for (let i = 1; i < N; i++) {
        const off = i * nA;
        let mean = 0;
        for (let a = 0; a < nA; a++) {
          const j = next[off + a];
          mean += j < 0 ? this.outsideValue : V[j];
        }
        mean /= nA;
        let best = -Infinity;
        for (let a = 0; a < nA; a++) {
          const j = next[off + a];
          const vj = j < 0 ? this.outsideValue : V[j];
          const q = -1 + g * ((1 - p) * vj + p * mean);
          if (q > best) best = q;
        }
        updated[i] = best;
        const change = Math.abs(best - V[i]);
        if (change > delta) delta = change;
      }
      V.set(updated);
      this.deltas.push(delta);
    }

    this.index = index;
    this.states = states;
    this.distance = distance;
    this.next = next;
    this.V = V;
    this.N = N;
    this.iterations = iterations;
    this.built = true;
    return { states: N, iterations };
  }

  /** Greedy solution following the value function, up to `maxSteps` moves. */
  solve(state: Uint8Array, maxSteps = 40): SolveResult {
    if (!this.built || !this.V || !this.next) return { solved: false, path: [] };
    const P = this.puzzle;
    const V = this.V;
    const next = this.next;
    let i = this.indexOf(state);
    const path: number[] = [];
    if (i < 0) return { solved: false, path, outside: true };

    for (let t = 0; t < maxSteps && i !== 0; t++) {
      let best = -Infinity;
      let bestAction = -1;
      for (let a = 0; a < P.nA; a++) {
        const j = next[i * P.nA + a];
        if (j >= 0 && V[j] > best) {
          best = V[j];
          bestAction = a;
        }
      }
      if (bestAction < 0) break;
      path.push(bestAction);
      i = next[i * P.nA + bestAction];
    }
    return { solved: i === 0, path };
  }

  /** Success rate over `trials` random scrambles of `depth`. */
  evaluateStats(depth: number, trials = 80): EvaluationStats {
    const P = this.puzzle;
    const maxSteps = Math.max(40, depth * 3 + 6);
    let ok = 0;
    let moves = 0;
    const start = now();
    for (let i = 0; i < trials; i++) {
      const result = this.solve(P.scramble(depth, this.rng), maxSteps);
      if (result.solved) {
        ok++;
        moves += result.path.length;
      }
    }
    const elapsed = now() - start;
    return {
      trials,
      rate: ok / trials,
      meanMoves: ok > 0 ? moves / ok : 0,
      meanTimeMs: elapsed / trials,
    };
  }
}

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
