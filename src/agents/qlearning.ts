import type { Puzzle } from "../engine";
import { resolveRng, type Rng } from "../engine/rng";
import { QStore } from "./qstore";
import type {
  AgentParams,
  EvaluationStats,
  LearningPoint,
  SolveResult,
} from "./types";
import { DEFAULT_PARAMS } from "./types";

export type QAlgorithm = "q" | "dq";

/**
 * Tabular Q-learning / Double Q-learning agent with curriculum learning,
 * pessimistic initialisation and retrospective replay (section 7 of the brief).
 */
export class QAgent {
  readonly puzzle: Puzzle;
  readonly algo: QAlgorithm;
  readonly params: AgentParams;
  readonly store: QStore;

  private readonly rng: Rng;
  private readonly init: number;

  /** Number of training episodes completed. */
  episodes = 0;
  /** Current curriculum level (scramble depth). */
  level = 1;
  /** Learning curve, one point per training epoch. */
  readonly history: LearningPoint[] = [];

  constructor(puzzle: Puzzle, algo: QAlgorithm, params: Partial<AgentParams> = {}) {
    this.puzzle = puzzle;
    this.algo = algo;
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.init = this.params.init;
    this.rng = resolveRng(this.params.seed);
    this.store = new QStore(puzzle.nA, this.init, this.params.maxStates);
  }

  /** True when the memory cap has been reached. */
  get full(): boolean {
    return this.store.full;
  }

  /** Number of stored states. */
  get nStates(): number {
    return this.store.size;
  }

  /** Estimated memory used by the Q-tables, in bytes (QA and QB are both allocated). */
  get memoryBytes(): number {
    return this.store.size * this.puzzle.nA * 4 * 2;
  }

  private randInt(n: number): number {
    return Math.floor(this.rng() * n);
  }

  /** Epsilon for the current curriculum level (linearly decays to `epsFinal`). */
  private get epsNow(): number {
    const { eps, epsFinal, maxDepth } = this.params;
    if (epsFinal === undefined || maxDepth <= 1) return eps;
    return eps + (epsFinal - eps) * ((this.level - 1) / (maxDepth - 1));
  }

  /** Value of action `a` in row `row`, summing QA and QB for Double Q-learning. */
  private valueAt(row: number, a: number): number {
    const off = row * this.puzzle.nA + a;
    const qa = this.store.table(0);
    if (this.algo === "q") return qa[off];
    return qa[off] + this.store.table(1)[off];
  }

  /** Greedy action for `row`, random tie-break. */
  private bestAction(row: number): number {
    const nA = this.puzzle.nA;
    let best = -Infinity;
    let picks: number[] = [];
    for (let a = 0; a < nA; a++) {
      const v = this.valueAt(row, a);
      if (v > best + 1e-9) {
        best = v;
        picks = [a];
      } else if (Math.abs(v - best) <= 1e-9) {
        picks.push(a);
      }
    }
    return picks.length > 0 ? picks[this.randInt(picks.length)] : 0;
  }

  /** Template target value and the table to update, per algorithm. */
  private target(row2: number, done: boolean): { table: 0 | 1; value: number } {
    const nA = this.puzzle.nA;
    const off = row2 * nA;
    const r = done ? 0 : -1;
    if (this.algo === "q") {
      const q = this.store.table(0);
      let best = -Infinity;
      for (let a = 0; a < nA; a++) {
        const v = q[off + a];
        if (v > best) best = v;
      }
      return { table: 0, value: done ? r : r + this.params.gamma * best };
    }
    const useA = this.rng() < 0.5;
    const updated: 0 | 1 = useA ? 0 : 1;
    const other: 0 | 1 = useA ? 1 : 0;
    const t = this.store.table(updated);
    const o = this.store.table(other);
    let best = -Infinity;
    let bestAction = 0;
    for (let a = 0; a < nA; a++) {
      const v = t[off + a];
      if (v > best) {
        best = v;
        bestAction = a;
      }
    }
    return { table: updated, value: done ? r : r + this.params.gamma * o[off + bestAction] };
  }

  /** Applies one learning update to the transition `(key, a) -> (key2, done)`. */
  private update(key: string, a: number, key2: string, done: boolean): void {
    const row = this.store.ensure(key);
    const row2 = this.store.ensure(key2);
    if (row < 0 || row2 < 0) return;
    const { table, value: target } = this.target(row2, done);
    const off = row * this.puzzle.nA + a;
    const q = this.store.table(table);
    q[off] += this.params.alpha * (target - q[off]);
  }

  /**
   * Retrospective replay: a scramble of `depth` moves is replayed backwards,
   * injecting real transitions `s_i -> s_{i-1}` (using the inverse action).
   */
  replay(depth: number): void {
    const P = this.puzzle;
    let state = P.solved;
    const trajectory: Uint8Array[] = [state];
    const actions: number[] = [];
    let last = -1;
    for (let i = 0; i < depth; i++) {
      let a: number;
      do {
        a = this.randInt(P.nA);
      } while (last >= 0 && a === (last ^ 1));
      state = P.apply(state, a);
      trajectory.push(state);
      actions.push(a);
      last = a;
    }
    for (let i = depth; i >= 1; i--) {
      const done = P.isSolved(trajectory[i - 1]);
      this.update(P.key(trajectory[i]), P.inv(actions[i - 1]), P.key(trajectory[i - 1]), done);
    }
  }

  /** Runs one training episode. */
  episode(): void {
    if (this.full) return;
    const P = this.puzzle;
    const d = this.params.exactLevelEpisodes ? this.level : 1 + this.randInt(this.level);
    const maxSteps = (this.params.stepMul ?? 3) * d + (this.params.stepAdd ?? 6);
    this.replay(d);

    let state = P.scramble(d, this.rng);
    let key = P.key(state);
    if (P.isSolved(state)) {
      this.episodes++;
      return;
    }
    for (let t = 0; t < maxSteps; t++) {
      const row = this.store.ensure(key);
      if (row < 0) return;
      let a = this.rng() < this.epsNow ? this.randInt(P.nA) : this.bestAction(row);
      if (this.rng() < this.params.slip) a = this.randInt(P.nA);
      const next = P.apply(state, a);
      const nextKey = P.key(next);
      const done = P.isSolved(next);
      this.update(key, a, nextKey, done);
      state = next;
      key = nextKey;
      if (done) break;
    }
    this.episodes++;
  }

  /**
   * Selects a solution from the current state, avoiding already-visited states
   * and stopping after `maxSteps` moves.
   */
  solve(state: Uint8Array, maxSteps = 40): SolveResult {
    const P = this.puzzle;
    const path: number[] = [];
    let current = state;
    const seen = new Set<string>([P.key(current)]);

    for (let t = 0; t < maxSteps; t++) {
      if (P.isSolved(current)) return { solved: true, path };
      const row = this.store.indexOf(P.key(current));
      if (row < 0) break;
      const order = Array.from({ length: P.nA }, (_, a) => a).sort(
        (x, y) => this.valueAt(row, y) - this.valueAt(row, x) + (this.rng() - 0.5) * 1e-6,
      );
      let moved = false;
      for (const a of order) {
        const next = P.apply(current, a);
        const key = P.key(next);
        if (seen.has(key)) continue;
        seen.add(key);
        path.push(a);
        current = next;
        moved = true;
        break;
      }
      if (!moved) break;
    }
    return { solved: P.isSolved(current), path };
  }

  /** Success rate over `trials` random scrambles of the given depth. */
  evaluate(depth: number, trials = 80): EvaluationStats {
    return this.evaluateStats(depth, trials);
  }

  evaluateStats(depth: number, trials = 80): EvaluationStats {
    const P = this.puzzle;
    const maxSteps = Math.max(40, (this.params.stepMul ?? 3) * depth + (this.params.stepAdd ?? 6));
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

  /**
   * One training epoch: `n` episodes, then evaluation at the current level.
   * The curriculum level is raised when the success rate exceeds the threshold.
   */
  epoch(n = 400, testTrials = 80, levelUpRate = 0.95): LearningPoint {
    for (let i = 0; i < n && !this.full; i++) this.episode();
    const rate = this.evaluateStats(this.level, testTrials).rate;
    const point: LearningPoint = {
      episode: this.episodes,
      level: this.level,
      rate,
      states: this.nStates,
    };
    this.history.push(point);
    if (rate >= levelUpRate && this.level < this.params.maxDepth) this.level++;
    return point;
  }
}

/** Wall-clock milliseconds; uses `performance` when available (browser/worker). */
function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
