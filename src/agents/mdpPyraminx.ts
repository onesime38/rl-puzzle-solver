import type { PyraminxPuzzle } from "../engine";
import { resolveRng, type Rng } from "../engine/rng";
import { StateTable } from "./stateTable";
import type { EvaluationStats, SolveResult } from "./types";

/** Exact number of reachable states of the tipless Pyraminx. */
export const PYRAMINX_STATES = 933_120;

export interface PyraminxMDPOptions {
  gamma?: number;
  slip?: number;
  /** Value assigned to transitions whose target is missing (should not happen). */
  outsideValue?: number;
  /** Convergence tolerance on the maximum value change. */
  tol?: number;
  maxIterations?: number;
  maxStates?: number;
  seed?: number;
}

export interface MDPProgress {
  phase: "graph" | "iteration";
  /** States discovered (graph phase) or iteration number (value-iteration phase). */
  progress: number;
  /** Total state count so far. */
  states: number;
}

export interface MDPBuildResult {
  states: number;
  iterations: number;
  cancelled: boolean;
}

const WORDS = 5;

/** Unpacks the 5 × 16-bit words into the 36 sticker colours. */
function unpack(words: Uint16Array, out: Uint8Array): void {
  for (let w = 0; w < WORDS; w++) {
    const word = words[w];
    for (let k = 0; k < 8; k++) {
      const i = w * 8 + k;
      if (i < out.length) out[i] = (word >> (2 * k)) & 3;
    }
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Exact Markov decision process for the Pyraminx.
 *
 * The complete reachable graph (EXACTLY 933,120 states) is enumerated by BFS
 * from the solved state and then solved by value iteration. Everything lives in
 * typed arrays — an open-addressing hash table over the 5 × 16-bit state key, a
 * packed state buffer, an `Int32Array(N · 8)` successor table and a
 * `Float32Array(N)` value function — so the whole agent stays well under the
 * 120 MB budget. Iteration yields to the event loop so the worker can report
 * progress and honour a cancellation request.
 */
export class PyraminxMDPAgent {
  readonly puzzle: PyraminxPuzzle;
  readonly gamma: number;
  readonly slip: number;
  readonly outsideValue: number;
  readonly tol: number;
  readonly maxIterations: number;
  readonly maxStates: number;

  private readonly rng: Rng;

  built = false;
  cancelled = false;
  V?: Float32Array;
  next?: Int32Array;
  N = 0;
  iterations = 0;
  deltas: number[] = [];

  private index?: StateTable;

  constructor(puzzle: PyraminxPuzzle, options: PyraminxMDPOptions = {}) {
    this.puzzle = puzzle;
    this.gamma = options.gamma ?? 0.95;
    this.slip = options.slip ?? 0.05;
    this.outsideValue = options.outsideValue ?? -30;
    this.tol = options.tol ?? 1e-4;
    this.maxIterations = options.maxIterations ?? 2000;
    this.maxStates = options.maxStates ?? PYRAMINX_STATES;
    this.rng = resolveRng(options.seed);
  }

  /** Index of `state` in the explicit graph, or `-1` when unknown. */
  indexOf(state: Uint8Array): number {
    if (!this.index) return -1;
    return this.index.find(this.puzzle.keyWords(state));
  }

  /** Runs the whole build synchronously (used by the tests and the CLI benchmark). */
  build(): MDPBuildResult {
    this.cancelled = false;
    for (const _ of this.run()) {
      void _;
    }
    this.built = !this.cancelled;
    return { states: this.N, iterations: this.iterations, cancelled: this.cancelled };
  }

  /** Runs the build cooperatively, yielding to the event loop between checkpoints. */
  async buildAsync(options: {
    onProgress?: (progress: MDPProgress) => void;
    shouldContinue?: () => boolean;
  } = {}): Promise<MDPBuildResult> {
    this.cancelled = false;
    for (const progress of this.run()) {
      if (options.shouldContinue && !options.shouldContinue()) {
        this.cancelled = true;
        break;
      }
      options.onProgress?.(progress);
      await yieldToEventLoop();
    }
    this.built = !this.cancelled;
    return { states: this.N, iterations: this.iterations, cancelled: this.cancelled };
  }

  /**
   * Core builder as a generator: yields a {@link MDPProgress} at every checkpoint
   * so the caller can report progress, cancel, or yield control.
   */
  private *run(): Generator<MDPProgress, void, void> {
    const P = this.puzzle;
    const n = P.n;
    const nA = P.nA;
    const maxStates = this.maxStates;

    const index = new StateTable(WORDS, maxStates, Math.min(maxStates, 1 << 20));
    const stateWords = new Uint16Array(maxStates * WORDS);
    const next = new Int32Array(maxStates * nA);
    const perms = P.perms;
    const scratch = new Uint8Array(n);
    const child = new Uint8Array(n);
    const childWords = new Uint16Array(WORDS);

    let count = 0;
    const solvedWords = P.keyWords(P.solved);
    index.intern(solvedWords);
    for (let w = 0; w < WORDS; w++) stateWords[w] = solvedWords[w];
    count++;

    this.deltas = [];

    let frontier: number[] = [0];
    let processed = 0;
    let sinceYield = 0;
    while (frontier.length > 0) {
      const nextFrontier: number[] = [];
      for (const i of frontier) {
        const base = i * WORDS;
        const words = stateWords.subarray(base, base + WORDS);
        unpack(words, scratch);
        const off = i * nA;
        for (let a = 0; a < nA; a++) {
          const perm = perms[a];
          for (let s = 0; s < n; s++) child[s] = scratch[perm[s]];
          P.keyWords(child, childWords);
          const row = index.intern(childWords);
          if (row === count) {
            const dest = count * WORDS;
            for (let w = 0; w < WORDS; w++) stateWords[dest + w] = childWords[w];
            nextFrontier.push(count);
            count++;
          }
          next[off + a] = row;
        }
        processed++;
        sinceYield++;
        if (sinceYield >= 25_000) {
          sinceYield = 0;
          const progress: MDPProgress = { phase: "graph", progress: processed, states: count };
          yield progress;
        }
      }
      frontier = nextFrontier;
    }

    const N = count;
    const V = new Float32Array(N);
    const updated = new Float32Array(N);
    const g = this.gamma;
    const p = this.slip;
    const outside = this.outsideValue;
    let iterations = 0;
    let delta = Infinity;
    while (iterations < this.maxIterations && delta > this.tol) {
      delta = 0;
      iterations++;
      for (let i = 1; i < N; i++) {
        const off = i * nA;
        let mean = 0;
        for (let a = 0; a < nA; a++) {
          const j = next[off + a];
          mean += j < 0 ? outside : V[j];
        }
        mean /= nA;
        let best = -Infinity;
        for (let a = 0; a < nA; a++) {
          const j = next[off + a];
          const vj = j < 0 ? outside : V[j];
          const q = -1 + g * ((1 - p) * vj + p * mean);
          if (q > best) best = q;
        }
        updated[i] = best;
        const change = Math.abs(best - V[i]);
        if (change > delta) delta = change;
      }
      V.set(updated);
      this.deltas.push(delta);
      yield { phase: "iteration", progress: iterations, states: N };
    }

    this.index = index;
    this.next = next;
    this.V = V;
    this.N = N;
    this.iterations = iterations;
    if (this.cancelled) return;
  }

  /** Greedy solution following the value function, up to `maxSteps` moves. */
  solve(state: Uint8Array, maxSteps = 40): SolveResult {
    if (!this.built || !this.V || !this.next) return { solved: false, path: [] };
    const P = this.puzzle;
    const nA = P.nA;
    const V = this.V;
    const next = this.next;
    let i = this.indexOf(state);
    const path: number[] = [];
    if (i < 0) return { solved: false, path, outside: true };

    for (let t = 0; t < maxSteps && i !== 0; t++) {
      const off = i * nA;
      let best = -Infinity;
      let bestAction = -1;
      for (let a = 0; a < nA; a++) {
        const j = next[off + a];
        if (j >= 0 && V[j] > best) {
          best = V[j];
          bestAction = a;
        }
      }
      if (bestAction < 0) break;
      path.push(bestAction);
      i = next[off + bestAction];
    }
    return { solved: i === 0, path };
  }

  /** Success rate over `trials` random scrambles of `depth`. */
  evaluateStats(depth: number, trials = 80): EvaluationStats {
    const P = this.puzzle;
    const maxSteps = Math.max(40, depth + 10);
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
