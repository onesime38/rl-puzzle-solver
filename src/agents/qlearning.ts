import type { Puzzle } from "../engine";
import { resolveRng, type Rng } from "../engine/rng";
import { createQStore, type QTableStore } from "./qstore";
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
 * pessimistic initialisation and retrospective replay.
 *
 * The Q-values are stored in a {@link QTableStore}. For the Pyraminx that store
 * is a typed-array hash table (no `Map`, no per-state object), which keeps the
 * whole tabular agent well within the memory budget.
 *
 * An optional bounded **look-ahead** (planification à horizon `k`) evaluates the
 * agent's Q-values `k` plies deep, which lets a policy trained to depth `d`
 * solve scrambles up to depth `d + k`.
 */
export class QAgent {
  readonly puzzle: Puzzle;
  readonly algo: QAlgorithm;
  readonly params: AgentParams;
  readonly store: QTableStore;

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
    this.store = createQStore(puzzle, puzzle.nA, this.init, this.params.maxStates);
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

  /** Applies one learning update to the transition `(state, a) -> (next, done)`. */
  private update(state: Uint8Array, a: number, next: Uint8Array, done: boolean): void {
    const row = this.store.ensure(state);
    const row2 = this.store.ensure(next);
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
      this.update(trajectory[i], P.inv(actions[i - 1]), trajectory[i - 1], done);
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
    if (P.isSolved(state)) {
      this.episodes++;
      return;
    }
    for (let t = 0; t < maxSteps; t++) {
      const row = this.store.ensure(state);
      if (row < 0) return;
      let a = this.rng() < this.epsNow ? this.randInt(P.nA) : this.bestAction(row);
      if (this.rng() < this.params.slip) a = this.randInt(P.nA);
      const next = P.apply(state, a);
      const done = P.isSolved(next);
      this.update(state, a, next, done);
      state = next;
      if (done) break;
    }
    this.episodes++;
  }

  /** Best value estimate of `state` (max over actions), or the pessimistic init. */
  private stateValue(state: Uint8Array): number {
    const row = this.store.indexOf(state);
    if (row < 0) return this.init;
    const nA = this.puzzle.nA;
    let best = -Infinity;
    for (let a = 0; a < nA; a++) {
      const v = this.valueAt(row, a);
      if (v > best) best = v;
    }
    return best;
  }

  /**
   * Bounded look-ahead value: maximum discounted return over every action
   * sequence of length `h`, with the learned value as a leaf estimate.
   */
  private planValue(state: Uint8Array, h: number): number {
    const P = this.puzzle;
    if (P.isSolved(state)) return 0;
    if (h <= 0) return this.stateValue(state);
    let best = -Infinity;
    for (let a = 0; a < P.nA; a++) {
      const v = -1 + this.params.gamma * this.planValue(P.apply(state, a), h - 1);
      if (v > best) best = v;
    }
    return best;
  }

  /**
   * Selects a solution from the current state.
   *
   * `horizon > 0` enables the explicit look-ahead planner: at each step the best
   * action is chosen by evaluating `horizon` plies ahead. `horizon = 0` is the
   * pure greedy policy (the historical behaviour).
   */
  solve(state: Uint8Array, maxSteps = 40, horizon = 0): SolveResult {
    const P = this.puzzle;
    const path: number[] = [];
    let current = state;
    const seen = new Set<string>([P.key(current)]);

    for (let t = 0; t < maxSteps; t++) {
      if (P.isSolved(current)) return { solved: true, path };
      const row = this.store.indexOf(current);
      if (row < 0 && horizon <= 0) break;

      let action = -1;
      if (horizon > 0) {
        let best = -Infinity;
        for (let a = 0; a < P.nA; a++) {
          const next = P.apply(current, a);
          const v = -1 + this.params.gamma * this.planValue(next, horizon - 1);
          if (v > best) {
            best = v;
            action = a;
          }
        }
      } else {
        const order = Array.from({ length: P.nA }, (_, a) => a).sort(
          (x, y) => this.valueAt(row, y) - this.valueAt(row, x) + (this.rng() - 0.5) * 1e-6,
        );
        for (const a of order) {
          if (!seen.has(P.key(P.apply(current, a)))) {
            action = a;
            break;
          }
        }
      }
      if (action < 0) break;

      const next = P.apply(current, action);
      const key = P.key(next);
      if (horizon <= 0) {
        if (seen.has(key)) break;
        seen.add(key);
      } else {
        seen.add(key);
      }
      path.push(action);
      current = next;
    }
    return { solved: P.isSolved(current), path };
  }

  /** Success rate over `trials` random scrambles of the given depth. */
  evaluate(depth: number, trials = 80, horizon = 0): EvaluationStats {
    return this.evaluateStats(depth, trials, horizon);
  }

  evaluateStats(depth: number, trials = 80, horizon = 0): EvaluationStats {
    const P = this.puzzle;
    const maxSteps = Math.max(40, (this.params.stepMul ?? 3) * depth + (this.params.stepAdd ?? 6));
    let ok = 0;
    let moves = 0;
    const start = now();
    for (let i = 0; i < trials; i++) {
      const result = this.solve(P.scramble(depth, this.rng), maxSteps, horizon);
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
